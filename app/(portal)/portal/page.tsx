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
import prisma from '@/lib/prisma';

const Portal = async () => {
  const user = await getCurrentUser();

  let CurrentYearBalances: Balances | null = null;
  let Events: any[] = [];

  try {
    [CurrentYearBalances, Events] = await Promise.all([
      getUserBalances(),
      getEventsData(),
    ]);
  } catch (err) {
    console.error("Portal data fetch error:", err);
  }

  // ── Find current user's team → extract teammates ──────────────────────────
  let teammates: { id: string; name: string | null; email: string | null; image: string | null }[] = [];

  try {
    if (user?.email) {
      // រក TeamMember record របស់ user បច្ចុប្បន្ន
      const myMembership = await prisma.teamMember.findFirst({
        where: { userEmail: user.email },
        select: { teamId: true },
      });

      if (myMembership) {
        // រក members ទាំងអស់ក្នុង team ដូចគ្នា លើកលែង user ខ្លួនឯង
        const otherMembers = await prisma.teamMember.findMany({
          where: {
            teamId:    myMembership.teamId,
            userEmail: { not: user.email },
          },
          select: { userEmail: true },
        });

        const emails = otherMembers.map((m) => m.userEmail);

        // Fetch user details
        const teammateUsers = await prisma.user.findMany({
          where: { email: { in: emails } },
          select: { id: true, name: true, email: true, image: true },
          orderBy: { name: "asc" },
        });

        teammates = teammateUsers;
      }
    }
  } catch (err) {
    console.error("Teammates fetch error:", err);
  }

  return (
    <>
      <WelcomeBanner user={user as User} />

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
        />
      </div>
    </>
  );
};

export default Portal;