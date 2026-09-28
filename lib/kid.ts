// KID Identity Provider (https://dash.kid.koompi.org) — server-side helpers.
//
// KID replaces the `state` we send with its own (it uses it to look up its
// server-side PKCE record), so next-auth's built-in OAuth provider can't be
// used: its state check would reject every login. Instead:
//   /api/kid/login     → redirect to KID (with a nonce stored in a cookie)
//   /api/kid/callback  → exchange the code, find/link the local user, then
//                        hand a short-lived signed token to the "kid"
//                        credentials provider in lib/auth.ts, which creates
//                        the normal next-auth session.

import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";
import { appBaseUrl } from "@/lib/leaveServer";

export const KID_API = (process.env.KID_BASE_URL ?? "https://api.kid.koompi.org").replace(/\/$/, "");

// profile.telegram must also be enabled on the KID project for telegram_id to be returned
export const KID_SCOPES = "openid profile.basic profile.contact profile.telegram";

export const KID_NONCE_COOKIE = "kid_nonce";
export const KID_CALLBACK_COOKIE = "kid_cb";
export const KID_LOGIN_COOKIE = "kid_login";
const LOGIN_TOKEN_PURPOSE = "kid-login";

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
};

type KidTokenResponse = {
  access_token: string;
  id_token?:    string;
  user?:        KidUser;
};

/** Exchange the authorization code (KID needs the `state` it put on the callback). */
export async function exchangeKidCode(code: string, state: string | null): Promise<KidTokenResponse> {
  const cfg = kidConfig();
  if (!cfg) throw new Error("KID is not configured (KID_CLIENT_ID / KID_CLIENT_SECRET)");

  const res = await fetch(`${KID_API}/oauth/token`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type:    "authorization_code",
      code,
      client_id:     cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri:  cfg.redirectUri,
      ...(state ? { state } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`KID token exchange failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const tokens: KidTokenResponse = await res.json();

  // Older responses may not embed the user — fall back to /oauth/userinfo
  if (!tokens.user?.sub) {
    const info = await fetch(`${KID_API}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal:  AbortSignal.timeout(15_000),
    });
    if (!info.ok) throw new Error(`KID userinfo failed (${info.status})`);
    tokens.user = await info.json();
  }
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

  const account = await prisma.account.findUnique({
    where:   { provider_providerAccountId: { provider: "kid", providerAccountId: k.sub } },
    include: { user: true },
  });

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

/** Short-lived token the login page trades for a next-auth session. */
export function signKidLoginToken(userId: string): string {
  return jwt.sign({ userId, purpose: LOGIN_TOKEN_PURPOSE }, process.env.NEXTAUTH_SECRET as string, {
    expiresIn: "2m",
  });
}

export function verifyKidLoginToken(token: string): string | null {
  try {
    const p = jwt.verify(token, process.env.NEXTAUTH_SECRET as string) as { userId?: string; purpose?: string };
    return p.purpose === LOGIN_TOKEN_PURPOSE && p.userId ? p.userId : null;
  } catch {
    return null;
  }
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
