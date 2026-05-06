import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { Adapter } from "next-auth/adapters";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,

  cookies: {
    pkceCodeVerifier: {
      name: "next-auth.pkce.code_verifier",
      options: { httpOnly: true, sameSite: "none", path: "/", secure: true },
    },
    state: {
      name: "next-auth.state",
      options: { httpOnly: true, sameSite: "none", path: "/", secure: true },
    },
    sessionToken: {
      name: "next-auth.session-token",
      options: { httpOnly: true, sameSite: "none", path: "/", secure: true },
    },
  },

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      allowDangerousEmailAccountLinking: true, // ← prevents duplicate account error
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        identifier: { label: "Email or Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.identifier || !credentials?.password) return null;

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: credentials.identifier },
              { name: credentials.identifier },
            ],
          },
        });

        if (!user || !user.password) return null;

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],

  secret: process.env.NEXTAUTH_SECRET as string,

  pages: {
    signIn: "/login",
    error: "/login", // ← redirect errors back to login page
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },

  jwt: {
    secret: process.env.NEXTAUTH_JWT_SECRET as string,
  },

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const allowed = process.env.ALLOWED_DOMAIN as string;
        // ← return false instead of throw, prevents bad redirect
        if (!user.email?.endsWith(allowed)) {
          return false;
        }
      }
      return true;
    },

    jwt: async ({ token, user, account }) => {
      if (user) {
        // ← fetch role from DB since Google users won't have role in token
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email as string },
        });
        token.role = dbUser?.role ?? (user as any).role;
        token.image = user.image;
        token.name = user.name;
        token.id = user.id;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role;
        session.user.image = token.image as string;
        session.user.name = token.name as string;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      // ← ensure callbackUrl is always respected
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return `${baseUrl}/portal`;
    },
  },
};