import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";

const LEAVE_TYPE_TO_KEY: Record<string, string> = {
  ANNUAL:    "annual",
  SICK:      "sick",
  PERSONAL:  "personal",
  MATERNITY: "maternity",
  SPECIAL:   "special",
};

const BALANCE_KEYS = ["annual", "sick", "personal", "maternity", "special"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Always recompute Used & Available from approved leaves.
// The DB `Used` field is unreliable — calculateAndUpdateBalances() accumulates
// on top of it every approval, so it drifts. Credit in DB is the source of truth.
// ─────────────────────────────────────────────────────────────────────────────
function applyLeaves(
  balance: any,
  leaves: { type: string | null; days: number | null; hours: number | null }[]
): any {
  const sums: Record<string, number> = {
    annual: 0, sick: 0, personal: 0, maternity: 0, special: 0,
  };

  for (const l of leaves) {
    const key = LEAVE_TYPE_TO_KEY[l.type?.toUpperCase() ?? ""];
    if (!key) continue;
    sums[key] += (l.days ?? 0) + (l.hours ?? 0) / 8;
  }

  const result = { ...balance };
  for (const key of BALANCE_KEYS) {
    const credit = Number(balance[`${key}Credit`] ?? 0);
    result[`${key}Used`]      = sums[key];
    result[`${key}Available`] = credit - sums[key];
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// getUserBalances — single user (portal view)
// ─────────────────────────────────────────────────────────────────────────────
export async function getUserBalances() {
  try {
    const loggedInUser = await getCurrentUser();
    if (!loggedInUser?.email) return null;

    const year = new Date().getFullYear().toString();

    const [balance, leaves] = await Promise.all([
      prisma.balances.findFirst({ where: { email: loggedInUser.email, year } }),
      prisma.leave.findMany({
        where:  { userEmail: loggedInUser.email, year, status: "APPROVED" },
        select: { type: true, days: true, hours: true },
      }),
    ]);

    if (!balance) return null;

    return applyLeaves(balance, leaves);
  } catch (error) {
    console.error("Error fetching user balances:", error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getAllBalances — admin / moderator dashboard
// Also recomputes from approved leaves (same as user portal) because the DB
// `Used` values accumulate wrongly via calculateAndUpdateBalances().
// Only `Credit` from DB is trusted — Used & Available are always derived.
// ─────────────────────────────────────────────────────────────────────────────
export async function getAllBalances() {
  try {
    const loggedInUser = await getCurrentUser();
    if (!loggedInUser || !["ADMIN", "MODERATOR"].includes(loggedInUser.role as string)) {
      return [];
    }

    const year = new Date().getFullYear().toString();

    // 1️⃣ Current year balance rows only
    const balances = await prisma.balances.findMany({
      where:   { year },
      orderBy: { name: "asc" },
    });

    if (balances.length === 0) return [];

    // 2️⃣ All approved leaves for all those emails — single query
    const emails = [
      ...new Set(balances.map((b) => b.email).filter(Boolean) as string[]),
    ];

    const allLeaves = await prisma.leave.findMany({
      where:  { userEmail: { in: emails }, year, status: "APPROVED" },
      select: { userEmail: true, type: true, days: true, hours: true },
    });

    // 3️⃣ Group by email
    const leavesByEmail = new Map<string, typeof allLeaves>();
    for (const l of allLeaves) {
      if (!l.userEmail) continue;
      if (!leavesByEmail.has(l.userEmail)) leavesByEmail.set(l.userEmail, []);
      leavesByEmail.get(l.userEmail)!.push(l);
    }

    // 4️⃣ Recompute each row from leaves — Credit comes from DB, Used/Available computed
    return balances.map((b) =>
      applyLeaves(b, leavesByEmail.get(b.email ?? "") ?? [])
    );
  } catch (error) {
    console.error("Error fetching all balances:", error);
    return [];
  }
}