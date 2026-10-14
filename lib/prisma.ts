import { PrismaClient } from "@prisma/client";

// The production database sits behind Supabase's pooler, which in session
// mode allows only 15 clients in total (EMAXCONNSESSION). Prisma's default
// pool is 2 × CPUs + 1 connections per client, so a couple of clients on a
// multi-core server use them all up and every query (e.g. KID login) fails.
//  - keep ONE client per process, in production too (Next.js can load this
//    module more than once — route handlers and pages are bundled separately)
//  - cap its pool unless DATABASE_URL already sets connection_limit
//  - Supabase transaction-mode pooler (port 6543) needs pgbouncer=true
const DEFAULT_CONNECTION_LIMIT = 5;

function databaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set(
        "connection_limit",
        process.env.PRISMA_CONNECTION_LIMIT ?? String(DEFAULT_CONNECTION_LIMIT),
      );
    }
    if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "20");
    if (url.hostname.endsWith("pooler.supabase.com") && url.port === "6543" &&
        !url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: databaseUrl(),
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

globalForPrisma.prisma = prisma;

export default prisma;
