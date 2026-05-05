"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HiOutlineUserGroup } from "react-icons/hi2";
import { TbListCheck } from "react-icons/tb";
import { BsCalendar4Event } from "react-icons/bs";
import { MdOutlineBalance } from "react-icons/md";
import { HiArrowNarrowDown, HiArrowNarrowUp } from "react-icons/hi";
import { createElement } from "react";

type StatItem = {
  key: string;
  title: string;
  value: number;
  change: number;
  icon: React.ElementType;
};

type DashboardStats = {
  totalLeaves:    { value: number; change: number };
  totalUsers:     { value: number; change: number };
  upcomingEvents: { value: number; change: number };
  balancesAdded:  { value: number; change: number };
};

const StatsCards = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/dashboard");
        if (res.ok) {
          const data: DashboardStats = await res.json();
          setStats(data);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const StatsCardsData: StatItem[] = [
    {
      key:    "leave",
      title:  "Total Leaves",
      value:  stats?.totalLeaves.value    ?? 0,
      change: stats?.totalLeaves.change   ?? 0,
      icon:   TbListCheck,
    },
    {
      key:    "user",
      title:  "Total Users",
      value:  stats?.totalUsers.value     ?? 0,
      change: stats?.totalUsers.change    ?? 0,
      icon:   HiOutlineUserGroup,
    },
    {
      key:    "event",
      title:  "Upcoming Events",
      value:  stats?.upcomingEvents.value  ?? 0,
      change: stats?.upcomingEvents.change ?? 0,
      icon:   BsCalendar4Event,
    },
    {
      key:    "balance",
      title:  "Balances Added",
      value:  stats?.balancesAdded.value   ?? 0,
      change: stats?.balancesAdded.change  ?? 0,
      icon:   MdOutlineBalance,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {StatsCardsData.map((stat) => (
        <Card key={stat.key}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            {createElement(stat.icon, { size: 24 })}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-8 w-16 animate-pulse rounded bg-muted" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  <span className="flex items-center">
                    {stat.change >= 0 ? (
                      <HiArrowNarrowUp className="text-green-600" size={16} />
                    ) : (
                      <HiArrowNarrowDown className="text-red-600" size={16} />
                    )}
                    {stat.change}
                  </span>
                  from last month
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default StatsCards;