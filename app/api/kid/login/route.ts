import { NextRequest, NextResponse } from "next/server";
import {
  KID_API, KID_SCOPES, KID_STATE_COOKIE,
  kidConfig, packKidState, pkceChallenge, randomKidString, safeCallbackPath,
} from "@/lib/kid";
import { appBaseUrl } from "@/lib/leaveServer";

export const dynamic = "force-dynamic";

// GET /api/kid/login?callbackUrl=/portal → send the user to KID to sign in
export async function GET(req: NextRequest) {
  const cfg = kidConfig();
  if (!cfg) {
    return NextResponse.redirect(`${appBaseUrl()}/login?kidError=not_configured`);
  }

  const state        = randomKidString(32);
  const codeVerifier = randomKidString(64);
  const nonce        = randomKidString(32);

  const url = new URL(`${KID_API}/oauth`);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", KID_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", pkceChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("nonce", nonce);

  // Exactly one Set-Cookie (see KID_STATE_COOKIE)
  const res = NextResponse.redirect(url.toString());
  res.cookies.set(
    KID_STATE_COOKIE,
    packKidState({
      state, codeVerifier, nonce,
      callbackPath: safeCallbackPath(req.nextUrl.searchParams.get("callbackUrl")),
    }),
    {
      httpOnly: true,
      secure:   appBaseUrl().startsWith("https://"),
      sameSite: "lax",
      path:     "/api/kid",
      maxAge:   15 * 60,
    },
  );
  return res;
}
