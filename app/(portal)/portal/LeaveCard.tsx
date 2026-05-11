"use client";

import { Card, CardContent } from "@/components/ui/card";

const HOURS_PER_DAY = 8;

type LeaveCardProps = {
  year: string;
  leaveType: string;
  credit?: number;
  used: number;
  balance?: number;
  isHours: boolean;
};

const VISIBLE_TYPES = ["ANNUAL", "SICK", "PERSONAL", "MATERNITY", "SPECIAL"];

const leaveKhmerLabels: Record<string, string> = {
  ANNUAL:    "ច្បាប់ប្រចាំឆ្នាំ",
  SICK:      "ច្បាប់ឈឺផ្ទាល់ខ្លួន",
  PERSONAL:  "ច្បាប់ផ្ទាល់ខ្លួន",
  MATERNITY: "ច្បាប់មាតុភាព",
  SPECIAL:   "ច្បាប់ពិសេស",
};

// Converts a decimal day value to a human-readable string.
// In Days mode:  5.125 → "5 days 1 hr",  0.5 → "4 hrs",  3 → "3 days"
// In Hours mode: 5.125 → "41 hrs",        0.5 → "4 hrs",  3 → "24 hrs"
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

const LeaveCard = ({ year, leaveType, credit, used, balance, isHours }: LeaveCardProps) => {
  if (!VISIBLE_TYPES.includes(leaveType)) return null;

  return (
    <Card>
      <CardContent className="flex flex-col p-3 space-y-2">
        <div className="flex items-center justify-between p-2 bg-blue-50 rounded-md font-semibold dark:bg-slate-900">
          <h4>{year}</h4>
          <h4>{leaveKhmerLabels[leaveType] ?? leaveType}</h4>
        </div>

        <div className="flex items-center justify-between">
          <h4>Credit</h4>
          <h4>{formatValue(credit ?? 0, isHours)}</h4>
        </div>

        <div className="flex items-center justify-between">
          <h4>Used</h4>
          <h4>{formatValue(used ?? 0, isHours)}</h4>
        </div>

        <div className="flex items-center justify-between">
          <h4>Balance</h4>
          <h4>{formatValue(balance ?? 0, isHours)}</h4>
        </div>
      </CardContent>
    </Card>
  );
};

export default LeaveCard;
