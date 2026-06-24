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

// Round to max 2 decimal places to avoid floating point display issues
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Recompute Used & Available from approved leave records.
// Credit comes from DB. Used/Available are always derived — never trusted from DB.
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
    sums[key] = round2(sums[key] + (l.days ?? 0) + (l.hours ?? 0) / 8);
  }

  const result = { ...balance };
  for (const key of BALANCE_KEYS) {
    const credit = round2(Number(balance[`${key}Credit`] ?? 0));
    result[`${key}Used`]      = sums[key];
    result[`${key}Available`] = round2(credit - sums[key]);
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
// Always recomputes Used & Available from approved leaves.
// DB `Used` values are unreliable (calculateAndUpdateBalances accumulates on
// top of stale values). Only `Credit` from DB is trusted.
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

    // 2️⃣ All approved leaves — single query
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

    // 4️⃣ Recompute each row — Credit from DB, Used/Available from leaves
    return balances.map((b) =>
      applyLeaves(b, leavesByEmail.get(b.email ?? "") ?? [])
    );
  } catch (error) {
    console.error("Error fetching all balances:", error);
    return [];
  }
}