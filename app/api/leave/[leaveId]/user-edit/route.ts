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

type Params = { params: { leaveId: string } };  // ← matches your folder name

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

    // Only the owner can edit
    if (leave.userEmail !== loggedInUser.email) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only PENDING leaves can be edited
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

    // ── Edit the original Telegram message if we have its ID ─────────────────
    const msgId = leave.telegramMessageId;
    if (msgId) {
      const baseUrl    = process.env.NEXTAUTH_URL ?? "https://system.camprotec.com.kh";
      const leaveUrl   = `${baseUrl}/dashboard/leaves/${leave.id}`;
      const leaveLabel = getLeaveLabel(leave.type, maternityGender);

      const dateRange = isShortLeave
        ? `${format(startDateObj, "dd MMM yyyy")} (${calcHours} ម៉ោង)`
        : calcDays === 1
          ? format(startDateObj, "dd MMM yyyy")
          : `${format(startDateObj, "dd MMM yyyy")} → ${format(endDateObj, "dd MMM yyyy")} (${calcDays} ថ្ងៃ)`;

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
      await editTelegramMessage(
        msgId,
        [
          `🚫 <b>សំណើច្បាប់បានលុបចោល</b>`,
          ``,
          `👤 <b>ឈ្មោះ៖</b> ${leave.userName}`,
          `📋 <b>ប្រភេទ៖</b> ${leave.type}`,
          ``,
          `❌ <i>លុបចោលដោយអ្នកស្នើ</i>`,
        ].join("\n")
        // no button — leave is deleted
      );
    }

    return NextResponse.json({ message: "Leave cancelled" }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}