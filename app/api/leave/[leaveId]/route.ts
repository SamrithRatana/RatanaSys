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
    ANNUAL:    "Annual Leave",
    SICK:      "Sick Leave",
    PERSONAL:  "Personal Leave",
    MATERNITY: "Maternity Leave",
    SPECIAL:   "Special Leave",
    SHORT:     "Short Leave",
  };
  return labels[type.toUpperCase()] ?? `${type} Leave`;
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

    const leave = await prisma.leave.findUnique({ where: { id } });
    if (!leave) {
      return NextResponse.json({ error: "Leave not found" }, { status: 404 });
    }

    // ── REJECTED ────────────────────────────────────────────────────────────
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

      // ── Notify group ──────────────────────────────────────────────────────
      await sendTelegramMessage([
        `❌ <b>Leave Rejected</b>`,
        ``,
        `👤 <b>Name:</b> ${user}`,
        `📋 <b>Type:</b> ${leaveLabel}`,
        `🙅 <b>Rejected by:</b> ${actorName}`,
        `📝 <b>Note:</b> ${notes || "—"}`,
      ].join("\n"));

      return NextResponse.json({ message: "Leave rejected" }, { status: 200 });
    }

    // ── STEP 1 — MODERATOR (Head Department) ────────────────────────────────
    if (status === LeaveStatus.APPROVED) {

      if (actorRole === "MODERATOR") {
        if (leave.headDepartmentApproved) {
          return NextResponse.json(
            { error: "Head Department has already approved this leave. Awaiting Manager." },
            { status: 400 }
          );
        }

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

        // ── Notify group ────────────────────────────────────────────────────
        await sendTelegramMessage([
          `✅ <b>Leave — Head Dept Approved</b>`,
          ``,
          `👤 <b>Name:</b> ${user}`,
          `📋 <b>Type:</b> ${leaveLabel}`,
          `👍 <b>Approved by:</b> ${actorName} (Head Dept)`,
          ``,
          `⏳ <i>Awaiting Manager final approval</i>`,
        ].join("\n"));

        return NextResponse.json(
          { message: "Head Department approved. Awaiting Manager final approval." },
          { status: 200 }
        );
      }

      // ── STEP 2 — ADMIN (Manager final approval) ──────────────────────────
      if (actorRole === "ADMIN") {
        if (!leave.headDepartmentApproved) {
          return NextResponse.json(
            { error: "Head Department must approve first before Manager can approve." },
            { status: 400 }
          );
        }

        if (leave.managerApproved) {
          return NextResponse.json(
            { error: "This leave has already been fully approved." },
            { status: 400 }
          );
        }

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
            title:       `${user} on ${getLeaveLabel(type)}`,
            description: isShortLeave
              ? `For ${hoursFromDb} hour${hoursFromDb !== 1 ? "s" : ""}`
              : `For ${days} day${days !== 1 ? "s" : ""}`,
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

        // ── Notify group ────────────────────────────────────────────────────
        await sendTelegramMessage([
          `🎉 <b>Leave Fully Approved!</b>`,
          ``,
          `👤 <b>Name:</b> ${user}`,
          `📋 <b>Type:</b> ${leaveLabel}`,
          `📅 <b>Duration:</b> ${isShortLeave ? `${hoursFromDb} hr${hoursFromDb !== 1 ? "s" : ""}` : `${days} day${days !== 1 ? "s" : ""}`}`,
          `✅ <b>Approved by:</b> ${actorName} (Manager)`,
          `📝 <b>Note:</b> ${notes || "—"}`,
        ].join("\n"));

        return NextResponse.json(
          { message: "Manager approved. Leave fully approved!" },
          { status: 200 }
        );
      }
    }

    return NextResponse.json({ error: "Invalid approval state" }, { status: 400 });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}