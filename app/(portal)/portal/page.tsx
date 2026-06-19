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

  // ── Find teammates based on Team (not by email) ───────────────────────────
  let teammates: { id: string; name: string | null; email: string | null; image: string | null }[] = [];

  try {
    if (user?.id) {
      const currentUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true, department: true, email: true },
      });

      if (currentUser) {
        let myTeam: { id: string } | null = null;

        if (currentUser.role === "MODERATOR" || currentUser.role === "ADMIN") {
          // Moderator/Admin → រក team ដោយ department
          myTeam = await prisma.team.findFirst({
            where: { department: currentUser.department ?? "" },
            select: { id: true },
          });
        } else {
          // Regular USER → រក team ដោយ TeamMember record
          const membership = await prisma.teamMember.findFirst({
            where: { userEmail: currentUser.email ?? "" },
            select: { teamId: true },
          });
          if (membership) {
            myTeam = { id: membership.teamId };
          }
        }

        if (myTeam) {
          // ទាញ members ទាំងអស់ក្នុង team លើកលែង current user
          const members = await prisma.teamMember.findMany({
            where: { teamId: myTeam.id },
            select: { userEmail: true },
          });

          const memberEmails = members
            .map((m) => m.userEmail)
            .filter((e) => e !== currentUser.email);

          teammates = await prisma.user.findMany({
            where: { email: { in: memberEmails } },
            select: { id: true, name: true, email: true, image: true },
            orderBy: { name: "asc" },
          });
        }
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