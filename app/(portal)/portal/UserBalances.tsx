"use client";

import { useState, useMemo } from "react";
import Container from "@/components/Common/Container";
import LeaveCard from "./LeaveCard";
import ExportLeaveCardButton from "./ExportLeaveCardButton";
import { Balances, User } from "@prisma/client";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type RequestFormType from "@/app/(portal)/portal/RequestForm";

const RequestForm = dynamic(
  () => import("@/app/(portal)/portal/RequestForm"),
  { ssr: false, loading: () => null }
) as React.ComponentType<ComponentProps<typeof RequestFormType>>;

const khmerFont: React.CSSProperties = {
  fontFamily: "'Battambang', serif",
};

type Teammate = {
  id:    string;
  name:  string | null;
  email: string | null;
  image: string | null;
};

type Props = {
  balances:   Balances;
  user?:      User;
  teammates?: Teammate[];
};

const UserBalances = ({ balances, user, teammates = [] }: Props) => {
  const [isHours,     setIsHours]     = useState(true);
  const [dialogLeave, setDialogLeave] = useState<string | null>(null);

  // Stable reference — prevent unnecessary re-renders
const stableTeammates = useMemo(() => teammates, [teammates]);
  const rows = [
    { leaveType: "ANNUAL",    credit: balances?.annualCredit,    used: balances?.annualUsed,    balance: balances?.annualAvailable    },
    { leaveType: "SICK",      credit: balances?.sickCredit,      used: balances?.sickUsed,      balance: balances?.sickAvailable      },
    { leaveType: "PERSONAL",  credit: balances?.personalCredit,  used: balances?.personalUsed,  balance: balances?.personalAvailable  },
    { leaveType: "MATERNITY", credit: balances?.maternityCredit, used: balances?.maternityUsed, balance: balances?.maternityAvailable },
    { leaveType: "SPECIAL",   credit: balances?.specialCredit,   used: balances?.specialUsed,   balance: balances?.specialAvailable   },
  ];

  return (
    <Container>
      {/* Always mount RequestForm when user exists — avoid dynamic re-mount issue */}
      {user && (
        <RequestForm
          key={dialogLeave ?? "idle"}
          user={user}
          users={stableTeammates}
          defaultLeave={dialogLeave ?? undefined}
          externalOpen={dialogLeave !== null}
          onExternalClose={() => setDialogLeave(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mt-6 mb-3">
        <h2 className="text-base font-semibold text-foreground">Current Year Balances</h2>

        <div className="flex items-center gap-3">
          {user?.email && (
            <ExportLeaveCardButton
              email={user.email}
              userName={user.name ?? undefined}
              year={balances?.year}
            />
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Days</span>
            <button
              onClick={() => setIsHours(!isHours)}
              aria-label="Toggle hours or days"
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isHours ? "bg-blue-500" : "bg-muted-foreground/40"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                  isHours ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className="text-xs text-muted-foreground">Hours</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/50 overflow-hidden mb-10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border/50">
              <th className="py-2.5 pl-3 pr-2 text-left text-[11px] font-semibold text-muted-foreground" style={khmerFont}>ប្រភេទច្បាប់</th>
              <th className="py-2.5 px-2 text-right text-[11px] font-semibold text-muted-foreground" style={khmerFont}>Credit</th>
              <th className="py-2.5 px-2 text-right text-[11px] font-semibold text-muted-foreground" style={khmerFont}>Used</th>
              <th className="py-2.5 pl-2 pr-3 text-right text-[11px] font-semibold text-muted-foreground" style={khmerFont}>Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30 bg-background">
            {rows.map((row) => (
              <LeaveCard
                key={row.leaveType}
                year={balances?.year}
                leaveType={row.leaveType}
                credit={row.credit as number}
                used={row.used as number}
                balance={row.balance as number}
                isHours={isHours}
                onClick={user ? () => setDialogLeave(row.leaveType) : undefined}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Container>
  );
};

export default UserBalances;