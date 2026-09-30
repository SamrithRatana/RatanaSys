import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { LeaveStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { editTelegramButtons, sendTelegramMessage } from "@/lib/sendTelegramMessage";
import { replaceLeaveAttachments, storeAttachment } from "@/lib/leaveAttachments";
import {
  LeaveValidationError,
  SubmittedLeave,
  actionButtons,
  buildDateBlock,
  certificateButtons,
  escapeHtml,
  getLeaveLabel,
  jsonAttachment,
  leaveOwnerEmail,
  leaveUrl,
  readAttachment,
} from "@/lib/leaveServer";

type Params = { params: { leaveId: string } };

// PUT — the employee uploads (or re-uploads) the medical certificate for
// their own sick leave: after choosing "ជំពាក់សិន" at submission, or to
// replace a wrong/unreadable file. Allowed at any stage except rejected,
// since certificates often arrive after the leave was already approved.
// Body: { attachment: { fileName, mimeType, base64 } } — see app/api/leave/route.ts
// for why the file travels as base64 text.
export async function PUT(req: NextRequest, { params }: Params) {
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
    if (leave.type !== "SICK") {
      throw new LeaveValidationError("សំបុត្រពេទ្យអាចភ្ជាប់បានតែច្បាប់ឈឺប៉ុណ្ណោះ (A medical certificate can only be attached to a sick leave).");
    }
    if (leave.status === LeaveStatus.REJECTED) {
      throw new LeaveValidationError("ច្បាប់នេះត្រូវបានបដិសេធ — មិនអាចភ្ជាប់សំបុត្រពេទ្យបានទេ (This leave was rejected).");
    }

    const body: Pick<SubmittedLeave, "attachment"> = await req.json();
    const file = await readAttachment(jsonAttachment(body.attachment));
    if (!file) {
      throw new LeaveValidationError("សូមជ្រើសរើសរូបភាព ឬ PDF សំបុត្រពេទ្យ (Choose an image or PDF).");
    }

    const replaced     = leave.attachments.length > 0;
    const attachmentId = await replaceLeaveAttachments(leave.id, await storeAttachment(file));

    // Let the approvers know, threaded under the original leave post
    const text = [
      replaced ? `📎 <b>សំបុត្រពេទ្យត្រូវបានប្ដូរថ្មី</b>` : `📎 <b>សំបុត្រពេទ្យត្រូវបានភ្ជាប់ហើយ</b>`,
      ``,
      `👤 <b>ឈ្មោះ៖</b> ${escapeHtml(leave.userName)}`,
      `📋 <b>ប្រភេទ៖</b> ${getLeaveLabel(leave.type)}`,
      ...buildDateBlock(leave),
    ].join("\n");
    void sendTelegramMessage(
      text,
      [
        { text: "📋 មើលច្បាប់ →", url: leaveUrl(leave.id) },
        ...certificateButtons(leave.id, [attachmentId]),
      ],
      leave.telegramMessageId,
    ).catch((e) => console.error("[attachment PUT] telegram:", e));

    // Point the original leave post's "មើលសំបុត្រពេទ្យ" button at the new
    // file too. Its other buttons depend on the stage, mirroring how each
    // stage's message is built (app/api/leave/route.ts, lib/leaveDecision.ts).
    if (leave.telegramMessageId) {
      const stillActionable =
        leave.status === LeaveStatus.PENDING ||
        leave.status === LeaveStatus.INMODERATION ||
        (leave.status === LeaveStatus.APPROVED && !leave.headDepartmentApproved);
      void editTelegramButtons(leave.telegramMessageId, [
        leave.status === LeaveStatus.PENDING
          ? { text: "👀 មើល និងអនុម័តប្រធានផ្នែក →", url: leaveUrl(leave.id) }
          : { text: "📋 មើលច្បាប់ →", url: leaveUrl(leave.id) },
        ...(stillActionable ? actionButtons(leave.id) : []),
        ...certificateButtons(leave.id, [attachmentId]),
      ]).catch((e) => console.error("[attachment PUT] telegram buttons:", e));
    }

    return NextResponse.json({ message: "Certificate uploaded", id: attachmentId }, { status: 200 });
  } catch (error) {
    if (error instanceof LeaveValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
