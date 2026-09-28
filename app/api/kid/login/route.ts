import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  KID_API, KID_SCOPES, KID_STATE_COOKIE,
  kidConfig, packKidState, safeCallbackPath,
} from "@/lib/kid";
import { appBaseUrl } from "@/lib/leaveServer";

export const dynamic = "force-dynamic";

// GET /api/kid/login?callbackUrl=/portal → send the user to KID to sign in
export async function GET(req: NextRequest) {
  const cfg = kidConfig();
  if (!cfg) {
    return NextResponse.redirect(`${appBaseUrl()}/login?kidError=not_configured`);
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const url = new URL(`${KID_API}/oauth`);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("scope", KID_SCOPES);
  url.searchParams.set("nonce", nonce);

  // Exactly one Set-Cookie (see KID_STATE_COOKIE)
  const res = NextResponse.redirect(url.toString());
  res.cookies.set(
    KID_STATE_COOKIE,
    packKidState(nonce, safeCallbackPath(req.nextUrl.searchParams.get("callbackUrl"))),
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
