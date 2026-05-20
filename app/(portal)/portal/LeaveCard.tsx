"use client";

import { Badge } from "@/components/ui/badge";

const HOURS_PER_DAY = 8;

type LeaveCardProps = {
  year:      string;
  leaveType: string;
  credit?:   number;
  used:      number;
  balance?:  number;
  isHours?:  boolean;
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

// Infer gender from credit value, falling back to used amount for legacy records
// where credit was never set by admin but leaves were already submitted.
function detectMaternityGender(credit: number, used: number): "MALE" | "FEMALE" | null {
  if (credit === 7  || (credit === 0 && used > 0 && used <= 7))  return "MALE";
  if (credit === 90 || (credit === 0 && used > 7))               return "FEMALE";
  return null;
}

function usagePercent(used: number, credit: number): number {
  if (credit === 0) return 0;
  return Math.min(100, Math.round((used / credit) * 100));
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
  const creditVal   = credit  ?? 0;
  const usedVal     = used    ?? 0;
  const balanceVal  = balance ?? 0;

  const gender     = isMaternity ? detectMaternityGender(creditVal, usedVal) : null;
  const notApplied = isMaternity && creditVal === 0 && usedVal === 0;
  const pct        = usagePercent(usedVal, creditVal);

  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">

      {/* Leave type */}
      <td className="py-3 pl-4 pr-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">
            {leaveKhmerLabels[leaveType] ?? leaveType}
          </span>
          {isMaternity && (
            notApplied ? (
              <Badge variant="outline" className="w-fit text-[10px] text-muted-foreground border-border px-1.5 py-0">
                អត់ទាន់ស្នើ · តាមភេទ
              </Badge>
            ) : gender === "MALE" ? (
              <Badge variant="outline" className="w-fit text-[10px] text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950 px-1.5 py-0">
                បុរស · Paternity · 7 ថ្ងៃ
              </Badge>
            ) : gender === "FEMALE" ? (
              <Badge variant="outline" className="w-fit text-[10px] text-pink-600 border-pink-200 bg-pink-50 dark:bg-pink-950 px-1.5 py-0">
                ស្ត្រី · Maternity · 90 ថ្ងៃ
              </Badge>
            ) : null
          )}
        </div>
      </td>

      {/* Credit */}
      <td className="py-3 px-4 text-right">
        {notApplied
          ? <span className="text-sm text-muted-foreground italic">—</span>
          : <span className="text-sm text-foreground">{formatValue(creditVal, isHours)}</span>
        }
      </td>

      {/* Used */}
      <td className="py-3 px-4 text-right">
        <span className="text-sm text-muted-foreground">{formatValue(usedVal, isHours)}</span>
      </td>

      {/* Balance */}
      <td className="py-3 px-4 text-right">
        {notApplied
          ? <span className="text-sm text-muted-foreground italic">—</span>
          : <span className="text-sm font-medium text-green-700 dark:text-green-400">{formatValue(balanceVal, isHours)}</span>
        }
      </td>

      {/* Progress */}
      <td className="py-3 pl-4 pr-4 w-28 hidden sm:table-cell">
        {!notApplied && creditVal > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[11px] text-muted-foreground w-7 text-right">{pct}%</span>
          </div>
        )}
      </td>

    </tr>
  );
};

export default LeaveCard;
