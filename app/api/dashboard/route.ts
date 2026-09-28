import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { todayYmd } from "@/lib/leaveRules";
import { departmentLeaveEmails } from "@/lib/data/departmentScope";

/** Start of a month in Cambodia time (UTC+7), as a UTC instant. */
function monthStart(year: number, month: number): Date {
  const y = year + Math.floor((month - 1) / 12);
  const m = ((month - 1) % 12 + 12) % 12 + 1;
  return new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00+07:00`);
}

export async function GET() {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (loggedInUser.role !== "ADMIN" && loggedInUser.role !== "MODERATOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const now   = new Date();
    const today = todayYmd(now);
    const year  = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));

    const thisMonthStart = monthStart(year, month);
    const nextMonthStart = monthStart(year, month + 1);
    const lastMonthStart = monthStart(year, month - 1);

    // Moderators only see numbers for their own department
    const isModerator = loggedInUser.role === "MODERATOR";
    const deptEmails  = isModerator ? await departmentLeaveEmails(loggedInUser.department) : [];

    const leaveScope: Prisma.LeaveWhereInput    = isModerator ? { userEmail: { in: deptEmails } } : {};
    const balanceScope: Prisma.BalancesWhereInput = isModerator ? { email: { in: deptEmails } } : {};
    const userScope: Prisma.UserWhereInput      = isModerator
      ? { department: { equals: (loggedInUser.department ?? "").trim(), mode: "insensitive" } }
      : {};
    // Holidays are company-wide; leave events only for the moderator's department
    const eventScope: Prisma.EventsWhereInput   = isModerator
      ? {
          OR: [
            { leaveId: null },
            { leaveId: { in: (await prisma.leave.findMany({ where: leaveScope, select: { id: true } })).map((l) => l.id) } },
          ],
        }
      : {};

    const currentYear = String(year);
    const lastYear    = String(year - 1);

    const [
      totalLeaves, lastMonthLeaves,
      totalUsers,
      upcomingEvents, lastMonthEvents,
      balancesAdded, lastYearBalances,
    ] = await Promise.all([
      prisma.leave.count({ where: { ...leaveScope, createdAt: { gte: thisMonthStart, lt: nextMonthStart } } }),
      prisma.leave.count({ where: { ...leaveScope, createdAt: { gte: lastMonthStart, lt: thisMonthStart } } }),
      isModerator && deptEmails.length === 0 ? 0 : prisma.user.count({ where: userScope }),
      prisma.events.count({ where: { ...eventScope, startDate: { gte: now } } }),
      prisma.events.count({ where: { ...eventScope, startDate: { gte: lastMonthStart, lt: thisMonthStart } } }),
      prisma.balances.count({ where: { ...balanceScope, year: currentYear } }),
      prisma.balances.count({ where: { ...balanceScope, year: lastYear } }),
    ]);

    return NextResponse.json({
      totalLeaves:    { value: totalLeaves,    change: totalLeaves - lastMonthLeaves },
      totalUsers:     { value: totalUsers,     change: 0 },
      upcomingEvents: { value: upcomingEvents, change: upcomingEvents - lastMonthEvents },
      balancesAdded:  { value: balancesAdded,  change: balancesAdded - lastYearBalances },
      scope:          isModerator ? (loggedInUser.department ?? "") : "ALL",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
