import { applyLeaveToBalance, findBalanceForLeave } from "@/lib/calculateBalances";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { Leave, LeaveStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { moderatorScopeError } from "@/lib/data/departmentScope";
import { sendTelegramMessage, deleteTelegramMessage } from "@/lib/sendTelegramMessage";
import {
  CERTIFICATE_LINE,
  buildDateBlock,
  certificateButtons,
  dateToYmd,
  durationLabel,
  escapeHtml,
  getLeaveLabel,
  leaveUrl,
} from "@/lib/leaveServer";

type EditBody = {
  notes?:  string;
  status:  LeaveStatus;
  id?:     string;
};

type Params = { params: { leaveId: string } };

class ApprovalError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function leaveYear(leave: Leave): string {
  return leave.year || dateToYmd(leave.startDate).slice(0, 4);
}

/**
 * The balance is deducted by whichever approval comes first: the head of
 * department (Moderator) or an Admin approving directly.
 */
function isDeducted(leave: Leave): boolean {
  return leave.headDepartmentApproved === true || leave.managerApproved === true;
}

const notYetHeadApproved: Prisma.LeaveWhereInput = {
  OR: [{ headDepartmentApproved: false }, { headDepartmentApproved: null }],
};

/** Deduct the leave from the employee's balance and put it on the calendar. */
async function deductAndCreateEvent(tx: Prisma.TransactionClient, leave: Leave) {
  const balance = await findBalanceForLeave(tx, leave.userEmail, leaveYear(leave), leave.userName);
  if (!balance) {
    throw new ApprovalError(
      `រកមិនឃើញសមតុល្យច្បាប់ឆ្នាំ ${leaveYear(leave)} សម្រាប់ ${leave.userName} — សូមបង្កើត Balance ជាមុនសិន ` +
      `(No leave balance for ${leave.userEmail} in ${leaveYear(leave)}. Create it under Balances first.)`
    );
  }

  await applyLeaveToBalance(tx, balance, leave.type, leave.days, Number(leave.hours ?? 0), 1);

  await tx.events.create({
    data: {
      leaveId:     leave.id,
      startDate:   leave.startDate,
      endDate:     leave.endDate,
      title:       `${leave.userName} ឈប់សម្រាក ${getLeaveLabel(leave.type)}`,
      description: `រយៈពេល ${durationLabel(leave.days, Number(leave.hours ?? 0))}`,
    },
  });
}

/** Undo deductAndCreateEvent — used when an already-deducted leave is rejected. */
async function refundAndRemoveEvent(tx: Prisma.TransactionClient, leave: Leave) {
  const balance = await findBalanceForLeave(tx, leave.userEmail, leaveYear(leave), leave.userName);
  if (balance) {
    await applyLeaveToBalance(tx, balance, leave.type, leave.days, Number(leave.hours ?? 0), -1);
  }

  await tx.events.deleteMany({
    where: {
      OR: [
        { leaveId: leave.id },
        // events created before leaveId existed
        {
          leaveId:   null,
          startDate: leave.startDate,
          title:     `${leave.userName} ឈប់សម្រាក ${getLeaveLabel(leave.type)}`,
        },
      ],
    },
  });
}

/** Conditional update: only succeeds if nobody else changed the leave meanwhile. */
async function transition(
  tx:    Prisma.TransactionClient,
  leave: Leave,
  where: Prisma.LeaveWhereInput,
  data:  Prisma.LeaveUpdateManyMutationInput,
) {
  const { count } = await tx.leave.updateMany({
    where: { id: leave.id, status: leave.status, ...where },
    data:  { ...data, updatedAt: new Date() },
  });
  if (count === 0) {
    throw new ApprovalError("ច្បាប់នេះត្រូវបានកែប្រែរួចហើយ — សូម Refresh (This leave was already updated — please refresh).", 409);
  }
}

function replaceTelegramMessage(leave: Leave, text: string, attachmentIds: string[]) {
  void (async () => {
    if (leave.telegramMessageId) await deleteTelegramMessage(leave.telegramMessageId);
    const newMsgId = await sendTelegramMessage(text, [
      { text: "📋 មើលច្បាប់ →", url: leaveUrl(leave.id) },
      ...certificateButtons(leave.id, attachmentIds),
    ]);
    if (newMsgId) {
      await prisma.leave.update({ where: { id: leave.id }, data: { telegramMessageId: newMsgId } });
    }
  })().catch((e) => console.error("[leave PATCH] telegram:", e));
}

export async function PATCH(req: Request, { params }: Params) {
  const loggedInUser = await getCurrentUser();

  if (loggedInUser?.role !== "ADMIN" && loggedInUser?.role !== "MODERATOR") {
    return NextResponse.json(
      { error: "You are not permitted to perform this action" },
      { status: 403 }
    );
  }

  try {
    const body: EditBody = await req.json();
    const notes  = String(body.notes ?? "").slice(0, 500);
    const status = body.status;
    const id     = params.leaveId ?? body.id;

    const actorName = loggedInUser.name ?? loggedInUser.email ?? "Unknown";
    const actorRole = loggedInUser.role;

    const found = await prisma.leave.findUnique({
      where:   { id },
      include: { attachments: { select: { id: true } } },
    });
    if (!found) {
      return NextResponse.json({ error: "Leave not found" }, { status: 404 });
    }
    const { attachments, ...leave } = found;
    const attachmentIds = attachments.map((a) => a.id);

    // Moderators (head of department) may only act on their own department's leaves
    const scopeError = await moderatorScopeError(loggedInUser, leave.userEmail);
    if (scopeError) throw new ApprovalError(scopeError, 403);

    // All leave details come from the database, never from the request body
    const header = [
      `👤 <b>ឈ្មោះ៖</b> ${escapeHtml(leave.userName)}`,
      `📋 <b>ប្រភេទ៖</b> ${getLeaveLabel(leave.type)}`,
      ...buildDateBlock(leave),
      `📝 <b>មូលហេតុ (អ្នកស្នើ)៖</b> ${escapeHtml(leave.userNote) || "—"}`,
      ...(attachmentIds.length > 0 ? [CERTIFICATE_LINE] : []),
    ];
    const noteLine = `🗒 <b>កំណត់ចំណាំ (អ្នកអនុម័ត)៖</b> ${escapeHtml(notes) || "—"}`;

    // ── REJECTED ──────────────────────────────────────────────────────────────
    if (status === LeaveStatus.REJECTED) {
      if (leave.status === LeaveStatus.REJECTED) {
        throw new ApprovalError("ច្បាប់នេះត្រូវបានបដិសេធរួចហើយ (Already rejected).");
      }
      if (leave.status === LeaveStatus.APPROVED && actorRole !== "ADMIN") {
        throw new ApprovalError("មានតែ Admin ទេដែលអាចបដិសេធច្បាប់ដែលបានអនុម័តរួច (Only an admin can reject an approved leave).", 403);
      }

      // Balance is deducted at the first approval, so refund it if that happened
      const wasDeducted = isDeducted(leave);

      await prisma.$transaction(async (tx) => {
        await transition(tx, leave, {}, {
          status: LeaveStatus.REJECTED,
          ...(wasDeducted
            ? { manager: actorName, managerNote: notes, managerApproved: false, managerAt: new Date() }
            : { headDepartment: actorName, headDepartmentNote: notes, headDepartmentAt: new Date() }),
        });
        if (wasDeducted) await refundAndRemoveEvent(tx, leave);
      });

      replaceTelegramMessage(leave, [
        `❌ <b>ច្បាប់ត្រូវបានបដិសេធ</b>`,
        ``,
        ...header,
        `🙅 <b>បដិសេធដោយ៖</b> ${escapeHtml(actorName)}`,
        noteLine,
      ].join("\n"), attachmentIds);

      return NextResponse.json({ message: "Leave rejected" }, { status: 200 });
    }

    // ── APPROVED ──────────────────────────────────────────────────────────────
    if (status === LeaveStatus.APPROVED) {
      const canDoStep1 =
        actorRole === "MODERATOR" &&
        leave.status === LeaveStatus.PENDING &&
        !leave.headDepartmentApproved;

      const canDoAdminFinal =
        actorRole === "ADMIN" &&
        leave.status !== LeaveStatus.REJECTED &&
        !leave.managerApproved;

      const canDoModeratorFinal =
        actorRole === "MODERATOR" &&
        leave.status === LeaveStatus.INMODERATION &&
        leave.headDepartmentApproved &&
        !leave.managerApproved;

      // Admin already approved (and deducted) first → the head of department
      // still signs off, as a formality: recorded, but no balance change.
      const canDoModeratorFormality =
        actorRole === "MODERATOR" &&
        leave.status === LeaveStatus.APPROVED &&
        leave.managerApproved === true &&
        !leave.headDepartmentApproved;

      if (canDoModeratorFormality) {
        await prisma.$transaction(async (tx) => {
          await transition(tx, leave, notYetHeadApproved, {
            headDepartment:         actorName,
            headDepartmentNote:     notes,
            headDepartmentApproved: true,
            headDepartmentAt:       new Date(),
          });
        });

        replaceTelegramMessage(leave, [
          `🎉 <b>ច្បាប់ត្រូវបានអនុម័តទាំងស្រុង!</b>`,
          ``,
          ...header,
          `✅ <b>អនុម័តដោយ៖</b> ${escapeHtml(leave.manager)} (អ្នកគ្រប់គ្រង)`,
          `👍 <b>ប្រធានផ្នែក៖</b> ${escapeHtml(actorName)} (អនុម័តជាផ្លូវការ)`,
          noteLine,
        ].join("\n"), attachmentIds);

        return NextResponse.json(
          { message: "Head Department sign-off recorded (balance was already deducted)." },
          { status: 200 }
        );
      }

      // ── Step 1: Moderator approves as Head Dept (balance deducted here) ──
      if (canDoStep1) {
        await prisma.$transaction(async (tx) => {
          await transition(tx, leave, notYetHeadApproved, {
            status:                 LeaveStatus.INMODERATION,
            headDepartment:         actorName,
            headDepartmentNote:     notes,
            headDepartmentApproved: true,
            headDepartmentAt:       new Date(),
          });
          await deductAndCreateEvent(tx, leave);
        });

        replaceTelegramMessage(leave, [
          `✅ <b>ច្បាប់ — អនុម័តដោយប្រធានផ្នែក</b>`,
          ``,
          ...header,
          `👍 <b>អនុម័តដោយ៖</b> ${escapeHtml(actorName)} (ប្រធានផ្នែក)`,
          noteLine,
          ``,
          `⏳ <i>កំពុងរង់ចាំការអនុម័តពីអ្នកគ្រប់គ្រង</i>`,
        ].join("\n"), attachmentIds);

        return NextResponse.json(
          { message: "Head Department approved. Awaiting Manager final approval." },
          { status: 200 }
        );
      }

      // ── Final: Admin (optionally bypassing Step 1) or Moderator after Step 1 ──
      if (canDoAdminFinal || canDoModeratorFinal) {
        const adminBypassed = canDoAdminFinal && !leave.headDepartmentApproved;

        await prisma.$transaction(async (tx) => {
          await transition(
            tx, leave,
            {
              OR: [{ managerApproved: false }, { managerApproved: null }],
              ...(adminBypassed ? notYetHeadApproved : { headDepartmentApproved: true }),
            },
            {
              // Admin approving first leaves the head-of-department step open
              // for the Moderator's formality sign-off (no second deduction)
              status: LeaveStatus.APPROVED,
              manager:         actorName,
              managerNote:     notes,
              managerApproved: true,
              managerAt:       new Date(),
            },
          );
          if (adminBypassed) await deductAndCreateEvent(tx, leave);
        });

        replaceTelegramMessage(leave, [
          `🎉 <b>ច្បាប់ត្រូវបានអនុម័តទាំងស្រុង!</b>`,
          ``,
          ...header,
          `✅ <b>អនុម័តដោយ៖</b> ${escapeHtml(actorName)} (អ្នកគ្រប់គ្រង)`,
          ...(adminBypassed
            ? [`⚡ <i>Admin អនុម័តមុន — រង់ចាំប្រធានផ្នែកអនុម័តជាផ្លូវការ (មិនកាត់ balance ម្ដងទៀត)</i>`]
            : [`👍 <b>ប្រធានផ្នែក៖</b> ${escapeHtml(leave.headDepartment)}`]),
          noteLine,
        ].join("\n"), attachmentIds);

        return NextResponse.json({ message: "Leave fully approved!" }, { status: 200 });
      }

      return NextResponse.json(
        { error: "No valid approval action for your role at this stage." },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Invalid approval state" }, { status: 400 });

  } catch (error) {
    if (error instanceof ApprovalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
