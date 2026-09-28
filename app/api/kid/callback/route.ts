import { NextRequest, NextResponse } from "next/server";
import {
  KID_CALLBACK_COOKIE, KID_LOGIN_COOKIE, KID_NONCE_COOKIE,
  exchangeKidCode, findOrLinkKidUser, idTokenNonce, safeCallbackPath, signKidLoginToken,
} from "@/lib/kid";
import { appBaseUrl } from "@/lib/leaveServer";

export const dynamic = "force-dynamic";

function toLogin(params: Record<string, string>) {
  const url = new URL(`${appBaseUrl()}/login`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

// GET /api/kid/callback?code=…&state=… — KID sends the user back here
export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const kidErr = req.nextUrl.searchParams.get("error");
  const callbackPath = safeCallbackPath(req.cookies.get(KID_CALLBACK_COOKIE)?.value);

  if (kidErr || !code) {
    return NextResponse.redirect(toLogin({ kidError: kidErr ?? "missing_code", callbackUrl: callbackPath }));
  }

  try {
    const tokens = await exchangeKidCode(code, state);

    // Bind the login to the browser that started it (login-CSRF protection)
    const expected = req.cookies.get(KID_NONCE_COOKIE)?.value;
    const returned = idTokenNonce(tokens.id_token);
    if (returned && returned !== expected) {
      return NextResponse.redirect(toLogin({ kidError: "nonce_mismatch", callbackUrl: callbackPath }));
    }

    const user = await findOrLinkKidUser(tokens.user!);

    // The login page trades this cookie for a normal next-auth session
    const res = NextResponse.redirect(toLogin({ kid: "1", callbackUrl: callbackPath }));
    res.cookies.set(KID_LOGIN_COOKIE, signKidLoginToken(user.id), {
      httpOnly: true,
      secure:   appBaseUrl().startsWith("https://"),
      sameSite: "lax",
      path:     "/",
      maxAge:   120,
    });
    res.cookies.delete({ name: KID_NONCE_COOKIE, path: "/api/kid" });
    res.cookies.delete({ name: KID_CALLBACK_COOKIE, path: "/api/kid" });
    return res;
  } catch (error) {
    console.error("[KID callback]", error);
    return NextResponse.redirect(toLogin({ kidError: "login_failed", callbackUrl: callbackPath }));
  }
}
