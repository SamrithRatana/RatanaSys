import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { LeaveStatus, Prisma } from "@prisma/client";
import { leaveDayTotal, todayYmd } from "@/lib/leaveRules";
import { departmentLeaveEmails } from "@/lib/data/departmentScope";

const LEAVE_TYPE_TO_KEY: Record<string, string> = {
  ANNUAL:       "annual",
  ANNUAL_SHORT: "annual",
  SICK:         "sick",
  SICK_SHORT:   "sick",
  PERSONAL:     "personal",
  SHORT:        "personal",
  MATERNITY:    "maternity",
  SPECIAL:      "special",
};

const BALANCE_KEYS = ["annual", "sick", "personal", "maternity", "special"] as const;

// The balance is deducted at the first (head department) approval, so a leave
// awaiting the manager already counts as used — same rule as the deduction.
const DEDUCTED_STATUSES: LeaveStatus[] = [LeaveStatus.APPROVED, LeaveStatus.INMODERATION];

type LeaveLite = {
  userEmail: string;
  userName:  string;
  year:      string;
  startDate: Date;
  type:      string | null;
  days:      number | null;
  hours:     number | null;
};

const LEAVE_SELECT = {
  userEmail: true, userName: true, year: true, startDate: true,
  type: true, days: true, hours: true,
} satisfies Prisma.LeaveSelect;

function applyLeaves(balance: any, leaves: LeaveLite[]): any {
  const sums: Record<string, number> = {
    annual: 0, sick: 0, personal: 0, maternity: 0, special: 0,
  };

  for (const l of leaves) {
    const key = LEAVE_TYPE_TO_KEY[l.type?.toUpperCase() ?? ""];
    if (!key) continue;
    sums[key] += leaveDayTotal(l.days, l.hours);
  }

  const result = { ...balance };
  for (const key of BALANCE_KEYS) {
    const credit = Number(balance[`${key}Credit`] ?? 0);
    const used   = Math.round(sums[key] * 10_000) / 10_000;
    result[`${key}Used`]      = used;
    result[`${key}Available`] = Math.round((credit - used) * 10_000) / 10_000;
  }
  return result;
}

/** Leave.year, falling back to the start date for old rows saved with year = "". */
function yearOf(l: LeaveLite): string {
  return l.year || l.startDate.toISOString().slice(0, 4);
}

function yearFilter(years: string[]): Prisma.LeaveWhereInput {
  return {
    OR: [
      { year: { in: years } },
      ...years.map((y) => ({
        year: "",
        startDate: {
          gte: new Date(`${y}-01-01T00:00:00.000Z`),
          lte: new Date(`${y}-12-31T23:59:59.999Z`),
        },
      })),
    ],
  };
}

export async function getUserBalances() {
  try {
    const loggedInUser = await getCurrentUser();
    if (!loggedInUser) return null;
    if (!loggedInUser.email && !loggedInUser.name) return null;

    const year = todayYmd().slice(0, 4);

    // Email first; the name fallback is for accounts without an email
    // (e.g. Telegram logins) whose balance sits under their name.
    const byEmail = loggedInUser.email
      ? await prisma.balances.findUnique({
          where: { email_year: { email: loggedInUser.email, year } },
        })
      : null;
    const balance = byEmail ?? (loggedInUser.name
      ? await prisma.balances.findFirst({ where: { name: loggedInUser.name, year } })
      : null);
    if (!balance) return null;

    const who: Prisma.LeaveWhereInput[] = [{ userEmail: balance.email }];
    if (!byEmail) {
      if (loggedInUser.email) who.push({ userEmail: loggedInUser.email });
      if (loggedInUser.name)  who.push({ userName:  loggedInUser.name  });
    }

    const leaves = await prisma.leave.findMany({
      where: {
        status: { in: DEDUCTED_STATUSES },
        AND:    [{ OR: who }, yearFilter([year])],
      },
      select: LEAVE_SELECT,
    });

    return applyLeaves(balance, leaves);
  } catch (error) {
    console.error("Error fetching user balances:", error);
    return null;
  }
}

export async function getAllBalances() {
  try {
    const loggedInUser = await getCurrentUser();
    if (
      !loggedInUser ||
      !["ADMIN", "MODERATOR"].includes(loggedInUser.role as string)
    ) {
      return [];
    }

    // Moderators only see balances of their own department
    const balances = await prisma.balances.findMany({
      where: loggedInUser.role === "MODERATOR"
        ? { email: { in: await departmentLeaveEmails(loggedInUser.department) } }
        : {},
      orderBy: [{ year: "desc" }, { name: "asc" }],
    });
    if (balances.length === 0) return [];

    const emails = [...new Set(balances.map((b) => b.email))];
    const names  = [...new Set(balances.map((b) => b.name).filter(Boolean))];
    const years  = [...new Set(balances.map((b) => b.year))];

    const allLeaves = await prisma.leave.findMany({
      where: {
        status: { in: DEDUCTED_STATUSES },
        OR: [{ userEmail: { in: emails } }, { userName: { in: names } }],
        AND: [yearFilter(years)],
      },
      select: LEAVE_SELECT,
    });

    // Group by email+year. A leave is matched by name only when its email
    // belongs to no balance row at all (legacy data) — so two employees with
    // the same name never get each other's leave.
    const knownEmails = new Set(emails);
    const byEmail = new Map<string, LeaveLite[]>();
    const byName  = new Map<string, LeaveLite[]>();
    for (const l of allLeaves) {
      const y = yearOf(l);
      if (knownEmails.has(l.userEmail)) {
        const k = `${l.userEmail}|${y}`;
        (byEmail.get(k) ?? byEmail.set(k, []).get(k)!).push(l);
      } else {
        const k = `${l.userName}|${y}`;
        (byName.get(k) ?? byName.set(k, []).get(k)!).push(l);
      }
    }

    return balances.map((b) => applyLeaves(b, [
      ...(byEmail.get(`${b.email}|${b.year}`) ?? []),
      ...(byName.get(`${b.name}|${b.year}`) ?? []),
    ]));
  } catch (error) {
    console.error("Error fetching all balances:", error);
    return [];
  }
}
