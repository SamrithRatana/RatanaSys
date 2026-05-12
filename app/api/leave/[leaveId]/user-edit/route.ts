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
    const { notes, status, id, days, type, year, email, user, startDate } = body;

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
      // MODERATOR: can only reject at Step 1 (head dept not yet approved)
      // ADMIN:     can reject at any stage
      const canReject =
        actorRole === "ADMIN" ||
        (actorRole === "MODERATOR" && !leave.headDepartmentApproved);

      if (!canReject) {
        return NextResponse.json(
          { error: "Moderators can only act at Step 1 (head department stage)." },
          { status: 403 }
        );
      }

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

      // ── ជំហានទី១ — អនុម័តដោយប្រធានផ្នែក ───────────────────────────────────
      // MODERATOR: Step 1 only — never Step 2
      // ADMIN:     Step 1 if head dept hasn't approved yet
      const canDoStep1 =
        (actorRole === "MODERATOR" || actorRole === "ADMIN") &&
        !leave.headDepartmentApproved;

      // ── ជំហានទី២ — អនុម័តចុងក្រោយដោយអ្នកគ្រប់គ្រង ──────────────────────
      // ADMIN only — MODERATOR is explicitly excluded
      const canDoStep2 =
        actorRole === "ADMIN" &&
        leave.headDepartmentApproved &&
        !leave.managerApproved;

      // ── Step 1 ───────────────────────────────────────────────────────────────
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

      // ── Step 2 ───────────────────────────────────────────────────────────────
      if (canDoStep2) {
        const hoursFromDb = Number(leave.hours ?? 0);

        await calculateAndUpdateBalances(
          email,
          year,
          type,
          isShortLeave ? hoursFromDb : days
        );

        await prisma.events.create({
          data: {
            startDate,
            title:       `${user} ឈប់សម្រាក ${getLeaveLabel(type)}`,
            description: isShortLeave
              ? `រយៈពេល ${hoursFromDb} ម៉ោង`
              : `រយៈពេល ${days} ថ្ងៃ`,
          },
        });

        await prisma.leave.update({
          where: { id },
          data: {
            status:          LeaveStatus.APPROVED,
            manager:         actorName,
            managerNote:     notes,
            managerApproved: true,
            managerAt:       new Date(),
            updatedAt,
          },
        });

        await sendTelegramMessage(
          [
            `🎉 <b>ច្បាប់ត្រូវបានអនុម័តទាំងស្រុង!</b>`,
            ``,
            `👤 <b>ឈ្មោះ៖</b> ${user}`,
            `📋 <b>ប្រភេទ៖</b> ${leaveLabel}`,
            `📅 <b>រយៈពេល៖</b> ${isShortLeave ? `${hoursFromDb} ម៉ោង` : `${days} ថ្ងៃ`}`,
            `✅ <b>អនុម័តដោយ៖</b> ${actorName} (អ្នកគ្រប់គ្រង)`,
            `📝 <b>កំណត់ចំណាំ៖</b> ${notes || "—"}`,
          ].join("\n"),
          [{ text: "📋 មើលច្បាប់ →", url: leaveUrl }]
        );

        return NextResponse.json(
          { message: "Manager approved. Leave fully approved!" },
          { status: 200 }
        );
      }

      // MODERATOR trying to act at Step 2 — explicit friendly error
      if (actorRole === "MODERATOR" && leave.headDepartmentApproved) {
        return NextResponse.json(
          { error: "Moderators can only approve at Step 1 (head department). Manager approval requires an Admin." },
          { status: 403 }
        );
      }

      // Neither step applies (e.g. already fully approved)
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
