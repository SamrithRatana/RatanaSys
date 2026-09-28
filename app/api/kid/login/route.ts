import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  KID_API, KID_CALLBACK_COOKIE, KID_NONCE_COOKIE, KID_SCOPES,
  kidConfig, safeCallbackPath,
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

  const res = NextResponse.redirect(url.toString());
  const cookie = {
    httpOnly: true,
    secure:   appBaseUrl().startsWith("https://"),
    sameSite: "lax" as const,
    path:     "/api/kid",
    maxAge:   15 * 60,
  };
  res.cookies.set(KID_NONCE_COOKIE, nonce, cookie);
  res.cookies.set(KID_CALLBACK_COOKIE, safeCallbackPath(req.nextUrl.searchParams.get("callbackUrl")), cookie);
  return res;
}
