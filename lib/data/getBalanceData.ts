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

// Used by getUserBalances only — recomputes from approved leave records
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
// Always recomputes from approved leaves for accuracy.
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
// Trusts DB values directly so admin manual edits (Credit + Used) are reflected.
// Available = Credit - Used, recomputed from DB values (not from leaves).
// ─────────────────────────────────────────────────────────────────────────────
export async function getAllBalances() {
  try {
    const loggedInUser = await getCurrentUser();
    if (!loggedInUser || !["ADMIN", "MODERATOR"].includes(loggedInUser.role as string)) {
      return [];
    }

    const year = new Date().getFullYear().toString();

    const balances = await prisma.balances.findMany({
      where:   { year },
      orderBy: { name: "asc" },
    });

    if (balances.length === 0) return [];

    // Recompute Available = Credit - Used from DB values
    // Admin sets both Credit and Used via EditBalances, so we trust DB here
    return balances.map((b) => {
      const result = { ...b } as any;
      for (const key of BALANCE_KEYS) {
        const credit = Number((b as any)[`${key}Credit`] ?? 0);
        const used   = Number((b as any)[`${key}Used`]   ?? 0);
        result[`${key}Available`] = credit - used;
      }
      return result;
    });
  } catch (error) {
    console.error("Error fetching all balances:", error);
    return [];
  }
}