import { getCurrentUser } from "@/lib/session";
import { NextResponse } from "next/server";
import { startOfMonth, subMonths, endOfMonth } from "date-fns";

export async function GET() {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd   = endOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd   = endOfMonth(subMonths(now, 1));

    // ── Total Leaves (this month vs last month) — Leave HAS createdAt ───────
    const [totalLeaves, lastMonthLeaves] = await Promise.all([
      prisma.leave.count({
        where: { createdAt: { gte: thisMonthStart, lte: thisMonthEnd } },
      }),
      prisma.leave.count({
        where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd } },
      }),
    ]);

    // ── Total Users — no createdAt on User, just count all ──────────────────
    const totalUsers = await prisma.user.count();

    // ── Upcoming Events — Events has no createdAt, filter by startDate ──────
    const [upcomingEvents, lastMonthEvents] = await Promise.all([
      prisma.events.count({
        where: { startDate: { gte: now } },
      }),
      prisma.events.count({
        where: {
          startDate: {
            gte: lastMonthStart,
            lte: lastMonthEnd,
          },
        },
      }),
    ]);

    // ── Balances Added — no createdAt on Balances, filter by year ───────────
    const currentYear   = now.getFullYear().toString();
    const lastYear      = (now.getFullYear() - 1).toString();

    const [balancesAdded, lastYearBalances] = await Promise.all([
      prisma.balances.count({ where: { year: currentYear } }),
      prisma.balances.count({ where: { year: lastYear } }),
    ]);

    return NextResponse.json({
      totalLeaves:    { value: totalLeaves,    change: totalLeaves - lastMonthLeaves },
      totalUsers:     { value: totalUsers,     change: 0 }, // no createdAt to diff
      upcomingEvents: { value: upcomingEvents, change: upcomingEvents - lastMonthEvents },
      balancesAdded:  { value: balancesAdded,  change: balancesAdded - lastYearBalances },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}