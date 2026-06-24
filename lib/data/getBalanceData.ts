import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";

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

function applyLeaves(
  balance: any,
  leaves: { type: string | null; days: number | null; hours: number | null }[],
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

function dateRangeForYear(year: string) {
  return {
    gte: new Date(`${year}-01-01T00:00:00.000Z`),
    lte: new Date(`${year}-12-31T23:59:59.999Z`),
  };
}

export async function getUserBalances() {
  try {
    const loggedInUser = await getCurrentUser();
    if (!loggedInUser) return null;
    if (!loggedInUser.email && !loggedInUser.name) return null;

    const year = new Date().getFullYear().toString();

    const balance = await prisma.balances.findFirst({
      where: {
        OR: [
          ...(loggedInUser.email ? [{ email: loggedInUser.email }] : []),
          ...(loggedInUser.name  ? [{ name:  loggedInUser.name  }] : []),
        ],
        year,
      },
    });

    if (!balance) return null;

    const orConditions: any[] = [];
    if (loggedInUser.email) orConditions.push({ userEmail: loggedInUser.email });
    if (loggedInUser.name)  orConditions.push({ userName:  loggedInUser.name  });

    const leaves = await prisma.leave.findMany({
      where: {
        OR:        orConditions,
        status:    "APPROVED",
        startDate: dateRangeForYear(year),
      },
      select: { type: true, days: true, hours: true },
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

    const year = new Date().getFullYear().toString();

    const balances = await prisma.balances.findMany({
      orderBy: { year: "desc" },
    });

    if (balances.length === 0) return [];

    const emails = [
      ...new Set(balances.map((b) => b.email).filter(Boolean) as string[]),
    ];
    const names = [
      ...new Set(balances.map((b) => b.name).filter(Boolean) as string[]),
    ];

    const orConditions: any[] = [];
    if (emails.length > 0) orConditions.push({ userEmail: { in: emails } });
    if (names.length  > 0) orConditions.push({ userName:  { in: names  } });

    const allLeaves =
      orConditions.length === 0
        ? []
        : await prisma.leave.findMany({
            where: {
              OR:        orConditions,
              status:    "APPROVED",
              startDate: dateRangeForYear(year),
            },
            select: {
              userEmail: true,
              userName:  true,
              type:      true,
              days:      true,
              hours:     true,
            },
          });

    const leavesByEmail = new Map<string, typeof allLeaves>();
    const leavesByName  = new Map<string, typeof allLeaves>();

    for (const l of allLeaves) {
      if (l.userEmail) {
        if (!leavesByEmail.has(l.userEmail)) leavesByEmail.set(l.userEmail, []);
        leavesByEmail.get(l.userEmail)!.push(l);
      }
      if (l.userName) {
        if (!leavesByName.has(l.userName)) leavesByName.set(l.userName, []);
        leavesByName.get(l.userName)!.push(l);
      }
    }

    return balances.map((b) => {
      const byEmail = b.email ? (leavesByEmail.get(b.email) ?? []) : [];
      const byName  = b.name  ? (leavesByName .get(b.name)  ?? []) : [];

      const seen   = new Set(byEmail);
      const merged = [...byEmail, ...byName.filter((l) => !seen.has(l))];

      return applyLeaves(b, merged);
    });
  } catch (error) {
    console.error("Error fetching all balances:", error);
    return [];
  }
}