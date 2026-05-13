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

const Portal = async () => {
  const user = await getCurrentUser();

  // ✅ Safe fetch — won't crash the page if data is unavailable
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

  return (
    <>
      <WelcomeBanner user={user as User} />

      {/* ✅ Suspense prevents Calendar from crashing the whole page */}
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
                Current Year Balances
              </h2>
              <TotalBalanceSummary balances={CurrentYearBalances as Balances} />
            </div>
          )}
        </Container>

        <UserBalances balances={CurrentYearBalances as Balances} />
      </div>
    </>
  );
};

export default Portal;