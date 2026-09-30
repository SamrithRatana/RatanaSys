import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { Leave, LeaveStatus, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  sendTelegramMessage,
  deleteTelegramMessage,
  editTelegramMessage,
} from "@/lib/sendTelegramMessage";
import { todayYmd } from "@/lib/leaveRules";
import { getHolidaySet } from "@/lib/data/getHolidays";
import { deleteAttachment } from "@/lib/r2";
import { replaceLeaveAttachments, storeAttachment } from "@/lib/leaveAttachments";
import { ensureMaternityCredit } from "@/lib/maternityCredit";
import {
  ComputedLeave,
  LeaveValidationError,
  SubmittedLeave,
  buildDateBlock,
  actionButtons,
  certificateButtons,
  certificateLines,
  checkSickCertificate,
  computeLeave,
  dateToYmd,
  escapeHtml,
  getLeaveLabel,
  jsonAttachment,
  leaveOwnerEmail,
  leaveUrl,
  readAttachment,
  requestDateBounds,
  ymdToDate,
} from "@/lib/leaveServer";

type Params = { params: { leaveId: string } };

/** Same dates and duration as what's stored (substitutes/notes may differ). */
function sameTiming(c: ComputedLeave, leave: Leave): boolean {
  const segKey = (segs: unknown) =>
    JSON.stringify(
      (Array.isArray(segs) ? segs : []).map((s: any) => [s.date, s.endDate ?? s.date, Number(s.hours ?? 0), s.days ?? 0, s.startTime ?? "", s.endTime ?? ""]),
    );
  return (
    c.type === leave.type &&
    c.startYmd === dateToYmd(leave.startDate) &&
    c.endYmd === dateToYmd(leave.endDate) &&
    c.days === leave.days &&
    Math.abs(c.hours - Number(leave.hours ?? 0)) < 1e-6 &&
    segKey(c.segments) === segKey(leave.segments)
  );
}

