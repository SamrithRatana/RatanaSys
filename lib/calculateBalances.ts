import { Balances, Prisma, PrismaClient } from "@prisma/client";
import { WORK_HOURS_PER_DAY, leaveDayTotal } from "@/lib/leaveRules";

type Db = PrismaClient | Prisma.TransactionClient;

// Which balance columns each leave type draws from.
// SHORT (legacy hourly personal leave) is deducted from Personal.
const BALANCE_KEY: Record<string, "annual" | "sick" | "personal" | "maternity" | "special"> = {
  ANNUAL:    "annual",
  SICK:      "sick",
  PERSONAL:  "personal",
  SHORT:     "personal",
  MATERNITY: "maternity",
  SPECIAL:   "special",
};

/**
 * Find the balance row for a leave. Matches on the unique (email, year) first
 * and only falls back to the display name when no email match exists
 * (legacy rows created before emails were reliable).
 */
export async function findBalanceForLeave(
  db:    Db,
  email: string,
  year:  string,
  name?: string | null,
): Promise<Balances | null> {
  const byEmail = await db.balances.findUnique({
    where: { email_year: { email, year } },
  });
  if (byEmail || !name) return byEmail;
  return db.balances.findFirst({ where: { year, name } });
}

/**
 * Deduct (direction = 1) or refund (direction = -1) a leave against a balance row.
 * `days` are whole days and `hours` are the extra partial hours (8h = 1 day),
 * exactly as stored on the Leave record.
 *
 * Uses atomic increments so two approvals running at the same time can't
 * overwrite each other's update.
 */
export async function applyLeaveToBalance(
  db:        Db,
  balance:   Balances,
  type:      string,
  days:      number,
  hours:     number,
  direction: 1 | -1,
): Promise<void> {
  const key = BALANCE_KEY[type.toUpperCase()];
  if (!key) throw new Error(`Unsupported leave type: ${type}`);

  const amount = Math.round(leaveDayTotal(days, hours) * 10_000) / 10_000;
  if (amount <= 0) return;
  if (hours >= WORK_HOURS_PER_DAY) hours = 0; // legacy days=1 + hours=8 rows

  const signed = amount * direction;
  const data: Prisma.BalancesUpdateInput = {
    [`${key}Used`]:      { increment: signed },
    [`${key}Available`]: { decrement: signed },
  };

  // Informational hour counter for partial-day personal leave
  if (key === "personal" && hours > 0) {
    data.shortUsed = { increment: hours * direction };
  }

  // Maternity credit is set when the leave is submitted; heal old rows where it's still 0
  if (key === "maternity" && direction === 1 && !((balance.maternityCredit ?? 0) > 0)) {
    const newUsed = (balance.maternityUsed ?? 0) + amount;
    const credit  = newUsed <= 7 ? 7 : 90;
    data.maternityCredit    = credit;
    data.maternityUsed      = newUsed;
    data.maternityAvailable = credit - newUsed;
  }

  await db.balances.update({ where: { id: balance.id }, data });
}
