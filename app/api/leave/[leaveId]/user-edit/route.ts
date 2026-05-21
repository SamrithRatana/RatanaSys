import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { LeaveStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { differenceInDays, format } from "date-fns";
import { editTelegramMessage } from "@/lib/sendTelegramMessage";

type UserEditBody = {
  notes:            string;
  startDate:        string;
  endDate:          string;
  hours?:           number;
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

function formatHourLabel(h: number): string {
  const totalMin = Math.round(h * 60);
  if (totalMin < 60) return `${totalMin} នាទី`;
  if (totalMin % 60 === 0) return `${totalMin / 60} ម៉ោង`;
  const hrs = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return `${hrs} ម៉ោង ${min} នាទី`;
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
    const { notes, startDate, endDate, hours, maternityGender } = body;

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

    // ── Build duration + date range for Telegram ──────────────────────────────
    const durationLabel = (() => {
      if (isShortLeave) return formatHourLabel(calcHours);
      return `${calcDays} ថ្ងៃ`;
    })();

    const dateRange = (() => {
      const s = format(startDateObj, "dd MMM yyyy");
      const e = format(endDateObj,   "dd MMM yyyy");
      if (isShortLeave) return `${s} (${durationLabel})`;
      if (s === e)      return `${s} (${durationLabel})`;
      return `${s} → ${e} (${durationLabel})`;
    })();

    // ── Edit the original Telegram message if we have its ID ─────────────────
    const msgId = leave.telegramMessageId;
    if (msgId) {
      const baseUrl    = process.env.NEXTAUTH_URL ?? "https://system.camprotec.com.kh";
      const leaveUrl   = `${baseUrl}/dashboard/leaves/${leave.id}`;
      const leaveLabel = getLeaveLabel(leave.type, maternityGender);

      await editTelegramMessage(
        msgId,
        [
          `✏️ <b>សំណើច្បាប់បានកែប្រែ</b>`,
          ``,
          `👤 <b>ឈ្មោះ៖</b> ${leave.userName}`,
          `📋 <b>ប្រភេទ៖</b> ${leaveLabel}`,
          ...(isMaternity && maternityGender
            ? [`⚧ <b>ភេទ៖</b> ${maternityGender === "MALE" ? "បុរស 👨" : "ស្ត្រី 👩"}`]
            : []),
          `📅 <b>កាលបរិច្ឆេទ៖</b> ${dateRange}`,
          `⏱ <b>រយៈពេល៖</b> ${durationLabel}`,
          `📝 <b>មូលហេតុ៖</b> ${notes || "—"}`,
          ``,
          `✏️ <i>បានកែប្រែដោយអ្នកស្នើ · រង់ចាំអនុម័តពីប្រធានផ្នែក</i>`,
        ].join("\n"),
        [{ text: "👀 មើល និងអនុម័តប្រធានផ្នែក →", url: leaveUrl }]
      );
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

    // ── Edit Telegram to show cancelled ──────────────────────────────────────
    const msgId = leave.telegramMessageId;
    if (msgId) {
      const leaveLabel = getLeaveLabel(leave.type);

      // Re-build date range from original DB values
      const s = format(leave.startDate, "dd MMM yyyy");
      const e = format(leave.endDate,   "dd MMM yyyy");
      const storedDays  = Number(leave.days  ?? 0);
      const storedHours = Number(leave.hours ?? 0);
      const isShort     = leave.type === "SHORT";
      const durationLabel = isShort
        ? formatHourLabel(storedHours)
        : `${storedDays} ថ្ងៃ`;
      const dateRange = (isShort || s === e)
        ? `${s} (${durationLabel})`
        : `${s} → ${e} (${durationLabel})`;

      await editTelegramMessage(
        msgId,
        [
          `🚫 <b>សំណើច្បាប់បានលុបចោល</b>`,
          ``,
          `👤 <b>ឈ្មោះ៖</b> ${leave.userName}`,
          `📋 <b>ប្រភេទ៖</b> ${leaveLabel}`,
          `📅 <b>កាលបរិច្ឆេទ៖</b> ${dateRange}`,
          `⏱ <b>រយៈពេល៖</b> ${durationLabel}`,
          ``,
          `❌ <i>លុបចោលដោយអ្នកស្នើ</i>`,
        ].join("\n")
      );
    }

    return NextResponse.json({ message: "Leave cancelled" }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}