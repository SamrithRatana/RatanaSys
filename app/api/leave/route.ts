import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { differenceInDays, format } from "date-fns";
import { sendTelegramMessage } from "@/lib/sendTelegramMessage";

type SubmittedLeave = {
  notes:            string;
  leave?:           string;
  type?:            string;
  maternityGender?: "MALE" | "FEMALE";
  startDate:        string;
  endDate:          string;
  hours?:           number;
  days?:            number;
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

export async function POST(req: NextRequest) {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: SubmittedLeave = await req.json();
    const { startDate, endDate, notes, hours, days: frontendDays, user, maternityGender } = body;

    const leaveType   = (body.type ?? body.leave ?? "").toUpperCase();
    const isMaternity = leaveType === "MATERNITY";
    const isPersonal  = leaveType === "PERSONAL";
    const isSick      = leaveType === "SICK";

    // Both PERSONAL and SICK support hourly (partial-day) requests
    const isHourlyLeave = (isPersonal || isSick) && !!hours && hours > 0;

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
        // Full day via time picker (e.g. 08:00–17:00 = 9 hrs) → 1 ថ្ងៃ
        calcDays  = 1;
        calcHours = h;
      } else {
        // Partial day → store hours, days = 0 for balance calc
        calcDays  = 0;
        calcHours = h;
      }
    } else {
      calcDays  = frontendDays ?? (differenceInDays(endDateObj, startDateObj) + 1);
      calcHours = 0;
    }

    // ── Auto-set maternity credit ─────────────────────────────────────────────
    if (isMaternity && maternityGender) {
      const creditDays      = MATERNITY_DAYS[maternityGender];
      const existingBalance = await prisma.balances.findFirst({
        where: { email: user.email, year },
      });

      if (existingBalance) {
        if ((existingBalance.maternityCredit as number) === 0) {
          await prisma.balances.update({
            where: { id: existingBalance.id },
            data: { maternityCredit: creditDays, maternityAvailable: creditDays },
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

    // ── Create leave record ───────────────────────────────────────────────────
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

    // ── Duration label for Telegram ⏱ line ───────────────────────────────────
    const durationLabel = (() => {
      if (isHourlyLeave) {
        // Full day via time picker
        if (calcDays === 1) return "1 ថ្ងៃ";
        // Partial day
        return formatHourLabel(calcHours);
      }
      if (isMaternity && maternityGender) return `${calcDays} ថ្ងៃ`;
      if (calcDays === 1) return "1 ថ្ងៃ";
      return `${calcDays} ថ្ងៃ`;
    })();

    // ── Date range for Telegram 📅 line ──────────────────────────────────────
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

    // ── Send Telegram notification ────────────────────────────────────────────
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