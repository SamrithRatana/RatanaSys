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

  // ── Find teammates (members + co-moderators in same team/department) ──────
  let teammates: Teammate[] = [];

  try {
    if (user?.id) {
      const currentUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true, department: true, email: true },
      });

      if (currentUser) {
        let myTeamId: string | null = null;

        if (currentUser.role === "MODERATOR" || currentUser.role === "ADMIN") {
          // Moderator/Admin → find team by department
          const myTeam = await prisma.team.findFirst({
            where: { department: currentUser.department ?? "" },
            select: { id: true },
          });
          myTeamId = myTeam?.id ?? null;
        } else {
          // Regular USER → find team via TeamMember record
          const membership = await prisma.teamMember.findFirst({
            where: { userEmail: currentUser.email ?? "" },
            select: { teamId: true },
          });
          myTeamId = membership?.teamId ?? null;
        }

        if (myTeamId) {
          // ── Get all TeamMember emails in that team ──
          const teamMembers = await prisma.teamMember.findMany({
            where: { teamId: myTeamId },
            select: { userEmail: true },
          });

          // Also get the team's department so we can find co-moderators
          const myTeamRecord = await prisma.team.findUnique({
            where: { id: myTeamId },
            select: { department: true },
          });

          const memberEmails = teamMembers
            .map((m) => m.userEmail)
            .filter((e) => e !== currentUser.email);

          // ── Get member users ──
          const memberUsers = memberEmails.length > 0
            ? await prisma.user.findMany({
                where: { email: { in: memberEmails } },
                select: { id: true, name: true, email: true, image: true },
                orderBy: { name: "asc" },
              })
            : [];

          // ── Get co-moderators in same department (exclude self) ──
          const moderatorUsers = myTeamRecord?.department
            ? await prisma.user.findMany({
                where: {
                  role: "MODERATOR",
                  department: myTeamRecord.department,
                  email: { not: currentUser.email ?? "" },
                },
                select: { id: true, name: true, email: true, image: true },
                orderBy: { name: "asc" },
              })
            : [];

          // ── Merge & deduplicate by email ──
          const seen = new Set<string>();
          const merged: Teammate[] = [];

          for (const u of [...memberUsers, ...moderatorUsers]) {
            if (!u.email || seen.has(u.email)) continue;
            seen.add(u.email);
            merged.push({
              id:    u.id,
              name:  u.name,
              email: u.email,
              image: u.image,
            });
          }

          teammates = merged;
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