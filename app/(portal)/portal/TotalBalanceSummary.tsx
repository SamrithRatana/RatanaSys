"use client";

import { Balances } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const HOURS_PER_DAY = 8;
const LEAVE_KEYS = ["annual", "sick", "personal", "maternity", "special"] as const;

function formatValue(val: number, isHours: boolean): string {
  if (val === 0) return isHours ? "0 hrs" : "0 days";

  if (isHours) {
    const totalHours = Math.round(val * HOURS_PER_DAY * 100) / 100;
    return `${totalHours} hrs`;
  }

  const wholeDays    = Math.floor(val);
  const remainingHrs = Math.round((val - wholeDays) * HOURS_PER_DAY);

  if (wholeDays === 0)    return `${remainingHrs} hr${remainingHrs !== 1 ? "s" : ""}`;
  if (remainingHrs === 0) return `${wholeDays} day${wholeDays !== 1 ? "s" : ""}`;
  return `${wholeDays} day${wholeDays !== 1 ? "s" : ""} ${remainingHrs} hr${remainingHrs !== 1 ? "s" : ""}`;
}

type Props = { balances: Balances };

export default function TotalBalanceSummary({ balances }: Props) {
  const [isHours, setIsHours] = useState(false);

  const totalUsed = LEAVE_KEYS.reduce((sum, key) => {
    return sum + (Number((balances as any)[`${key}Used`]) || 0);
  }, 0);

  const totalAvailable = LEAVE_KEYS.reduce((sum, key) => {
    return sum + (Number((balances as any)[`${key}Available`]) || 0);
  }, 0);

  const isNegative = totalAvailable < 0;

  return (
    <div className="mt-4">
      {/* Days / Hours toggle */}
      <div className="flex items-center gap-2 justify-end mb-3">
        <Label className="text-sm text-muted-foreground">Days</Label>
        <Switch checked={isHours} onCheckedChange={setIsHours} />
        <Label className="text-sm text-muted-foreground">Hours</Label>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Total Used */}
        <Card className="border border-orange-200 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
              Total Used
            </p>
            <p
  className="font-bold text-orange-700 dark:text-orange-300 leading-tight"
  style={{ fontSize: "clamp(0.85rem, 2.5vw, 1.5rem)" }}
>
  {formatValue(totalUsed, isHours)}
</p>
          </CardContent>
        </Card>

        {/* Total Balance */}
        <Card
          className={`border ${
            isNegative
              ? "border-red-200 bg-red-50 dark:bg-red-950/20"
              : "border-green-200 bg-green-50 dark:bg-green-950/20"
          }`}
        >
          <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-1">
            <p
              className={`text-xs font-semibold uppercase tracking-wide ${
                isNegative
                  ? "text-red-600 dark:text-red-400"
                  : "text-green-600 dark:text-green-400"
              }`}
            >
              Total Balance
            </p>
            <p
  className={`font-bold leading-tight ${
    isNegative
      ? "text-red-700 dark:text-red-300"
      : "text-green-700 dark:text-green-300"
  }`}
  style={{ fontSize: "clamp(0.85rem, 2.5vw, 1.5rem)" }}
>
  {formatValue(totalAvailable, isHours)}
</p>
            {isNegative && (
              <span className="text-[10px] bg-red-100 text-red-600 border border-red-300 rounded px-1.5 py-0.5 font-medium">
                over limit
              </span>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}