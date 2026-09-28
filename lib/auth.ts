import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { Adapter } from "next-auth/adapters";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { KID_LOGIN_COOKIE, verifyKidLoginToken } from "@/lib/kid";

// Sessions last a year and are extended every time the user opens the app
// (see components/SessionKeepAlive.tsx), so active users never have to log in
// again. Browsers cap cookie lifetime at ~400 days.
const SESSION_MAX_AGE = 365 * 24 * 60 * 60;

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    // ── KID (dash.kid.koompi.org) — Google / Telegram / Apple / email via KID ──
    // /api/kid/callback verifies the user with KID and leaves a 2-minute signed
    // cookie; the login page then calls signIn("kid") to open the session.
    CredentialsProvider({
      id:   "kid",
      name: "KID",
      credentials: {},
      async authorize(_credentials, req) {
        const cookieHeader = (req?.headers as any)?.cookie as string | undefined;
        const token = readCookie(cookieHeader, KID_LOGIN_COOKIE);
        const userId = token ? verifyKidLoginToken(token) : null;
        if (!userId) return null;

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return null;
        return {
          id:         user.id,
          name:       user.name,
          email:      user.email,
          image:      user.image,
          role:       user.role,
          telegramId: user.telegramId,
        };
      },
    }),

    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),

    // ── Telegram Phone Provider ───────────────────────────────────────────────
    CredentialsProvider({
      id: "telegram-phone",
      name: "Telegram Phone",
      credentials: {
        tempToken: { label: "Temp Token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.tempToken) return null;
        try {
          const payload = jwt.verify(
            credentials.tempToken,
            process.env.NEXTAUTH_SECRET as string
          ) as { userId: string };

          const user = await prisma.user.findUnique({
            where: { id: payload.userId },
          });
          if (!user) return null;

          return {
            id:         user.id,
            name:       user.name,
            email:      user.email,
            image:      user.image,
            role:       user.role,
            telegramId: user.telegramId, // ← NEW
          };
        } catch {
          return null;
        }
      },
    }),
    // ─────────────────────────────────────────────────────────────────────────

    CredentialsProvider({
      name: "Credentials",
      credentials: {
        identifier: { label: "Email or Username", type: "text" },
        password:   { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.identifier || !credentials?.password) return null;

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: credentials.identifier },
              { name:  credentials.identifier },
            ],
          },
        });

        if (!user || !user.password) return null;

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;

        return {
          id:         user.id,
          name:       user.name,
          email:      user.email,
          image:      user.image,
          role:       user.role,
          telegramId: user.telegramId, // ← NEW
        };
      },
    }),
  ],

  secret: process.env.NEXTAUTH_SECRET as string,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy:  "jwt",
    maxAge:    SESSION_MAX_AGE,
    updateAge: 24 * 60 * 60, // re-issue the cookie at most once a day
  },
  jwt: {
    secret: process.env.NEXTAUTH_JWT_SECRET as string,
  },

  callbacks: {
    async signIn({ user, account }) {
      // Allow Telegram / KID users without any domain check (KID verifies identity)
      if (account?.provider === "telegram-phone" || account?.provider === "kid") return true;

      if (account?.provider === "google") {
        if (!user.email?.endsWith(process.env.ALLOWED_DOMAIN as string)) {
          throw new Error("You are not allowed to access this platform");
        }
      }
      return true;
    },

    jwt: async ({ token, user }) => {
      if (user) {
        token.role       = (user as any).role;
        token.image      = user.image;
        token.name       = user.name;
        token.telegramId = (user as any).telegramId ?? null; // ← NEW
      }

      // Re-fetch telegramId from DB on every JWT refresh so the
      // System Integration badge turns green immediately after linking
      // without the user needing to sign out and back in.
      // Throttled to once per 5 minutes: getServerSession runs this on every request
      const lastCheck = Number(token.tgCheckedAt ?? 0);
      if (token.sub && !token.telegramId && Date.now() - lastCheck > 5 * 60_000) {
        token.tgCheckedAt = Date.now();
        const dbUser = await prisma.user.findUnique({
          where:  { id: token.sub },
          select: { telegramId: true },
        });
        if (dbUser?.telegramId) {
          token.telegramId = dbUser.telegramId;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id         = token.sub;
        session.user.role       = token.role;
        session.user.image      = token.image as string;
        session.user.name       = token.name as string;
        session.user.telegramId = (token.telegramId as string) ?? null; // ← NEW
      }
      return session;
    },
  },
};