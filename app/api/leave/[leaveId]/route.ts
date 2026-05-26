import calculateAndUpdateBalances from "@/lib/calculateBalances";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { LeaveStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { sendTelegramMessage, deleteTelegramMessage } from "@/lib/sendTelegramMessage";
import { format } from "date-fns";

type EditBody = {
  notes:     string;
  status:    LeaveStatus;
  id:        string;
  days:      number;
  hours?:    number;
  type:      string;
  year:      string;
  email:     string;
  user:      string;
  startDate: string;
};

function getLeaveLabel(type: string): string {
  const labels: Record<string, string> = {
    ANNUAL:    "ច្បាប់ឈប់សម្រាកប្រចាំឆ្នាំ",
    SICK:      "ច្បាប់ឈប់សម្រាកឈឺ",
    PERSONAL:  "ច្បាប់ឈប់សម្រាកផ្ទាល់ខ្លួន",
    MATERNITY: "ច្បាប់មាតុភាព",
    SPECIAL:   "ច្បាប់ឈប់សម្រាកពិសេស",
    SHORT:     "ច្បាប់ឈប់សម្រាករយះពេលខ្លី",
  };
  return labels[type.toUpperCase()] ?? `ច្បាប់ ${type}`;
}

function formatHourLabel(h: number): string {
  const totalMin = Math.round(h * 60);
  if (totalMin < 60) return `${totalMin} នាទី`;
  if (totalMin % 60 === 0) return `${totalMin / 60} ម៉ោង`;
  const hrs = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return `${hrs} ម៉ោង ${min} នាទី`;
}

function buildDateRange(startDate: Date, endDate: Date, durationLabel: string): string {
  const s = format(startDate, "dd MMM yyyy");
  const e = format(endDate,   "dd MMM yyyy");
  return s === e
    ? `${s} (${durationLabel})`
    : `${s} → ${e} (${durationLabel})`;
}

export async function PATCH(req: Request) {
  const loggedInUser = await getCurrentUser();

  if (loggedInUser?.role !== "ADMIN" && loggedInUser?.role !== "MODERATOR") {
    return NextResponse.json(
      { error: "You are not permitted to perform this action" },
      { status: 403 }
    );
  }

  try {
    const body: EditBody = await req.json();
    const { notes, status, id, days, hours, type, year, email, user, startDate } = body;

    const isShortLeave = type === "SHORT";
    const updatedAt    = new Date().toISOString();
    const actorName    = loggedInUser.name ?? loggedInUser.email ?? "Unknown";
    const actorRole    = loggedInUser.role;
    const leaveLabel   = getLeaveLabel(type);

    const baseUrl  = process.env.NEXTAUTH_URL ?? "https://system.camprotec.com.kh";
    const leaveUrl = `${baseUrl}/dashboard/leaves/${id}`;

    const leave = await prisma.leave.findUnique({ where: { id } });
    if (!leave) {
      return NextResponse.json({ error: "Leave not found" }, { status: 404 });
    }

    const hoursFromDb = Number(leave.hours ?? 0);
    const daysFromDb  = Number(leave.days  ?? 0);

    // ── Detect leave shape ────────────────────────────────────────────────────
    // Combined segment: has BOTH whole days AND leftover hours (e.g. 1 day + 4 hours)
    const hasBothDaysAndHours =
      daysFromDb > 0 && hoursFromDb > 0;

    // Partial-hourly only: hours > 0, days = 0 (classic sub-day leave)
    const isPartialHourly =
      (type === "PERSONAL" || type === "SICK" || type === "ANNUAL") &&
      hoursFromDb > 0 &&
      daysFromDb === 0;

    // ── Build duration label ──────────────────────────────────────────────────
    const durationLabel = (() => {
      if (isShortLeave)         return formatHourLabel(hoursFromDb);
      if (isPartialHourly)      return formatHourLabel(hoursFromDb);
      if (hasBothDaysAndHours)  return `${daysFromDb} ថ្ងៃ ${formatHourLabel(hoursFromDb)}`;
      const d = daysFromDb > 0 ? daysFromDb : days;
      return `${d} ថ្ងៃ`;
    })();

    const dateRangeLabel = buildDateRange(leave.startDate, leave.endDate, durationLabel);

    // ── Helper: delete old message then send new one, save new ID ────────────
    async function replaceMessage(
      newText: string,
      newButtons: { text: string; url: string }[]
    ): Promise<void> {
      if (leave!.telegramMessageId) {
        await deleteTelegramMessage(leave!.telegramMessageId);
      }
      const newMsgId = await sendTelegramMessage(newText, newButtons);
      if (newMsgId) {
        await prisma.leave.update({
          where: { id },
          data:  { telegramMessageId: newMsgId },
        });
      }
    }

    // ── បដិសេធ ────────────────────────────────────────────────────────────────
    if (status === LeaveStatus.REJECTED) {
      await prisma.leave.update({
        where: { id },
        data: {
          status:             LeaveStatus.REJECTED,
          headDepartment:     leave.headDepartment ?? actorName,
          headDepartmentNote: notes,
          updatedAt,
        },
      });

      await replaceMessage(
        [
          `❌ <b>ច្បាប់ត្រូវបានបដិសេធ</b>`,
          ``,
          `👤 <b>ឈ្មោះ៖</b> ${user}`,
          `📋 <b>ប្រភេទ៖</b> ${leaveLabel}`,
          `📅 <b>កាលបរិច្ឆេទ៖</b> ${dateRangeLabel}`,
          `⏱ <b>រយៈពេល៖</b> ${durationLabel}`,
          `🙅 <b>បដិសេធដោយ៖</b> ${actorName}`,
          `📝 <b>កំណត់ចំណាំ៖</b> ${notes || "—"}`,
        ].join("\n"),
        [{ text: "📋 មើលច្បាប់ →", url: leaveUrl }]
      );

      return NextResponse.json({ message: "Leave rejected" }, { status: 200 });
    }

    // ── អនុម័ត ────────────────────────────────────────────────────────────────
    if (status === LeaveStatus.APPROVED) {

      const canDoStep1 =
        actorRole === "MODERATOR" &&
        !leave.headDepartmentApproved;

      const canDoAdminFinal =
        actorRole === "ADMIN" &&
        !leave.managerApproved;

      const canDoModeratorFinal =
        actorRole === "MODERATOR" &&
        leave.headDepartmentApproved &&
        !leave.managerApproved;

      // ── Step 1: Moderator approves as Head Dept ───────────────────────────
      if (canDoStep1) {
        await prisma.leave.update({
          where: { id },
          data: {
            status:                 LeaveStatus.INMODERATION,
            headDepartment:         actorName,
            headDepartmentNote:     notes,
            headDepartmentApproved: true,
            headDepartmentAt:       new Date(),
            updatedAt,
          },
        });

        await replaceMessage(
          [
            `✅ <b>ច្បាប់ — អនុម័តដោយប្រធានផ្នែក</b>`,
            ``,
            `👤 <b>ឈ្មោះ៖</b> ${user}`,
            `📋 <b>ប្រភេទ៖</b> ${leaveLabel}`,
            `📅 <b>កាលបរិច្ឆេទ៖</b> ${dateRangeLabel}`,
            `⏱ <b>រយៈពេល៖</b> ${durationLabel}`,
            `👍 <b>អនុម័តដោយ៖</b> ${actorName} (ប្រធានផ្នែក)`,
            `📝 <b>កំណត់ចំណាំ៖</b> ${notes || "—"}`,
            ``,
            `⏳ <i>កំពុងរង់ចាំការអនុម័តពីអ្នកគ្រប់គ្រង</i>`,
          ].join("\n"),
          [{ text: "✅ អនុម័តក្នុងនាមអ្នកគ្រប់គ្រង →", url: leaveUrl }]
        );

        return NextResponse.json(
          { message: "Head Department approved. Awaiting Manager final approval." },
          { status: 200 }
        );
      }

      // ── Final: Admin (bypass) OR Moderator (after Step 1) ────────────────
      if (canDoAdminFinal || canDoModeratorFinal) {

        // ── Balance deduction ───────────────────────────────────────────────
        if (hasBothDaysAndHours) {
          // Combined segment leave: deduct whole days first, then leftover hours
          await calculateAndUpdateBalances(email, year, type, daysFromDb);

          // Deduct leftover hours as the appropriate _SHORT variant
          const shortType =
            type === "SICK"     ? "SICK_SHORT"   :
            type === "ANNUAL"   ? "ANNUAL_SHORT" :
            type === "PERSONAL" ? "SHORT"        :
            "SHORT";
          await calculateAndUpdateBalances(email, year, shortType, hoursFromDb);

        } else {
          // Original single-type logic
          const effectiveType = isShortLeave
            ? "SHORT"
            : isPartialHourly && type === "SICK"
              ? "SICK_SHORT"
              : isPartialHourly && type === "ANNUAL"
                ? "ANNUAL_SHORT"
                : type;

          const effectiveValue = isShortLeave
            ? hoursFromDb
            : isPartialHourly
              ? hoursFromDb
              : daysFromDb > 0
                ? daysFromDb
                : days;

          await calculateAndUpdateBalances(email, year, effectiveType, effectiveValue);
        }

        await prisma.events.create({
          data: {
            startDate,
            title:       `${user} ឈប់សម្រាក ${getLeaveLabel(type)}`,
            description: `រយៈពេល ${durationLabel}`,
          },
        });

        const adminBypassed = canDoAdminFinal && !leave.headDepartmentApproved;

        await prisma.leave.update({
          where: { id },
          data: {
            status: LeaveStatus.APPROVED,
            ...(adminBypassed && {
              headDepartment:         actorName,
              headDepartmentNote:     notes,
              headDepartmentApproved: true,
              headDepartmentAt:       new Date(),
            }),
            manager:         actorName,
            managerNote:     notes,
            managerApproved: true,
            managerAt:       new Date(),
            updatedAt,
          },
        });

        await replaceMessage(
          [
            `🎉 <b>ច្បាប់ត្រូវបានអនុម័តទាំងស្រុង!</b>`,
            ``,
            `👤 <b>ឈ្មោះ៖</b> ${user}`,
            `📋 <b>ប្រភេទ៖</b> ${leaveLabel}`,
            `📅 <b>កាលបរិច្ឆេទ៖</b> ${dateRangeLabel}`,
            `⏱ <b>រយៈពេល៖</b> ${durationLabel}`,
            `✅ <b>អនុម័តដោយ៖</b> ${actorName} (អ្នកគ្រប់គ្រង)`,
            ...(adminBypassed
              ? [`⚡ <i>រំលង Head Dept — អនុម័តដោយផ្ទាល់ដោយ Admin</i>`]
              : [`👍 <b>ប្រធានផ្នែក៖</b> ${leave.headDepartment}`]
            ),
            `📝 <b>កំណត់ចំណាំ៖</b> ${notes || "—"}`,
          ].join("\n"),
          [{ text: "📋 មើលច្បាប់ →", url: leaveUrl }]
        );

        return NextResponse.json(
          { message: "Leave fully approved!" },
          { status: 200 }
        );
      }

      return NextResponse.json(
        { error: "No valid approval action for your role at this stage." },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Invalid approval state" }, { status: 400 });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}