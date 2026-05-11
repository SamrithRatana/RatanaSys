"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const HOURS_PER_DAY = 8;

type LeaveCardProps = {
  year: string;
  leaveType: string;
  credit?: number;
  used: number;
  balance?: number;
  isHours?: boolean;
};

const VISIBLE_TYPES = ["ANNUAL", "SICK", "PERSONAL", "MATERNITY", "SPECIAL"];

const leaveKhmerLabels: Record<string, string> = {
  ANNUAL:    "ច្បាប់ប្រចាំឆ្នាំ",
  SICK:      "ច្បាប់ឈឺផ្ទាល់ខ្លួន",
  PERSONAL:  "ច្បាប់ផ្ទាល់ខ្លួន",
  MATERNITY: "ច្បាប់មាតុភាព",
  SPECIAL:   "ច្បាប់ពិសេស",
};

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

// Detect gender from credit value for maternity
function detectMaternityGender(credit: number): "MALE" | "FEMALE" | null {
  if (credit === 7)  return "MALE";
  if (credit === 90) return "FEMALE";
  return null; // 0 = not yet applied
}

const LeaveCard = ({
  year,
  leaveType,
  credit,
  used,
  balance,
  isHours = true,
}: LeaveCardProps) => {
  if (!VISIBLE_TYPES.includes(leaveType)) return null;

  const isMaternity = leaveType === "MATERNITY";
  const creditVal   = credit ?? 0;
  const gender      = isMaternity ? detectMaternityGender(creditVal) : null;
  const notApplied  = isMaternity && creditVal === 0;

  return (
    <Card>
      <CardContent className="flex flex-col p-3 space-y-2">

        {/* Header row */}
        <div className="flex items-center justify-between p-2 bg-blue-50 rounded-md dark:bg-slate-900">
          <h4 className="font-semibold">{year}</h4>
          <h4 className="font-semibold">{leaveKhmerLabels[leaveType] ?? leaveType}</h4>
        </div>

        {/* Maternity gender badge */}
        {isMaternity && (
          <div className="flex justify-center">
            {notApplied ? (
              // Not yet requested
              <Badge
                variant="outline"
                className="text-[11px] text-gray-500 border-gray-300 bg-gray-50 px-2 py-0.5"
              >
                ⏳ អត់ទាន់ស្នើ · Credit អនុវត្តតាមភេទ
              </Badge>
            ) : gender === "MALE" ? (
              // Male / Paternity
              <Badge
                variant="outline"
                className="text-[11px] text-blue-600 border-blue-300 bg-blue-50 px-2 py-0.5"
              >
                👨 បុរស · Paternity · 7 ថ្ងៃ
              </Badge>
            ) : gender === "FEMALE" ? (
              // Female / Maternity
              <Badge
                variant="outline"
                className="text-[11px] text-pink-600 border-pink-300 bg-pink-50 px-2 py-0.5"
              >
                👩 ស្ត្រី · Maternity · 90 ថ្ងៃ
              </Badge>
            ) : null}
          </div>
        )}

        {/* Credit */}
        <div className="flex items-center justify-between">
          <h4 className="text-sm text-muted-foreground">Credit</h4>
          {notApplied ? (
            <span className="text-sm text-gray-400 italic">— មិនទាន់អនុវត្ត</span>
          ) : (
            <h4 className="text-sm font-medium">{formatValue(creditVal, isHours)}</h4>
          )}
        </div>

        {/* Used */}
        <div className="flex items-center justify-between">
          <h4 className="text-sm text-muted-foreground">Used</h4>
          <h4 className="text-sm font-medium">{formatValue(used ?? 0, isHours)}</h4>
        </div>

        {/* Balance */}
        <div className="flex items-center justify-between">
          <h4 className="text-sm text-muted-foreground">Balance</h4>
          {notApplied ? (
            <span className="text-sm text-gray-400 italic">— មិនទាន់អនុវត្ត</span>
          ) : (
            <h4 className="text-sm font-medium">{formatValue(balance ?? 0, isHours)}</h4>
          )}
        </div>

      </CardContent>
    </Card>
  );
};

export default LeaveCard;