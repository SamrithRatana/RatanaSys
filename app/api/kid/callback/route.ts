import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import {
  KID_STATE_COOKIE,
  exchangeKidCode, findOrLinkKidUser, idTokenNonce, safeCallbackPath, unpackKidState,
} from "@/lib/kid";
import { SESSION_MAX_AGE, authOptions } from "@/lib/auth";
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
  const kidState = unpackKidState(req.cookies.get(KID_STATE_COOKIE)?.value);
  const callbackPath = safeCallbackPath(kidState.callbackPath);

  if (kidErr || !code) {
    return NextResponse.redirect(toLogin({ kidError: kidErr ?? "missing_code", callbackUrl: callbackPath }));
  }

  try {
    const tokens = await exchangeKidCode(code, state);

    // Bind the login to the browser that started it (login-CSRF protection)
    const expected = kidState.nonce;
    const returned = idTokenNonce(tokens.id_token);
    if (returned && returned !== expected) {
      return NextResponse.redirect(toLogin({ kidError: "nonce_mismatch", callbackUrl: callbackPath }));
    }

    const user = await findOrLinkKidUser(tokens.user!);
    console.log(`[KID callback] signed in user=${user.id} kid_sub=${tokens.user!.sub}`);

    // Open the normal next-auth session directly: the same JWT (same secret,
    // same claims) next-auth itself would issue, so middleware, getServerSession
    // and sign-out all work unchanged.
    const secure = appBaseUrl().startsWith("https://");
    const sessionToken = await encode({
      secret: (authOptions.jwt?.secret ?? authOptions.secret) as string,
      maxAge: SESSION_MAX_AGE,
      token: {
        sub:        user.id,
        name:       user.name,
        email:      user.email,
        picture:    user.image,
        image:      user.image,
        role:       user.role,
        telegramId: user.telegramId,
      },
    });

    // Exactly ONE Set-Cookie: the Koompi proxy keeps only the last one, which
    // is why an extra "clean-up" cookie here used to swallow the session.
    // (kid_state just expires on its own after 15 minutes.)
    const res = NextResponse.redirect(`${appBaseUrl()}${callbackPath}`);
    res.cookies.set(`${secure ? "__Secure-" : ""}next-auth.session-token`, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path:     "/",
      secure,
      maxAge:   SESSION_MAX_AGE,
    });
    return res;
  } catch (error) {
    console.error("[KID callback]", error);
    return NextResponse.redirect(toLogin({ kidError: "login_failed", callbackUrl: callbackPath }));
  }
}
