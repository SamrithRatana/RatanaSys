import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { LeaveStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  sendTelegramMessage,
  deleteTelegramMessage,
  editTelegramMessage,
} from "@/lib/sendTelegramMessage";
import { addDaysYmd, isValidYmd, isWorkingDay, MAX_WORKING_DAY_SPAN_DAYS, minStartYmd, todayYmd, toYmd, RULE_MESSAGES } from "@/lib/leaveRules";
import { getHolidaySet } from "@/lib/data/getHolidays";
import { deleteAttachment } from "@/lib/r2";
import {
  CERTIFICATE_LINE,
  LeaveValidationError,
  buildDateBlock,
  actionButtons,
  certificateButtons,
  checkSickCertificate,
  computeLeave,
  dateToYmd,
  escapeHtml,
  getLeaveLabel,
  leaveOwnerEmail,
  leaveUrl,
  ymdToDate,
} from "@/lib/leaveServer";

type UserEditBody = {
  notes:            string;
  startDate:        string;
  endDate:          string;
  hours?:           number;
  startTime?:       string;
  endTime?:         string;
  maternityGender?: "MALE" | "FEMALE";
};

type Params = { params: { leaveId: string } };

// ── PATCH — user edits their own PENDING leave ────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const leave = await prisma.leave.findUnique({
      where:   { id: params.leaveId },
      include: { attachments: { select: { id: true } } },
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

    const body: UserEditBody = await req.json();
    const notes    = String(body.notes ?? "").slice(0, 500);
    const newStart = body.startDate ? toYmd(body.startDate) : dateToYmd(leave.startDate);
    const newEnd   = body.endDate   ? toYmd(body.endDate)   : newStart;
    if (!isValidYmd(newStart) || !isValidYmd(newEnd)) {
      throw new LeaveValidationError("កាលបរិច្ឆេទមិនត្រឹមត្រូវ (Invalid date).");
    }

    const oldStart     = dateToYmd(leave.startDate);
    const oldEnd       = dateToYmd(leave.endDate);
    const datesChanged = newStart !== oldStart || newEnd !== oldEnd;
    const hasSegments  = Array.isArray(leave.segments) && leave.segments.length > 0;
    const isPartialDay = leave.type === "SHORT" || (leave.days === 0 && Number(leave.hours ?? 0) > 0);

    let startYmd = oldStart, endYmd = oldEnd;
    let days = leave.days, hours = Number(leave.hours ?? 0);

    if (hasSegments) {
      // A multi-segment leave can't be re-expressed as a single date range
      if (datesChanged) {
        throw new LeaveValidationError(
          "ច្បាប់ច្រើន Segment មិនអាចកែកាលបរិច្ឆេទបានទេ — សូមលុប ហើយស្នើសុំម្ដងទៀត (Cancel and resubmit to change segment dates)."
        );
      }
    } else if (isPartialDay) {
      // Hourly leave: may move to another single day, keeps its hours
      if (datesChanged) {
        const today    = todayYmd();
        const holidays = await getHolidaySet(today < newStart ? today : newStart, newStart);
        if (!isWorkingDay(newStart, holidays)) {
          throw new LeaveValidationError(RULE_MESSAGES.nonWorkingDay);
        }
        if (newStart < minStartYmd(leave.type, today, holidays)) {
          throw new LeaveValidationError(leave.type === "ANNUAL" ? RULE_MESSAGES.annualNotice : "មិនអាចជ្រើសរើសថ្ងៃកន្លងផុតបានទេ (Cannot choose a past date).");
        }
        startYmd = endYmd = newStart;
      }
      if (leave.type === "SHORT" && Number(body.hours) > 0) {
        hours = Math.min(Number(body.hours), 8);
      }
    } else if (datesChanged || leave.type === "MATERNITY") {
      // Maternity's end date isn't known ahead of time (it depends on how
      // many weekends/holidays fall inside it), so fetch a wide window
      // instead of trusting the stale `newEnd` the client happened to send.
      const isMaternityEdit = leave.type === "MATERNITY";
      const holidayFrom = todayYmd() < newStart ? todayYmd() : newStart;
      const holidayTo   = isMaternityEdit ? addDaysYmd(newStart, MAX_WORKING_DAY_SPAN_DAYS) : newEnd;

      const computed = computeLeave({
        type:            leave.type,
        startDate:       newStart,
        endDate:         newEnd,
        maternityGender: body.maternityGender ?? (isMaternityEdit ? (leave.days <= 7 ? "MALE" : "FEMALE") : undefined),
      }, todayYmd(), await getHolidaySet(holidayFrom, holidayTo));
      startYmd = computed.startYmd;
      endYmd   = computed.endYmd;
      days     = computed.days;
      hours    = computed.hours;
    }

    const attachmentIds = leave.attachments.map((a) => a.id);
    checkSickCertificate(leave.type, days, hours, attachmentIds.length > 0);

    const updated = await prisma.leave.update({
      where: { id: params.leaveId },
      data: {
        startDate: ymdToDate(startYmd),
        endDate:   ymdToDate(endYmd),
        userNote:  notes,
        days,
        hours,
        year:      startYmd.slice(0, 4),
        updatedAt: new Date(),
      },
    });

    const msgText = [
      `✏️ <b>សំណើច្បាប់បានកែប្រែ</b>`,
      ``,
      `👤 <b>ឈ្មោះ៖</b> ${escapeHtml(leave.userName)}`,
      `📋 <b>ប្រភេទ៖</b> ${getLeaveLabel(leave.type)}`,
      ...buildDateBlock(updated),
      `📝 <b>មូលហេតុ៖</b> ${escapeHtml(notes) || "—"}`,
      ...(attachmentIds.length > 0 ? [CERTIFICATE_LINE] : []),
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