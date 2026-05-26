import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { LeaveStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { differenceInDays, format } from "date-fns";
import {
  sendTelegramMessage,
  deleteTelegramMessage,
  editTelegramMessage,
} from "@/lib/sendTelegramMessage";

type UserEditBody = {
  notes:            string;
  startDate:        string;
  endDate:          string;
  hours?:           number;
  startTime?:       string;
  endTime?:         string;
  maternityGender?: "MALE" | "FEMALE";
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

type Params = { params: { leaveId: string } };

// ── PATCH — user edits their own PENDING leave ────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const leave = await prisma.leave.findUnique({ where: { id: params.leaveId } });
    if (!leave) {
      return NextResponse.json({ error: "Leave not found" }, { status: 404 });
    }

    if (leave.userEmail !== loggedInUser.email) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (leave.status !== LeaveStatus.PENDING) {
      return NextResponse.json(
        { error: "Only pending leaves can be edited." },
        { status: 400 }
      );
    }

    const body: UserEditBody = await req.json();
    const { notes, startDate, endDate, hours, maternityGender, startTime, endTime } = body;

    const isShortLeave = leave.type === "SHORT";
    const isMaternity  = leave.type === "MATERNITY";

    const startDateObj = safeParse(startDate);
    const endDateObj   = safeParse(endDate);

    let calcDays: number;
    if (isMaternity && maternityGender) {
      calcDays = MATERNITY_DAYS[maternityGender] ?? 90;
    } else if (isShortLeave) {
      calcDays = 0;
    } else {
      calcDays = differenceInDays(endDateObj, startDateObj) + 1;
    }

    const calcHours = isShortLeave ? Number(hours ?? 0) : 0;

    await prisma.leave.update({
      where: { id: params.leaveId },
      data: {
        startDate: startDateObj,
        endDate:   endDateObj,
        userNote:  notes,
        days:      calcDays,
        hours:     calcHours,
        updatedAt: new Date().toISOString(),
      },
    });

    // ── Duration label ────────────────────────────────────────────────────
    const hoursVal = Number(calcHours);
    const daysVal  = Number(calcDays);

    const isHourlyLeave =
      (leave.type === "PERSONAL" || leave.type === "SICK" || leave.type === "ANNUAL") &&
      hoursVal > 0 &&
      daysVal === 0;

    const durationLabel = (() => {
      if (isShortLeave) return formatHourLabel(hoursVal);
      const totalMin = daysVal * 8 * 60 + Math.round(hoursVal * 60);
      return formatTotalMinutes(totalMin);
    })();

    // ── Time suffix — sub-day only ────────────────────────────────────────
    const durationLine =
      isHourlyLeave && daysVal === 0 && startTime && endTime
        ? `${durationLabel} (${startTime}–${endTime})`
        : durationLabel;

    // ── Date range — clean, no duration inside ────────────────────────────
    const dateRange = (() => {
      const s = format(startDateObj, "dd MMM yyyy");
      const e = format(endDateObj,   "dd MMM yyyy");
      if (isHourlyLeave && daysVal === 0) return s;
      if (s === e) return s;
      return `${s} → ${e}`;
    })();

    // ── Build message text & buttons ──────────────────────────────────────
    const baseUrl    = process.env.NEXTAUTH_URL ?? "https://system.camprotec.com.kh";
    const leaveUrl   = `${baseUrl}/dashboard/leaves/${leave.id}`;
    const leaveLabel = getLeaveLabel(leave.type, maternityGender);

    const msgText = [
      `✏️ <b>សំណើច្បាប់បានកែប្រែ</b>`,
      ``,
      `👤 <b>ឈ្មោះ៖</b> ${leave.userName}`,
      `📋 <b>ប្រភេទ៖</b> ${leaveLabel}`,
      ...(isMaternity && maternityGender
        ? [`⚧ <b>ភេទ៖</b> ${maternityGender === "MALE" ? "បុរស 👨" : "ស្ត្រី 👩"}`]
        : []),
      `📅 <b>កាលបរិច្ឆេទ៖</b> ${dateRange}`,
      `⏱ <b>រយៈពេល៖</b> ${durationLine}`,
      `📝 <b>មូលហេតុ៖</b> ${notes || "—"}`,
      ``,
      `✏️ <i>បានកែប្រែដោយអ្នកស្នើ · រង់ចាំអនុម័តពីប្រធានផ្នែក</i>`,
    ].join("\n");

    const msgButtons = [{ text: "👀 មើល និងអនុម័តប្រធានផ្នែក →", url: leaveUrl }];

    // ── Edit existing message, or send new if none exists ─────────────────
    const msgId = leave.telegramMessageId;

    if (msgId) {
      await editTelegramMessage(msgId, msgText, msgButtons);
    } else {
      const newMsgId = await sendTelegramMessage(msgText, msgButtons);
      if (newMsgId) {
        await prisma.leave.update({
          where: { id: params.leaveId },
          data:  { telegramMessageId: newMsgId },
        });
      }
    }

    return NextResponse.json({ message: "Leave updated" }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE — user cancels their own PENDING leave ─────────────────────────────
export async function DELETE(req: NextRequest, { params }: Params) {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const leave = await prisma.leave.findUnique({ where: { id: params.leaveId } });
    if (!leave) {
      return NextResponse.json({ error: "Leave not found" }, { status: 404 });
    }

    if (leave.userEmail !== loggedInUser.email) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (leave.status !== LeaveStatus.PENDING) {
      return NextResponse.json(
        { error: "Only pending leaves can be cancelled." },
        { status: 400 }
      );
    }

    await prisma.leave.delete({ where: { id: params.leaveId } });

    // Just delete the Telegram message — no new message sent
    if (leave.telegramMessageId) {
      await deleteTelegramMessage(leave.telegramMessageId);
    }

    return NextResponse.json({ message: "Leave cancelled" }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}