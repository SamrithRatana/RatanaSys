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

type Teammate = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

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

  let teammates: Teammate[] = [];

  try {
    if (user?.id) {
      const currentUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true, department: true, email: true },
      });

      console.log("=== TEAMMATES DEBUG ===", {
        email: currentUser?.email,
        role: currentUser?.role,
        department: currentUser?.department,
      });

      if (currentUser?.email) {
        // ── Step 1: Find myTeamId ─────────────────────────────────────────
        let myTeamId: string | null = null;
        let myDepartment: string | null = currentUser.department ?? null;

        if (currentUser.role === "MODERATOR" || currentUser.role === "ADMIN") {
          const myTeam = await prisma.team.findFirst({
            where: { department: myDepartment ?? "" },
            select: { id: true, department: true },
          });
          myTeamId     = myTeam?.id         ?? null;
          myDepartment = myTeam?.department ?? myDepartment;
        } else {
          // Regular USER
          const membership = await prisma.teamMember.findFirst({
            where: { userEmail: currentUser.email },
            select: { teamId: true },
          });
          if (membership) {
            myTeamId = membership.teamId;
            const myTeam = await prisma.team.findUnique({
              where: { id: myTeamId },
              select: { department: true },
            });
            myDepartment = myTeam?.department ?? myDepartment;
          }
        }

        console.log("myTeamId:", myTeamId, "myDepartment:", myDepartment);

        const seen  = new Set<string>([currentUser.email]); // exclude self
        const merged: Teammate[] = [];

        const addUsers = (users: Teammate[]) => {
          for (const u of users) {
            if (!u.email || seen.has(u.email)) continue;
            seen.add(u.email);
            merged.push(u);
          }
        };

        // ── Step 2a: Get team members from TeamMember table ───────────────
        if (myTeamId) {
          const teamMembers = await prisma.teamMember.findMany({
            where: { teamId: myTeamId },
            select: { userEmail: true },
          });

          const memberEmails = teamMembers
            .map((m) => m.userEmail)
            .filter((e) => e !== currentUser.email);

          console.log("memberEmails from TeamMember:", memberEmails);

          if (memberEmails.length > 0) {
            const memberUsers = await prisma.user.findMany({
              where: { email: { in: memberEmails } },
              select: { id: true, name: true, email: true, image: true },
              orderBy: { name: "asc" },
            });
            addUsers(memberUsers);
          }
        }

        // ── Step 2b: Get ALL users in same department (fallback + co-mods) ─
        if (myDepartment) {
          const deptUsers = await prisma.user.findMany({
            where: {
              department: myDepartment,
              email: { not: currentUser.email },
            },
            select: { id: true, name: true, email: true, image: true },
            orderBy: { name: "asc" },
          });

          console.log("deptUsers:", deptUsers.map(u => u.email));
          addUsers(deptUsers);
        }

        teammates = merged;
        console.log("Final teammates:", teammates.map(t => t.name));
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