import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/sendTelegramMessage";
import { MATERNITY_DAYS, todayYmd } from "@/lib/leaveRules";
import {
  CERTIFICATE_LINE,
  LeaveValidationError,
  SubmittedLeave,
  actionButtons,
  certificateButtons,
  buildDateBlock,
  checkSickCertificate,
  computeLeave,
  escapeHtml,
  getLeaveLabel,
  leaveOwnerEmail,
  leaveUrl,
  readAttachment,
  requestDateBounds,
  ymdToDate,
} from "@/lib/leaveServer";
import { getHolidaySet } from "@/lib/data/getHolidays";
import { makeAttachmentKey, r2Configured, uploadAttachment } from "@/lib/r2";

export async function POST(req: NextRequest) {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Accept JSON, or multipart/form-data with a `payload` JSON field + `attachment` file
    let body: SubmittedLeave;
    let file: File | null = null;
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await req.formData();
      body = JSON.parse(String(form.get("payload") ?? "{}"));
      // `File` isn't a global in this Node 18 runtime (only Node 20+), so
      // `instanceof File` throws a ReferenceError on every multipart request,
      // whether or not a file was attached. FormData.get() only ever
      // returns a string or a File, so this check doesn't need the
      // identifier at all — `File` above is a type annotation only,
      // erased at compile time, never evaluated at runtime.
      const f = form.get("attachment");
      file = f && typeof f !== "string" ? (f as unknown as File) : null;
    } else {
      body = await req.json();
    }

    const today      = todayYmd();
    const bounds     = requestDateBounds(body);
    const holidays   = await getHolidaySet(
      bounds && bounds.from < today ? bounds.from : today,
      bounds && bounds.to > today ? bounds.to : today,
    );
    const leave      = computeLeave(body, today, holidays);
    const attachment = await readAttachment(file);
    checkSickCertificate(leave.type, leave.days, leave.hours, !!attachment);

    // Store the file in R2 when it's configured; otherwise fall back to the
    // database (the original behavior), so an upload is never silently lost.
    let attachmentCreate: { fileName: string; mimeType: string; size: number; r2Key?: string; data?: Buffer } | null = null;
    if (attachment) {
      if (r2Configured()) {
        const key = makeAttachmentKey(attachment.fileName);
        await uploadAttachment(key, attachment.data, attachment.mimeType);
        attachmentCreate = { fileName: attachment.fileName, mimeType: attachment.mimeType, size: attachment.size, r2Key: key };
      } else {
        attachmentCreate = attachment;
      }
    }

    // Identity always comes from the session, never from the request body
    const userEmail = leaveOwnerEmail(loggedInUser);
    const userName  = loggedInUser.name ?? userEmail;
    const year      = leave.startYmd.slice(0, 4);

    // Make sure a maternity credit exists for the year
    if (leave.type === "MATERNITY" && leave.maternityGender) {
      const creditDays = MATERNITY_DAYS[leave.maternityGender];
      const existing   = await prisma.balances.findUnique({
        where: { email_year: { email: userEmail, year } },
      });
      if (existing && !((existing.maternityCredit ?? 0) > 0)) {
        await prisma.balances.update({
          where: { id: existing.id },
          data:  { maternityCredit: creditDays, maternityAvailable: creditDays - (existing.maternityUsed ?? 0) },
        });
      } else if (!existing && loggedInUser.email) {
        await prisma.balances.create({
          data: {
            email: userEmail, name: userName, year,
            maternityCredit: creditDays, maternityAvailable: creditDays,
          },
        });
      }
    }

    const created = await prisma.leave.create({
      data: {
        startDate:  ymdToDate(leave.startYmd),
        endDate:    ymdToDate(leave.endYmd),
        userEmail,
        userName,
        type:       leave.type,
        userNote:   leave.notes,
        days:       leave.days,
        hours:      leave.hours,
        year,
        substitute: leave.substitute,
        ...(leave.segments && { segments: leave.segments as any }),
        ...(attachmentCreate && { attachments: { create: attachmentCreate } }),
      },
      include: { attachments: { select: { id: true } } },
    });

    // Telegram is slow/unreliable — don't make the employee wait for it
    const timeRange = leave.startTime && leave.endTime ? `${leave.startTime}–${leave.endTime}` : undefined;
    const text = [
      `📄 <b>សំណើច្បាប់ថ្មី</b>`,
      ``,
      `👤 <b>ឈ្មោះ៖</b> ${escapeHtml(userName)}`,
      `📋 <b>ប្រភេទ៖</b> ${getLeaveLabel(leave.type, leave.maternityGender)}`,
      ...(leave.maternityGender
        ? [`⚧ <b>ភេទ៖</b> ${leave.maternityGender === "MALE" ? "បុរស 👨" : "ស្ត្រី 👩"}`]
        : []),
      ...buildDateBlock(created, timeRange),
      `📝 <b>មូលហេតុ៖</b> ${escapeHtml(leave.notes) || "—"}`,
      ...(attachment ? [CERTIFICATE_LINE] : []),
      ``,
      `⏳ <i>រង់ចាំអនុម័តពីប្រធានផ្នែក</i>`,
    ].join("\n");

    void sendTelegramMessage(text, [
      { text: "👀 មើល និងអនុម័តប្រធានផ្នែក →", url: leaveUrl(created.id) },
      ...actionButtons(created.id),
      ...certificateButtons(created.id, created.attachments.map((a) => a.id)),
    ])
      .then((telegramMessageId) =>
        telegramMessageId
          ? prisma.leave.update({ where: { id: created.id }, data: { telegramMessageId } })
          : null
      )
      .catch((e) => console.error("[leave POST] telegram:", e));

    return NextResponse.json({ message: "Success", id: created.id }, { status: 200 });
  } catch (error) {
    if (error instanceof LeaveValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
