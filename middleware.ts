import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

const ROLES_ALLOWED_TO_AUTH = ["ADMIN", "MODERATOR", "USER"];

export default withAuth(
  function middleware(req) {
    // Redirect logged-in user away from home
    if (req.nextUrl.pathname === "/" && req.nextauth.token) {
      return NextResponse.redirect(new URL("/portal", req.url));
    }

    // ✅ /portal — not logged in → redirect to /login WITH callbackUrl
    if (req.nextUrl.pathname.startsWith("/portal") && !req.nextauth.token) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set(
        "callbackUrl",
        req.nextUrl.pathname + req.nextUrl.search
      );
      return NextResponse.redirect(loginUrl);
    }

    // /dashboard — only ADMIN or MODERATOR
    if (
      req.nextUrl.pathname.startsWith("/dashboard") &&
      req.nextauth.token?.role !== "ADMIN" &&
      req.nextauth.token?.role !== "MODERATOR"
    ) {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
  },
  {
    // Must match the secret actually used to sign the session (authOptions.jwt.secret
    // in lib/auth.ts, i.e. NEXTAUTH_JWT_SECRET). Without this, withAuth silently falls
    // back to NEXTAUTH_SECRET — harmless only for as long as the two env vars happen
    // to hold the same value; the moment either one is rotated on its own, every user
    // is logged out here even though their session cookie is still perfectly valid.
    secret: process.env.NEXTAUTH_JWT_SECRET ?? process.env.NEXTAUTH_SECRET,
    callbacks: {
      authorized: ({ token }) =>
        token?.role !== undefined && ROLES_ALLOWED_TO_AUTH.includes(token.role),
    },
    pages: {
      signIn: "/login", // ✅ NextAuth auto-appends ?callbackUrl= when redirecting
    },
  }
);

export const config = {
  matcher: ["/dashboard/:path*", "/portal/:path*", "/"],
};