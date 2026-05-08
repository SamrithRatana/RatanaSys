import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { Adapter } from "next-auth/adapters";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),

    // ── Telegram Phone Provider ───────────────────────────────────────────────
    CredentialsProvider({
      id:   "telegram-phone",
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
            telegramId: user.telegramId,
          };
        } catch {
          return null;
        }
      },
    }),

    // ── Credentials Provider ──────────────────────────────────────────────────
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        identifier: { label: "Email or Username", type: "text" },
        password:   { label: "Password",          type: "password" },
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
          telegramId: user.telegramId,
        };
      },
    }),
  ],

  secret: process.env.NEXTAUTH_SECRET as string,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  jwt: {
    secret: process.env.NEXTAUTH_JWT_SECRET as string,
  },

  callbacks: {
    // ✅ THIS is the key fix — honours callbackUrl from Telegram deep links
    async redirect({ url, baseUrl }) {
      // Allow relative paths (e.g. /dashboard/leaves/abc123)
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Allow same-origin URLs (e.g. https://system.camprotec.com.kh/dashboard/leaves/abc123)
      if (new URL(url).origin === baseUrl) return url;
      // Fallback
      return `${baseUrl}/portal`;
    },

    async signIn({ user, account }) {
      if (account?.provider === "telegram-phone") return true;

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
        token.telegramId = (user as any).telegramId ?? null;
      }

      if (token.sub && !token.telegramId) {
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
        session.user.role       = token.role;
        session.user.image      = token.image as string;
        session.user.name       = token.name as string;
        session.user.telegramId = (token.telegramId as string) ?? null;
      }
      return session;
    },
  },
};