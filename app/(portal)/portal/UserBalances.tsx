"use client";

import { useState } from "react";
import Container from "@/components/Common/Container";
import LeaveCard from "./LeaveCard";
import { Balances } from "@prisma/client";

type Props = {
  balances: Balances;
};

const UserBalances = ({ balances }: Props) => {
  const [isHours, setIsHours] = useState(true);

  const rows = [
    { leaveType: "ANNUAL",    credit: balances?.annualCredit,    used: balances?.annualUsed,    balance: balances?.annualAvailable    },
    { leaveType: "SICK",      credit: balances?.sickCredit,      used: balances?.sickUsed,      balance: balances?.sickAvailable      },
    { leaveType: "PERSONAL",  credit: balances?.personalCredit,  used: balances?.personalUsed,  balance: balances?.personalAvailable  },
    { leaveType: "MATERNITY", credit: balances?.maternityCredit, used: balances?.maternityUsed, balance: balances?.maternityAvailable },
    { leaveType: "SPECIAL",   credit: balances?.specialCredit,   used: balances?.specialUsed,   balance: balances?.specialAvailable   },
  ];

  return (
    <Container>
      {/* Header */}
      <div className="flex items-center justify-between mt-6 mb-3">
        <h2 className="text-base font-semibold text-foreground">Current Year Balances</h2>

        {/* Days / Hours toggle */}
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

      {/* Table */}
      <div className="rounded-lg border border-border/50 overflow-hidden mb-10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border/50">
              <th className="py-2.5 pl-3 pr-2 text-left text-[11px] font-medium text-muted-foreground">ប្រភេទច្បាប់</th>
              <th className="py-2.5 px-2 text-right text-[11px] font-medium text-muted-foreground">ផ្តល់</th>
              <th className="py-2.5 px-2 text-right text-[11px] font-medium text-muted-foreground">បានប្រើ</th>
              <th className="py-2.5 pl-2 pr-3 text-right text-[11px] font-medium text-muted-foreground">នៅសល់</th>
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
              />
            ))}
          </tbody>
        </table>
      </div>
    </Container>
  );
};

export default UserBalances;