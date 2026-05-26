import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { differenceInDays, format } from "date-fns";
import { sendTelegramMessage } from "@/lib/sendTelegramMessage";

type Segment = {
  date:       string;
  endDate?:   string;
  hours?:     number;
  days?:      number;
  startTime?: string;
  endTime?:   string;
};

type SubmittedLeave = {
  notes:            string;
  leave?:           string;
  type?:            string;
  maternityGender?: "MALE" | "FEMALE";
  startDate:        string;
  endDate:          string;
  hours?:           number;
  days?:            number;
  segments?:        Segment[];
  user: {
    email: string;
    image: string;
    name:  string;
    role:  string;
    id?:   string;
  };
};

const MATERNITY_DAYS: Record<string, number> = { MALE: 7, FEMALE: 90 };

function getLeaveLabel(type: string, gender?: string): string {
  if (type === "MATERNITY") {
    return gender === "MALE"
      ? "ច្បាប់មាតុភាព (បុរស · Paternity · 7ថ្ងៃ)"
      : "ច្បាប់មាតុភាព (ស្ត្រី · Maternity · 90ថ្ងៃ)";
  }
  const labels: Record<string, string> = {
    ANNUAL:   "ច្បាប់ឈប់សម្រាកប្រចាំឆ្នាំ",
    SICK:     "ច្បាប់ឈប់សម្រាកឈឺ",
    PERSONAL: "ច្បាប់ឈប់សម្រាកផ្ទាល់ខ្លួន",
    SPECIAL:  "ច្បាប់ឈប់សម្រាកពិសេស",
    SHORT:    "ច្បាប់ឈប់សម្រាករយះពេលខ្លី",
  };
  return labels[type.toUpperCase()] ?? `ច្បាប់ ${type}`;
}

function safeParse(isoString: string): Date {
  const dateOnly = isoString.split("T")[0];
  return new Date(`${dateOnly}T12:00:00.000Z`);
}

function safeFormat(isoString: string, fmt: string): string {
  return format(safeParse(isoString), fmt);
}

function formatHourLabel(h: number): string {
  const totalMin = Math.round(h * 60);
  if (totalMin < 60) return `${totalMin} នាទី`;
  if (totalMin % 60 === 0) return `${totalMin / 60} ម៉ោង`;
  const hrs = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return `${hrs} ម៉ោង ${min} នាទី`;
}

function formatSegmentLine(seg: Segment): string {
  const startLabel = safeFormat(seg.date, "dd MMM yyyy");
  const h = seg.hours ?? 0;
  const d = seg.days  ?? 0;

  // Multi-day full range (e.g. 26 May → 28 May · 3 ថ្ងៃ)
  if (d > 1) {
    const endLabel = safeFormat(seg.endDate ?? seg.date, "dd MMM yyyy");
    return `  📌 ${startLabel} → ${endLabel} · ${d} ថ្ងៃ`;
  }
  // Single full day
  if (d === 1) {
    return `  📌 ${startLabel} · 1 ថ្ងៃ`;
  }
  // Hours >= 8 counts as full day
  if (h >= 8) {
    return `  📌 ${startLabel} · 1 ថ្ងៃ`;
  }
  // Partial hours with optional time range
  const timeRange =
    seg.startTime && seg.endTime
      ? ` (${seg.startTime}–${seg.endTime})`
      : "";
  return `  📌 ${startLabel} · ${formatHourLabel(h)}${timeRange}`;
}

function computeTotalLabel(segs: Segment[]): string {
  let totalMin = 0;
  for (const seg of segs) {
    const h = seg.hours ?? 0;
    const d = seg.days  ?? 0;
    if (d >= 1) {
      totalMin += d * 8 * 60;
    } else if (h >= 8) {
      totalMin += 8 * 60;
    } else {
      totalMin += Math.round(h * 60);
    }
  }
  if (totalMin === 0) return "0 ម៉ោង";
  if (totalMin % (8 * 60) === 0) return `${totalMin / (8 * 60)} ថ្ងៃ`;
  const wholeDays = Math.floor(totalMin / (8 * 60));
  const remMin    = totalMin % (8 * 60);
  const daysStr   = wholeDays > 0 ? `${wholeDays} ថ្ងៃ ` : "";
  const remHrs    = Math.floor(remMin / 60);
  const remMins   = remMin % 60;
  const timeStr   =
    remMins === 0
      ? `${remHrs} ម៉ោង`
      : `${remHrs} ម៉ោង ${remMins} នាទី`;
  return `${daysStr}${timeStr}`;
}

