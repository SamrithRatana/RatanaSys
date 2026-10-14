import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Supabase's pooler in session mode (port 5432) allows only 15 clients in
// total, shared by every process using this database — the app, the old
// container while a redeploy overlaps, local dev servers. Prisma's default
// pool is 2×CPUs+1, which alone can exceed that on the host and produced
// "EMAXCONNSESSION max clients reached" on every page. Cap it unless the
// URL already sets connection_limit.
const DEFAULT_CONNECTION_LIMIT = 5;

function databaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || /[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=${DEFAULT_CONNECTION_LIMIT}`;
}

const url = databaseUrl();

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(url && { datasources: { db: { url } } }),
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;