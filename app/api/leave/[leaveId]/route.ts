import calculateAndUpdateBalances from "@/lib/calculateBalances";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { LeaveStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/sendTelegramMessage";

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

      await sendTelegramMessage(
        [
          `❌ <b>ច្បាប់ត្រូវបានបដិសេធ</b>`,
          ``,
          `👤 <b>ឈ្មោះ៖</b> ${user}`,
          `📋 <b>ប្រភេទ៖</b> ${leaveLabel}`,
          `🙅 <b>បដិសេធដោយ៖</b> ${actorName}`,
          `📝 <b>កំណត់ចំណាំ៖</b> ${notes || "—"}`,
        ].join("\n"),
        [{ text: "📋 មើលច្បាប់ →", url: leaveUrl }]
      );

      return NextResponse.json({ message: "Leave rejected" }, { status: 200 });
    }

    // ── អនុម័ត ────────────────────────────────────────────────────────────────
    if (status === LeaveStatus.APPROVED) {

      // ── Step 1: MODERATOR only ───────────────────────────────────────────────
      // Admin no longer participates in Step 1 — they skip directly to final
      const canDoStep1 =
        actorRole === "MODERATOR" &&
        !leave.headDepartmentApproved;

      // ── Final approval: ADMIN skips straight here regardless of Step 1 ───────
      // MODERATOR can only reach here after Step 1 is done (headDepartmentApproved)
      const canDoAdminFinal =
        actorRole === "ADMIN" &&
        !leave.managerApproved;

      const canDoModeratorFinal =
        actorRole === "MODERATOR" &&
        leave.headDepartmentApproved &&
        !leave.managerApproved;

      // ── Step 1: Moderator approves as Head Dept ──────────────────────────────
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

        await sendTelegramMessage(
          [
            `✅ <b>ច្បាប់ — អនុម័តដោយប្រធានផ្នែក</b>`,
            ``,
            `👤 <b>ឈ្មោះ៖</b> ${user}`,
            `📋 <b>ប្រភេទ៖</b> ${leaveLabel}`,
            `👍 <b>អនុម័តដោយ៖</b> ${actorName} (ប្រធានផ្នែក)`,
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

      // ── Final: Admin (bypass) OR Moderator (after Step 1) ───────────────────
      if (canDoAdminFinal || canDoModeratorFinal) {
        const hoursFromDb = Number(leave.hours ?? 0);

        const isPartialPersonal =
          type === "PERSONAL" && hoursFromDb > 0 && (days === 0 || days == null);

        const effectiveValue = isShortLeave
          ? hoursFromDb
          : isPartialPersonal
            ? hoursFromDb / 8
            : days;

        await calculateAndUpdateBalances(email, year, type, effectiveValue);

        const durationLabel = isShortLeave
          ? `${hoursFromDb} ម៉ោង`
          : isPartialPersonal
            ? (() => {
                const totalMin = Math.round(hoursFromDb * 60);
                return totalMin < 60
                  ? `${totalMin} នាទី`
                  : `${+hoursFromDb.toFixed(1)} ម៉ោង`;
              })()
            : `${days} ថ្ងៃ`;

        await prisma.events.create({
          data: {
            startDate,
            title:       `${user} ឈប់សម្រាក ${getLeaveLabel(type)}`,
            description: `រយៈពេល ${durationLabel}`,
          },
        });

        // Admin bypassed Step 1 — fill both head dept + manager fields at once
        const adminBypassed = canDoAdminFinal && !leave.headDepartmentApproved;

        await prisma.leave.update({
          where: { id },
          data: {
            status: LeaveStatus.APPROVED,
            // If Admin bypassed Step 1, populate head dept fields too
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

        // ── Telegram: send ONE final message only ─────────────────────────────
        // If Admin bypassed Step 1 → no middle "head dept" message was ever sent
        // so this is the only notification the group sees
        await sendTelegramMessage(
          [
            `🎉 <b>ច្បាប់ត្រូវបានអនុម័តទាំងស្រុង!</b>`,
            ``,
            `👤 <b>ឈ្មោះ៖</b> ${user}`,
            `📋 <b>ប្រភេទ៖</b> ${leaveLabel}`,
            `📅 <b>រយៈពេល៖</b> ${durationLabel}`,
            `✅ <b>អនុម័តដោយ៖</b> ${actorName} (អ្នកគ្រប់គ្រង)`,
            // Show different context depending on whether Step 1 was bypassed
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