export async function POST(req: NextRequest) {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: SubmittedLeave = await req.json();
    const {
      startDate, endDate, notes, hours, days: frontendDays,
      user, maternityGender, segments,
    } = body;

    const leaveType   = (body.type ?? body.leave ?? "").toUpperCase();
    const isMaternity = leaveType === "MATERNITY";
    const isPersonal  = leaveType === "PERSONAL";
    const isSick      = leaveType === "SICK";
    const isAnnual    = leaveType === "ANNUAL";

    const isSegmentMode =
      (isPersonal || isSick || isAnnual) &&
      !!segments &&
      segments.length > 0;

    // ────────────────────────────────────────────────────────────────────────
    // SEGMENT MODE — ONE DB record (aggregated), one Telegram message
    // ────────────────────────────────────────────────────────────────────────
    if (isSegmentMode) {
      const year = safeParse(segments[0].date).getFullYear().toString();

      // ── Aggregate totals ─────────────────────────────────────────────────
      let totalDays  = 0;
      let totalHours = 0;

      for (const seg of segments) {
        const h = seg.hours ?? 0;
        const d = seg.days  ?? 0;

        if (d >= 1) {
          totalDays += d;
        } else if (h >= 8) {
          totalDays += 1;
        } else {
          totalHours += h;
        }
      }

      // Normalise: every 8 accumulated hours → 1 extra day
      if (totalHours >= 8) {
        totalDays  += Math.floor(totalHours / 8);
        totalHours  = totalHours % 8;
      }

      // Date range: earliest start → latest end across all segments
      const allStartDates = segments.map(s => safeParse(s.date));
      const allEndDates   = segments.map(s => safeParse(s.endDate ?? s.date));
      const startDateObj  = new Date(Math.min(...allStartDates.map(d => d.getTime())));
      const endDateObj    = new Date(Math.max(...allEndDates.map(d => d.getTime())));

      // ── Single DB record — include raw segments JSON ─────────────────────
      const createdLeave = await prisma.leave.create({
        data: {
          startDate: startDateObj,
          endDate:   endDateObj,
          userEmail: user.email,
          type:      leaveType,
          userNote:  notes,
          userName:  user.name,
          days:      totalDays,
          hours:     totalHours,
          year,
          // ↓ persist the raw segment array so approvals can show the same detail
          segments:  segments as any,
        },
      });

      // ── Telegram message ─────────────────────────────────────────────────
      const baseUrl    = process.env.NEXTAUTH_URL ?? "https://system.camprotec.com.kh";
      const leaveUrl   = `${baseUrl}/dashboard/leaves/${createdLeave.id}`;
      const leaveLabel = getLeaveLabel(leaveType);
      const totalLabel = computeTotalLabel(segments);
      const segLines   = segments.map(formatSegmentLine);

      const telegramMessageId = await sendTelegramMessage(
        [
          `📄 <b>សំណើច្បាប់ថ្មី</b>`,
          ``,
          `👤 <b>ឈ្មោះ៖</b> ${user.name}`,
          `📋 <b>ប្រភេទ៖</b> ${leaveLabel}`,
          ``,
          `📅 <b>កាលបរិច្ឆេទ (${segments.length} segment):</b>`,
          ...segLines,
          ``,
          `⏱ <b>រយៈពេលសរុប៖</b> ${totalLabel}`,
          `📝 <b>មូលហេតុ៖</b> ${notes || "—"}`,
          ``,
          `⏳ <i>រង់ចាំអនុម័តពីប្រធានផ្នែក</i>`,
        ].join("\n"),
        [{ text: "👀 មើល និងអនុម័តប្រធានផ្នែក →", url: leaveUrl }]
      );

      if (telegramMessageId) {
        await prisma.leave.update({
          where: { id: createdLeave.id },
          data:  { telegramMessageId },
        });
      }

      return NextResponse.json({ message: "Success" }, { status: 200 });
    }

    // ────────────────────────────────────────────────────────────────────────
    // CLASSIC MODE — MATERNITY / SPECIAL / date-range flexible leave
    // ────────────────────────────────────────────────────────────────────────
    const isHourlyLeave =
      (isPersonal || isSick || isAnnual) && !!hours && hours > 0;

    const startDateObj = safeParse(startDate);
    const endDateObj   = safeParse(endDate);
    const year         = startDateObj.getFullYear().toString();

    let calcDays:  number;
    let calcHours: number;

    if (isMaternity && maternityGender) {
      calcDays  = MATERNITY_DAYS[maternityGender] ?? 90;
      calcHours = 0;
    } else if (isHourlyLeave) {
      const h = Number(hours);
      if (h >= 8) {
        calcDays  = 1;
        calcHours = h;
      } else {
        calcDays  = 0;
        calcHours = h;
      }
    } else {
      calcDays  = frontendDays ?? (differenceInDays(endDateObj, startDateObj) + 1);
      calcHours = 0;
    }

    // Auto-set maternity credit
    if (isMaternity && maternityGender) {
      const creditDays      = MATERNITY_DAYS[maternityGender];
      const existingBalance = await prisma.balances.findFirst({
        where: { email: user.email, year },
      });

      if (existingBalance) {
        if ((existingBalance.maternityCredit as number) === 0) {
          await prisma.balances.update({
            where: { id: existingBalance.id },
            data: {
              maternityCredit:    creditDays,
              maternityAvailable: creditDays,
            },
          });
        }
      } else {
        await prisma.balances.create({
          data: {
            email: user.email, name: user.name, year,
            annualCredit: 0, annualAvailable: 0, annualUsed: 0,
            sickCredit: 0, sickAvailable: 0, sickUsed: 0,
            personalCredit: 0, personalAvailable: 0, personalUsed: 0,
            maternityCredit: creditDays, maternityAvailable: creditDays, maternityUsed: 0,
            specialCredit: 0, specialAvailable: 0, specialUsed: 0,
            shortUsed: 0,
          },
        });
      }
    }

    const createdLeave = await prisma.leave.create({
      data: {
        startDate: startDateObj,
        endDate:   endDateObj,
        userEmail: user.email,
        type:      leaveType,
        userNote:  notes,
        userName:  user.name,
        days:      calcDays,
        hours:     calcHours,
        year,
        // No segments for classic mode — field stays null
      },
    });

    const baseUrl    = process.env.NEXTAUTH_URL ?? "https://system.camprotec.com.kh";
    const leaveUrl   = `${baseUrl}/dashboard/leaves/${createdLeave.id}`;
    const leaveLabel = getLeaveLabel(leaveType, maternityGender);

    const durationLabel = (() => {
      if (isHourlyLeave) {
        if (calcDays === 1) return "1 ថ្ងៃ";
        return formatHourLabel(calcHours);
      }
      if (isMaternity && maternityGender) return `${calcDays} ថ្ងៃ`;
      if (calcDays === 1) return "1 ថ្ងៃ";
      return `${calcDays} ថ្ងៃ`;
    })();

    const dateRange = (() => {
      if (isHourlyLeave) {
        if (calcDays === 1) {
          return `${safeFormat(startDate, "dd MMM yyyy")} → ${safeFormat(endDate, "dd MMM yyyy")} (1 ថ្ងៃ)`;
        }
        return `${safeFormat(startDate, "dd MMM yyyy")} (${formatHourLabel(calcHours)})`;
      }
      if (isMaternity && maternityGender) {
        return `${safeFormat(startDate, "dd MMM yyyy")} → ${safeFormat(endDate, "dd MMM yyyy")} (${calcDays} ថ្ងៃ)`;
      }
      if (calcDays === 1) {
        return `${safeFormat(startDate, "dd MMM yyyy")} (1 ថ្ងៃ)`;
      }
      return `${safeFormat(startDate, "dd MMM yyyy")} → ${safeFormat(endDate, "dd MMM yyyy")} (${calcDays} ថ្ងៃ)`;
    })();

    const telegramMessageId = await sendTelegramMessage(
      [
        `📄 <b>សំណើច្បាប់ថ្មី</b>`,
        ``,
        `👤 <b>ឈ្មោះ៖</b> ${user.name}`,
        `📋 <b>ប្រភេទ៖</b> ${leaveLabel}`,
        ...(isMaternity && maternityGender
          ? [`⚧ <b>ភេទ៖</b> ${maternityGender === "MALE" ? "បុរស 👨" : "ស្ត្រី 👩"}`]
          : []),
        `📅 <b>កាលបរិច្ឆេទ៖</b> ${dateRange}`,
        `⏱ <b>រយៈពេល៖</b> ${durationLabel}`,
        `📝 <b>មូលហេតុ៖</b> ${notes || "—"}`,
        ``,
        `⏳ <i>រង់ចាំអនុម័តពីប្រធានផ្នែក</i>`,
      ].join("\n"),
      [{ text: "👀 មើល និងអនុម័តប្រធានផ្នែក →", url: leaveUrl }]
    );

    if (telegramMessageId) {
      await prisma.leave.update({
        where: { id: createdLeave.id },
        data:  { telegramMessageId },
      });
    }

    return NextResponse.json({ message: "Success" }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}