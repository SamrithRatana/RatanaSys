// KID Identity Provider (https://dash.kid.koompi.org) — server-side helpers.
//
// Standard authorization code + PKCE (S256) flow, as KID documents it
// (https://www.npmjs.com/package/@kid-oauth/sdk → llms.txt, "OAuth and OpenID
// Connect"). Done by hand instead of through next-auth's OAuth provider so the
// login and callback each set exactly one cookie (see KID_STATE_COOKIE):
//   /api/kid/login     → redirect to KID with our own state + code_challenge
//                        (state, verifier, nonce kept in one cookie)
//   /api/kid/callback  → check state, exchange the code with the verifier,
//                        find/link the local user, then set the normal
//                        next-auth session cookie directly.
//
// KID used to replace our `state` with its own when no code_challenge was
// sent (an older server-side PKCE mode); that mode is now only a fallback and
// failed token exchanges with a 500, so always send our own PKCE.

import crypto from "crypto";
import prisma from "@/lib/prisma";
import { appBaseUrl } from "@/lib/leaveServer";

export const KID_API = (process.env.KID_BASE_URL ?? "https://api.kid.koompi.org").replace(/\/$/, "");

// profile.telegram must also be enabled on the KID project for telegram_id to be returned
export const KID_SCOPES = "openid profile.basic profile.contact profile.telegram";

// ONE cookie per response: the Koompi proxy in front of the app forwards only
// the last Set-Cookie header of a response, so a response that sets two
// cookies silently loses the first one.
export const KID_STATE_COOKIE = "kid_state";

const PKCE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/** Random string of PKCE-safe characters (also fine for state / nonce). */
export function randomKidString(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += PKCE_CHARS[bytes[i] % PKCE_CHARS.length];
  return out;
}

/** S256 code_challenge for a verifier: BASE64URL(SHA256(verifier)). */
export function pkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export type KidState = {
  state:        string;
  codeVerifier: string;
  nonce:        string;
  callbackPath: string;
};

/** Everything the callback needs, packed into the single kid_state cookie. */
export function packKidState(s: KidState): string {
  return Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
}

export function unpackKidState(raw: string | undefined): Partial<KidState> {
  if (!raw) return {};
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return v && typeof v === "object" ? v : {};
  } catch {
    return {}; // cookie from the old (pre-PKCE) login, or tampered
  }
}

export function kidConfig() {
  const clientId     = process.env.KID_CLIENT_ID;
  const clientSecret = process.env.KID_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: `${appBaseUrl()}/api/kid/callback` };
}

export type KidUser = {
  sub:             string;
  kid?:            string | null;
  name?:           string;
  preferred_username?: string;
  picture?:        string;
  email?:          string;
  email_verified?: boolean;
  telegram_id?:    number | string | null;
  // Accounts KID merged into this one (their old `sub`s)
  merged_from?:    { sub: string; kid?: string | null }[];
};

type KidTokenResponse = {
  access_token: string;
  id_token?:    string;
  user?:        KidUser;
};

/** A non-OK answer from KID itself (as opposed to a failure on our side). */
export class KidHttpError extends Error {
  constructor(readonly step: "token" | "userinfo", readonly status: number, body: string) {
    super(`KID ${step} request failed (${status}): ${body.slice(0, 300)}`);
    this.name = "KidHttpError";
  }
}

