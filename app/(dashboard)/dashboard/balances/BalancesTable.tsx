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
import { Balances } from "@prisma/client";
import EditBalances from "./EditBalances";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type BalanceProps = {
  balances: Balances[];
};

const HOURS_PER_DAY = 8;

const balanceCategories = [
  { title: "ANNUAL",    key: "annual"    },
  { title: "SICK",      key: "sick"      },
  { title: "PERSONAL",  key: "personal"  },
  { title: "MATERNITY", key: "maternity" },
  { title: "SPECIAL",   key: "special"   },
  // SHORT removed — short leave now deducts from annual
];

const BalancesTable = ({ balances }: BalanceProps) => {
  const [isHours, setIsHours] = useState(false);

  const convert = (key: string, sub: string, val: number | undefined | null): React.ReactNode => {
    if (val === undefined || val === null) val = 0;
    const result = isHours ? val * HOURS_PER_DAY : val;
    const unit   = isHours ? " hrs" : "";
    return `${result}${unit}`;
  };

  return (
    <TableWrapper title="All User Balances">
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
              <TableHead key={cat.key} colSpan={3} className="text-center border">
                {cat.title}
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
                ["Credit", "Used", "Available"].map((sub) => (
                  <TableCell key={`${cat.key}-${sub}`}>
                    {convert(cat.key, sub, (bal as any)[`${cat.key}${sub}`])}
                  </TableCell>
                ))
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableWrapper>
  );
};

export default BalancesTable;