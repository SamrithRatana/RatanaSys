// ✅ portal/page.tsx — simple & reuse getTeamsData
export const dynamic = 'force-dynamic'

import React, { Suspense } from 'react'
import WelcomeBanner from './WelcomeBanner'
import { getCurrentUser } from '@/lib/session';
import { Balances, User } from '@prisma/client';
import Calendar from './Calendar';
import { getUserBalances } from '@/lib/data/getBalanceData';
import Container from '@/components/Common/Container';
import UserBalances from './UserBalances';
import { getEventsData } from '@/lib/data/getEventData';
import TotalBalanceSummary from './TotalBalanceSummary';
import { getTeamsData } from '@/lib/data/getTeamsData'; // ← reuse
import { canExportAllLeaveCards, holidayYmds } from '@/lib/leaveRules';
import prisma from '@/lib/prisma';

const Portal = async () => {
  const user = await getCurrentUser();

  // ── Fetch all data in parallel ──────────────────────────────────────────
  const [CurrentYearBalances, Events, { teammates }] = await Promise.all([
    getUserBalances().catch(() => null),
    getEventsData().catch(() => []),
    getTeamsData().catch(() => ({ teams: [], teammates: [] })),
  ]);

  // Company holidays — not counted as leave days
  const holidays = holidayYmds(Events);

  // Who may pick another employee's leave card to export:
  // Admins, Accounting & Cashier and General Managers → everyone;
  // Moderators (head of department) → their own department.
  const exportsAll   = user?.role === "ADMIN" || user?.allDepartments || canExportAllLeaveCards(user?.department);
  const exportsDept  = !exportsAll && user?.role === "MODERATOR" && !!user.department?.trim();
  const exportUsers = exportsAll || exportsDept
    ? await prisma.user.findMany({
        where: {
          email: { not: null },
          ...(exportsDept && { department: { equals: user!.department!.trim(), mode: "insensitive" as const } }),
        },
        select:  { email: true, name: true, department: true },
        orderBy: { name: "asc" },
      }).catch(() => [])
    : undefined;

  return (
    <>
      <WelcomeBanner user={user as User} teammates={teammates} holidays={holidays} />

      <Suspense fallback={<div className="p-4 text-center text-sm text-gray-400">Loading calendar...</div>}>
        <Calendar events={Events} />
      </Suspense>

      <div>
        <Container>
          {!CurrentYearBalances ? (
            <div className="my-4">
              <h2 className="text-xl text-center font-extrabold leading-tight lg:text-2xl">
                No Balances Data found...
              </h2>
            </div>
          ) : (
            <div className="my-4">
              <h2 className="text-xl text-center font-extrabold leading-tight lg:text-2xl">
                Current Year Balances (1 day = 8 hours)
              </h2>
              <TotalBalanceSummary balances={CurrentYearBalances as Balances} />
            </div>
          )}
        </Container>

        <UserBalances
          balances={CurrentYearBalances as Balances}
          user={user as User}
          teammates={teammates}
          holidays={holidays}
          exportUsers={exportUsers as { email: string; name: string | null; department: string | null }[] | undefined}
        />
      </div>
    </>
  );
};

export default Portal;