/** fetch() that retries once when KID answers 5xx or the connection fails. */
async function kidFetch(step: "token" | "userinfo", url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
      if (res.ok) return res;
      const body = await res.text().catch(() => "");
      if (res.status >= 500 && attempt < 2) {
        console.warn(`[KID] ${step} answered ${res.status}, retrying once: ${body.slice(0, 200)}`);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw new KidHttpError(step, res.status, body);
    } catch (err) {
      if (err instanceof KidHttpError || attempt >= 2) throw err;
      console.warn(`[KID] ${step} request failed, retrying once:`, err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

/** Exchange the authorization code with its PKCE verifier (state is NOT sent). */
export async function exchangeKidCode(code: string, codeVerifier: string): Promise<KidTokenResponse> {
  const cfg = kidConfig();
  if (!cfg) throw new Error("KID is not configured (KID_CLIENT_ID / KID_CLIENT_SECRET)");

  const res = await kidFetch("token", `${KID_API}/oauth/token`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type:    "authorization_code",
      code,
      client_id:     cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri:  cfg.redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  const tokens: KidTokenResponse = await res.json();

  // Older responses may not embed the user — fall back to /oauth/userinfo
  if (!tokens.user?.sub) {
    const info = await kidFetch("userinfo", `${KID_API}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" },
    });
    tokens.user = await info.json();
  }
  if (!tokens.user?.sub) throw new Error("KID returned no user (missing sub)");
  return tokens;
}

/** Payload of an id_token we received directly from KID's token endpoint (over TLS). */
export function idTokenNonce(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.nonce === "string" ? payload.nonce : null;
  } catch {
    return null;
  }
}

/**
 * Find the local user for a KID identity, linking or creating as needed:
 *   1. already linked (Account provider "kid", providerAccountId = sub)
 *   2. same verified email
 *   3. same Telegram ID (needs the profile.telegram scope)
 *   4. otherwise a new USER account
 * Only KID-verified identifiers are used for matching — never display names.
 */
export async function findOrLinkKidUser(k: KidUser) {
  const telegramId = k.telegram_id ? String(k.telegram_id) : null;
  const email      = k.email && k.email_verified ? k.email.trim() : null;

  let account = await prisma.account.findUnique({
    where:   { provider_providerAccountId: { provider: "kid", providerAccountId: k.sub } },
    include: { user: true },
  });

  // KID merged an account this user signed in with before: move the link
  // from the closed account's sub to the surviving one.
  const mergedSubs = (k.merged_from ?? []).map((m) => m?.sub).filter((s): s is string => !!s);
  if (!account && mergedSubs.length > 0) {
    const old = await prisma.account.findFirst({
      where:   { provider: "kid", providerAccountId: { in: mergedSubs } },
      include: { user: true },
    });
    if (old) {
      account = await prisma.account.update({
        where:   { id: old.id },
        data:    { providerAccountId: k.sub },
        include: { user: true },
      });
    }
  }

  let user = account?.user ?? null;
  if (!user && email) {
    user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  }
  if (!user && telegramId) {
    user = await prisma.user.findFirst({ where: { telegramId } });
  }

  if (!user) {
    const [emailTaken, tgTaken] = await Promise.all([
      email      ? prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } }) : null,
      telegramId ? prisma.user.findFirst({ where: { telegramId }, select: { id: true } }) : null,
    ]);
    user = await prisma.user.create({
      data: {
        name:       k.name || k.preferred_username || k.kid || "KID user",
        email:      email && !emailTaken ? email : null,
        image:      k.picture ?? null,
        telegramId: telegramId && !tgTaken ? telegramId : null,
      },
    });
  } else {
    // Fill in what the local account is missing (never overwrite existing values)
    const patch: { image?: string; telegramId?: string; email?: string } = {};
    if (k.picture && (!user.image || user.image.includes("ui-avatars"))) patch.image = k.picture;
    if (telegramId && !user.telegramId &&
        !(await prisma.user.findFirst({ where: { telegramId }, select: { id: true } }))) {
      patch.telegramId = telegramId;
    }
    if (email && !user.email &&
        !(await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } }))) {
      patch.email = email;
    }
    if (Object.keys(patch).length > 0) {
      user = await prisma.user.update({ where: { id: user.id }, data: patch });
    }
  }

  if (!account) {
    await prisma.account.create({
      data: { userId: user.id, type: "oauth", provider: "kid", providerAccountId: k.sub },
    });
  }
  return user;
}

/** Only allow redirects back into this app (no open redirects). */
export function safeCallbackPath(raw: string | null | undefined): string {
  if (!raw) return "/portal";
  try {
    const url = new URL(raw, appBaseUrl());
    if (url.origin !== new URL(appBaseUrl()).origin) return "/portal";
    return url.pathname + url.search || "/portal";
  } catch {
    return "/portal";
  }
}
