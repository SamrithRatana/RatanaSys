import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/sendTelegramMessage";
import { MATERNITY_DAYS, todayYmd } from "@/lib/leaveRules";
import {
  LeaveValidationError,
  SubmittedLeave,
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
      const f = form.get("attachment");
      file = f instanceof File ? f : null;
    } else {
      body = await req.json();
    }

    const bounds     = requestDateBounds(body);
    const holidays   = bounds ? await getHolidaySet(bounds.from, bounds.to) : new Set<string>();
    const leave      = computeLeave(body, todayYmd(), holidays);
    const attachment = await readAttachment(file);
    checkSickCertificate(leave.type, leave.days, leave.hours, !!attachment);

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
        ...(attachment && { attachments: { create: attachment } }),
      },
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
      ...(attachment ? [`📎 <b>ឯកសារភ្ជាប់៖</b> មាន (សំបុត្រពេទ្យ)`] : []),
      ``,
      `⏳ <i>រង់ចាំអនុម័តពីប្រធានផ្នែក</i>`,
    ].join("\n");

    void sendTelegramMessage(text, [{ text: "👀 មើល និងអនុម័តប្រធានផ្នែក →", url: leaveUrl(created.id) }])
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
