"use client";

import React, { useState } from "react";
import TableWrapper from "@/components/Common/TableWrapper";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Balances, User } from "@prisma/client";
import EditBalances from "./EditBalances";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import RequestForm from "@/app/(portal)/portal/RequestForm";

type BalanceProps = {
  balances: Balances[];
  user: User; // ← pass the current user so RequestForm can submit
};

const HOURS_PER_DAY = 8;

const balanceCategories = [
  { title: "ANNUAL",    key: "annual",    leaveType: "ANNUAL"    },
  { title: "SICK",      key: "sick",      leaveType: "SICK"      },
  { title: "PERSONAL",  key: "personal",  leaveType: "PERSONAL"  },
  { title: "MATERNITY", key: "maternity", leaveType: "MATERNITY" },
  { title: "SPECIAL",   key: "special",   leaveType: "SPECIAL"   },
];

const BalancesTable = ({ balances, user }: BalanceProps) => {
  const [isHours, setIsHours] = useState(true);

  // ── Dialog state ──────────────────────────────────────────────────────────
  const [dialogLeave, setDialogLeave] = useState<string | null>(null);

  const convert = (val: number | undefined | null): { display: string; negative: boolean } => {
    if (val === undefined || val === null) val = 0;
    const result  = isHours ? val * HOURS_PER_DAY : val;
    const unit    = isHours ? " hrs" : "";
    const negative = result < 0;
    return { display: `${result}${unit}`, negative };
  };

  return (
    <>
      {/* ── Hidden RequestForm — driven externally by table clicks ── */}
      <RequestForm
        user={user}
        defaultLeave={dialogLeave ?? undefined}
        externalOpen={dialogLeave !== null}
        onExternalClose={() => setDialogLeave(null)}
      />

      <TableWrapper title="All Employee Balances">
        {/* Toggle */}
        <div className="flex items-center gap-2 justify-end px-4 pb-2">
          <Label htmlFor="hours-toggle" className="text-sm text-muted-foreground">
            Days
          </Label>
          <Switch
            id="hours-toggle"
            checked={isHours}
            onCheckedChange={setIsHours}
          />
          <Label htmlFor="hours-toggle" className="text-sm text-muted-foreground">
            Hours
          </Label>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead rowSpan={2} className="text-center">Edit</TableHead>
              <TableHead rowSpan={2} className="text-center">User</TableHead>
              <TableHead rowSpan={2} className="text-center">Year</TableHead>
              {balanceCategories.map((cat) => (
                <TableHead
                  key={cat.key}
                  colSpan={3}
                  className="text-center border cursor-pointer select-none group hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                  onClick={() => setDialogLeave(cat.leaveType)}
                  title={`Click to request ${cat.title} leave`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {cat.title}
                    {/* small "+" hint */}
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-500 text-[11px] font-bold">
                      + Request
                    </span>
                  </span>
                </TableHead>
              ))}
            </TableRow>
            <TableRow>
              {balanceCategories.map((cat) =>
                ["Credit", "Used", "Available"].map((sub) => (
                  <TableHead key={`${cat.key}-${sub}`} className="text-center border">
                    {sub}
                  </TableHead>
                ))
              )}
            </TableRow>
          </TableHeader>

          <TableBody className="whitespace-nowrap text-center">
            {balances?.map((bal) => (
              <TableRow key={bal.id}>
                <TableCell><EditBalances balance={bal} /></TableCell>
                <TableCell>{bal.name}</TableCell>
                <TableCell><Badge>{bal.year}</Badge></TableCell>
                {balanceCategories.map((cat) =>
                  ["Credit", "Used", "Available"].map((sub) => {
                    const raw = (bal as any)[`${cat.key}${sub}`];
                    const { display, negative } = convert(raw);
                    const isAvailable = sub === "Available";
                    return (
                      <TableCell
                        key={`${cat.key}-${sub}`}
                        className={
                          isAvailable && negative
                            ? "text-red-500 font-semibold"
                            : ""
                        }
                      >
                        {isAvailable && negative ? (
                          <span className="inline-flex items-center gap-1">
                            {display}
                            <Badge
                              variant="outline"
                              className="text-[10px] text-red-600 border-red-300 bg-red-50 px-1 py-0"
                            >
                              over
                            </Badge>
                          </span>
                        ) : (
                          display
                        )}
                      </TableCell>
                    );
                  })
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrapper>
    </>
  );
};

export default BalancesTable;