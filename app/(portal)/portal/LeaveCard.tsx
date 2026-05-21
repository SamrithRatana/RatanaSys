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
  SICK:      "ច្បាប់លើឆ្មាំឆ្នន",
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

function detectMaternityGender(credit: number, used: number): "MALE" | "FEMALE" | null {
  if (credit === 7  || (credit === 0 && used > 0 && used <= 7))  return "MALE";
  if (credit === 90 || (credit === 0 && used > 7))               return "FEMALE";
  return null;
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

  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">

      {/* Leave type */}
      <td className="py-3 pl-3 pr-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium text-foreground leading-tight">
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
      <td className="py-3 px-2 text-right">
        {notApplied
          ? <span className="text-[13px] text-muted-foreground italic">—</span>
          : <span className="text-[13px] text-foreground">{formatValue(creditVal, isHours)}</span>
        }
      </td>

      {/* Used */}
      <td className="py-3 px-2 text-right">
        <span className="text-[13px] text-muted-foreground">{formatValue(usedVal, isHours)}</span>
      </td>

      {/* Balance */}
      <td className="py-3 pl-2 pr-3 text-right">
        {notApplied
          ? <span className="text-[13px] text-muted-foreground italic">—</span>
          : <span className="text-[13px] font-medium text-green-700 dark:text-green-400">{formatValue(balanceVal, isHours)}</span>
        }
      </td>

    </tr>
  );
};

export default LeaveCard;