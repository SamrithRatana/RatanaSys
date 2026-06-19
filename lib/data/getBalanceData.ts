import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";

const LEAVE_TYPE_TO_KEY: Record<string, string> = {
  ANNUAL:    "annual",
  SICK:      "sick",
  PERSONAL:  "personal",
  MATERNITY: "maternity",
  SPECIAL:   "special",
};

/**
 * Recomputes Used/Available for each leave type directly from APPROVED
 * Leave records, instead of trusting the (sometimes manually-edited)
 * Balances.xxxUsed fields. Credit still comes from the Balances row.
 */
async function reconcileBalanceWithLeaves(email: string, year: string, balance: any) {
  const leaves = await prisma.leave.findMany({
    where: { userEmail: email, year, status: "APPROVED" },
    select: { type: true, days: true, hours: true },
  });

  const sums: Record<string, number> = {
    annual: 0, sick: 0, personal: 0, maternity: 0, special: 0,
  };

  for (const l of leaves) {
    const key = LEAVE_TYPE_TO_KEY[l.type?.toUpperCase() ?? ""];
    if (!key) continue; // ignore SHORT or unknown types here
    const dayUnits = (l.days ?? 0) + (l.hours ?? 0) / 8;
    sums[key] += dayUnits;
  }

  const result = { ...balance };

  for (const key of Object.keys(sums)) {
    const creditField    = `${key}Credit`;
    const usedField       = `${key}Used`;
    const availableField  = `${key}Available`;

    const credit = Number(balance?.[creditField] ?? 0);
    const used   = sums[key];

    result[usedField]      = used;
    result[availableField] = credit - used;
  }

  return result;
}

export async function getUserBalances() {
  try {
    const loggedInUser = await getCurrentUser();
    if (!loggedInUser || !loggedInUser.email) return null;

    const year = new Date().getFullYear().toString();

    const balance = await prisma.balances.findFirst({
      where: { email: loggedInUser.email, year },
    });
    if (!balance) return null;

    // ── Recompute Used/Available from real approved leaves ──────────────
    const reconciled = await reconcileBalanceWithLeaves(loggedInUser.email, year, balance);

    return reconciled;
  } catch (error) {
    console.error("Error fetching user balances:", error);
    return null;
  }
}

export async function getAllBalances() {
  try {
    const loggedInUser = await getCurrentUser();
    if (!loggedInUser || !["ADMIN", "MODERATOR"].includes(loggedInUser.role as string)) return [];

    const balances = await prisma.balances.findMany({
      orderBy: [{ year: "desc" }],
    });

    // ── Reconcile every row so the admin table also reflects real usage ──
    const reconciled = await Promise.all(
      balances.map((b) => reconcileBalanceWithLeaves(b.email!, b.year!, b))
    );

    return reconciled;
  } catch (error) {
    console.error("Error fetching all balances:", error);
    return [];
  }
}