// ── PATCH — user edits their own PENDING leave ────────────────────────────────
// The body is the same as a new request (POST /api/leave): type, dates or
// segments, hours/times, substitute, notes, plus an optional new certificate
// or "ជំពាក់សិន" — and it's validated by the same computeLeave() rules.
export async function PATCH(req: NextRequest, { params }: Params) {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const leave = await prisma.leave.findUnique({
      where:   { id: params.leaveId },
      include: { attachments: { select: { id: true, r2Key: true } } },
    });
    if (!leave) {
      return NextResponse.json({ error: "Leave not found" }, { status: 404 });
    }

    if (leave.userEmail !== leaveOwnerEmail(loggedInUser)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (leave.status !== LeaveStatus.PENDING) {
      return NextResponse.json(
        { error: "Only pending leaves can be edited." },
        { status: 400 }
      );
    }

    const body: SubmittedLeave = await req.json();
    if (!body.type && !body.leave) {
      // An edit dialog from before this change only sent dates + notes
      throw new LeaveValidationError("ទំព័រនេះចាស់ហើយ — សូម Refresh ហើយកែម្ដងទៀត (This page is out of date — refresh and edit again).");
    }

    const today       = todayYmd();
    const submittedOn = todayYmd(leave.createdAt);
    const bounds      = requestDateBounds(body);
    const from        = [today, submittedOn, bounds?.from].filter(Boolean).sort()[0]!;
    const to          = [today, submittedOn, bounds?.to].filter(Boolean).sort().reverse()[0]!;
    const holidays    = await getHolidaySet(from, to);

    // Validate against today's rules. If that fails only because time has
    // passed (e.g. the notice window) while the dates themselves are
    // unchanged, judge it as of the day it was submitted — so fixing the
    // reason or the substitute on an older pending leave still works.
    let computed: ComputedLeave;
    try {
      computed = computeLeave(body, today, holidays);
    } catch (error) {
      if (!(error instanceof LeaveValidationError)) throw error;
      let asSubmitted: ComputedLeave | null = null;
      try { asSubmitted = computeLeave(body, submittedOn, holidays); } catch { /* keep the original error */ }
      if (!asSubmitted || !sameTiming(asSubmitted, leave)) throw error;
      computed = asSubmitted;
    }

    const newFile      = await readAttachment(jsonAttachment(body.attachment));
    const isSick       = computed.type === "SICK";
    const keptExisting = isSick && leave.attachments.length > 0;
    checkSickCertificate(computed.type, computed.days, computed.hours, !!newFile || keptExisting, body.certificateLater === true);

    if (computed.type === "MATERNITY" && computed.maternityGender) {
      await ensureMaternityCredit(leave.userEmail, leave.userName, computed.startYmd.slice(0, 4), computed.maternityGender, !!loggedInUser.email);
    }

    const updated = await prisma.leave.update({
      where: { id: params.leaveId },
      data: {
        type:       computed.type,
        startDate:  ymdToDate(computed.startYmd),
        endDate:    ymdToDate(computed.endYmd),
        userNote:   computed.notes,
        days:       computed.days,
        hours:      computed.hours,
        year:       computed.startYmd.slice(0, 4),
        substitute: computed.substitute,
        segments:   computed.segments ? (computed.segments as any) : Prisma.DbNull,
        updatedAt:  new Date(),
      },
    });

    // Certificate: a new file replaces the old one; switching away from sick
    // leave drops it (it no longer belongs to this request).
    let attachmentIds = leave.attachments.map((a) => a.id);
    if (newFile) {
      attachmentIds = [await replaceLeaveAttachments(leave.id, await storeAttachment(newFile))];
    } else if (!isSick && leave.attachments.length > 0) {
      await prisma.leaveAttachment.deleteMany({ where: { leaveId: leave.id } });
      for (const a of leave.attachments) if (a.r2Key) void deleteAttachment(a.r2Key);
      attachmentIds = [];
    }

    const timeRange = computed.startTime && computed.endTime ? `${computed.startTime}–${computed.endTime}` : undefined;
    const msgText = [
      `✏️ <b>សំណើច្បាប់បានកែប្រែ</b>`,
      ``,
      `👤 <b>ឈ្មោះ៖</b> ${escapeHtml(leave.userName)}`,
      `📋 <b>ប្រភេទ៖</b> ${getLeaveLabel(computed.type, computed.maternityGender)}`,
      ...(computed.maternityGender
        ? [`⚧ <b>ភេទ៖</b> ${computed.maternityGender === "MALE" ? "បុរស 👨" : "ស្ត្រី 👩"}`]
        : []),
      ...buildDateBlock(updated, timeRange),
      `📝 <b>មូលហេតុ៖</b> ${escapeHtml(computed.notes) || "—"}`,
      ...certificateLines(updated, attachmentIds.length),
      ``,
      `✏️ <i>បានកែប្រែដោយអ្នកស្នើ · រង់ចាំអនុម័តពីប្រធានផ្នែក</i>`,
    ].join("\n");

    const msgButtons = [
      { text: "👀 មើល និងអនុម័តប្រធានផ្នែក →", url: leaveUrl(leave.id) },
      ...actionButtons(leave.id),
      ...certificateButtons(leave.id, attachmentIds),
    ];

    // Edit the existing message, or send a new one — without blocking the response
    void (async () => {
      if (leave.telegramMessageId) {
        await editTelegramMessage(leave.telegramMessageId, msgText, msgButtons);
      } else {
        const newMsgId = await sendTelegramMessage(msgText, msgButtons);
        if (newMsgId) {
          await prisma.leave.update({
            where: { id: params.leaveId },
            data:  { telegramMessageId: newMsgId },
          });
        }
      }
    })().catch((e) => console.error("[user-edit] telegram:", e));

    return NextResponse.json({ message: "Leave updated" }, { status: 200 });
  } catch (error) {
    if (error instanceof LeaveValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
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
    const leave = await prisma.leave.findUnique({
      where:   { id: params.leaveId },
      include: { attachments: { select: { r2Key: true } } },
    });
    if (!leave) {
      return NextResponse.json({ error: "Leave not found" }, { status: 404 });
    }

    if (leave.userEmail !== leaveOwnerEmail(loggedInUser)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (leave.status !== LeaveStatus.PENDING) {
      return NextResponse.json(
        { error: "Only pending leaves can be cancelled." },
        { status: 400 }
      );
    }

    await prisma.leave.delete({ where: { id: params.leaveId } }); // cascades to LeaveAttachment rows

    // The DB row is gone via cascade; also clean up the actual file in R2
    for (const a of leave.attachments) {
      if (a.r2Key) void deleteAttachment(a.r2Key);
    }

    // Just delete the Telegram message — no new message sent
    if (leave.telegramMessageId) {
      void deleteTelegramMessage(leave.telegramMessageId);
    }

    return NextResponse.json({ message: "Leave cancelled" }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
