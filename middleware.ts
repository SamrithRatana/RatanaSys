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