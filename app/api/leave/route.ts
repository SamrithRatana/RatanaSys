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
  startTime?:       string;
  endTime?:         string;
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

function formatTotalMinutes(totalMin: number): string {
  if (totalMin <= 0) return "0 ម៉ោង";

  const FULL_DAY = 8 * 60;
  const HALF_DAY = 4 * 60;

  const wholeDays = Math.floor(totalMin / FULL_DAY);
  const remMin    = totalMin % FULL_DAY;

  if (remMin === 0) return `${wholeDays} ថ្ងៃ`;

  if (wholeDays === 0) {
    if (remMin === HALF_DAY) return "កន្លះថ្ងៃ";
    const h = Math.floor(remMin / 60);
    const m = remMin % 60;
    if (h === 0) return `${m} នាទី`;
    if (m === 0) return `${h} ម៉ោង`;
    return `${h} ម៉ោង ${m} នាទី`;
  }

  if (remMin === HALF_DAY) return `${wholeDays} ថ្ងៃកន្លះ`;
  const h = Math.floor(remMin / 60);
  const m = remMin % 60;
  const timeStr = m === 0 ? `${h} ម៉ោង` : `${h} ម៉ោង ${m} នាទី`;
  return `${wholeDays} ថ្ងៃ ${timeStr}`;
}

function formatHourLabel(h: number): string {
  return formatTotalMinutes(Math.round(h * 60));
}

function formatSegmentLine(seg: Segment): string {
  const startLabel = safeFormat(seg.date, "dd MMM yyyy");
  const h = seg.hours ?? 0;
  const d = seg.days  ?? 0;

  // multi-day full range — no time
  if (d > 1) {
    const endLabel = safeFormat(seg.endDate ?? seg.date, "dd MMM yyyy");
    return `  📌 ${startLabel} → ${endLabel} · ${d} ថ្ងៃ`;
  }
  // exactly 1 full day — no time
  if (d === 1) return `  📌 ${startLabel} · 1 ថ្ងៃ`;
  // >= 8h treated as full day — no time
  if (h >= 8)  return `  📌 ${startLabel} · 1 ថ្ងៃ`;

  // sub-day hourly — show time range
  const timeRange =
    seg.startTime && seg.endTime
      ? ` (${seg.startTime}–${seg.endTime})`
      : h === 4 ? ` (08:00–12:00)` : "";

  return `  📌 ${startLabel} · ${formatHourLabel(h)}${timeRange}`;
}

function computeTotalLabel(segs: Segment[]): string {
  let totalMin = 0;
  for (const seg of segs) {
    const h = seg.hours ?? 0;
    const d = seg.days  ?? 0;
    if (d >= 1)      totalMin += d * 8 * 60;
    else if (h >= 8) totalMin += 8 * 60;
    else             totalMin += Math.round(h * 60);
  }
  return formatTotalMinutes(totalMin);
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
    // SEGMENT MODE
    // ────────────────────────────────────────────────────────────────────────
    if (isSegmentMode) {
      const year = safeParse(segments[0].date).getFullYear().toString();

      let totalDays  = 0;
      let totalHours = 0;

      for (const seg of segments) {
        const h = seg.hours ?? 0;
        const d = seg.days  ?? 0;
        if (d >= 1)      totalDays  += d;
        else if (h >= 8) totalDays  += 1;
        else             totalHours += h;
      }

      if (totalHours >= 8) {
        totalDays  += Math.floor(totalHours / 8);
        totalHours  = totalHours % 8;
      }

      const allStartDates = segments.map(s => safeParse(s.date));
      const allEndDates   = segments.map(s => safeParse(s.endDate ?? s.date));
      const startDateObj  = new Date(Math.min(...allStartDates.map(d => d.getTime())));
      const endDateObj    = new Date(Math.max(...allEndDates.map(d => d.getTime())));

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
          segments:  segments as any,
        },
      });

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
    // CLASSIC MODE
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
      if (h >= 8) { calcDays = 1; calcHours = h; }
      else        { calcDays = 0; calcHours = h; }
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
      },
    });

    const baseUrl    = process.env.NEXTAUTH_URL ?? "https://system.camprotec.com.kh";
    const leaveUrl   = `${baseUrl}/dashboard/leaves/${createdLeave.id}`;
    const leaveLabel = getLeaveLabel(leaveType, maternityGender);

    // ── Smart duration label ──────────────────────────────────────────────
    const durationLabel = (() => {
      if (isHourlyLeave) {
        const totalMin = calcDays * 8 * 60 + Math.round(calcHours * 60);
        return formatTotalMinutes(totalMin);
      }
      if (isMaternity && maternityGender) return `${calcDays} ថ្ងៃ`;
      if (calcDays === 1) return "1 ថ្ងៃ";
      return `${calcDays} ថ្ងៃ`;
    })();

    // ── Time range suffix — only for sub-day hourly leaves ────────────────
    const bodyStartTime = body.startTime;
    const bodyEndTime   = body.endTime;
    const timeRangeSuffix =
      isHourlyLeave && calcDays === 0 && bodyStartTime && bodyEndTime
        ? ` · ${bodyStartTime}–${bodyEndTime}`
        : "";

    const dateRange = (() => {
      const s = safeFormat(startDate, "dd MMM yyyy");
      const e = safeFormat(endDate,   "dd MMM yyyy");

      // Sub-day hourly — show duration + time range
      if (isHourlyLeave && calcDays === 0) {
        return `${s} (${durationLabel}${timeRangeSuffix})`;
      }
      // >= 8h treated as 1 full day — no time
      if (isHourlyLeave && calcDays >= 1) {
        return s === e ? `${s} (${durationLabel})` : `${s} → ${e} (${durationLabel})`;
      }
      if (isMaternity && maternityGender) return `${s} → ${e} (${calcDays} ថ្ងៃ)`;
      if (calcDays === 1) return `${s} (1 ថ្ងៃ)`;
      return `${s} → ${e} (${calcDays} ថ្ងៃ)`;
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