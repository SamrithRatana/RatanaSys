import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { differenceInDays, parseISO, format } from "date-fns";
import { sendTelegramMessage } from "@/lib/sendTelegramMessage";

type SubmittedLeave = {
  notes:     string;
  leave?:    string;
  type?:     string;
  startDate: string;
  endDate:   string;
  hours?:    number;
  user: {
    email: string;
    image: string;
    name:  string;
    role:  string;
    id?:   string;
  };
};

function getLeaveLabel(type: string): string {
  const labels: Record<string, string> = {
    ANNUAL:    "ច្បាប់ឈប់សម្រាកប្រចាំឆ្នាំ",
    SICK:      "ច្បាប់ឈប់សម្រាកឈឺ",
    PERSONAL:  "ច្បាប់ឈប់សម្រាកផ្ទាល់ខ្លួន",
    MATERNITY: "ច្បាប់សម្រាលកូន",
    SPECIAL:   "ច្បាប់ឈប់សម្រាកពិសេស",
    SHORT:     "ច្បាប់ឈប់សម្រាករយះពេលខ្លី",
  };
  return labels[type.toUpperCase()] ?? `ច្បាប់ ${type}`;
}

export async function POST(req: NextRequest) {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: SubmittedLeave = await req.json();
    const { startDate, endDate, notes, hours, user } = body;

    const leaveType    = (body.type ?? body.leave ?? "").toUpperCase();
    const isShortLeave = leaveType === "SHORT";

    const startDateObj = parseISO(startDate);
    const endDateObj   = parseISO(endDate);
    const year         = startDateObj.getFullYear().toString();

    const calcDays  = isShortLeave ? 0 : differenceInDays(endDateObj, startDateObj) + 1;
    const calcHours = isShortLeave ? Number(hours ?? 0) : 0;

    // Duplicate check
    if (!isShortLeave) {
      const existingLeave = await prisma.leave.findFirst({
        where: {
          startDate: startDateObj,
          endDate:   endDateObj,
          type:      leaveType,
          userEmail: user.email,
        },
      });
      if (existingLeave) {
        return NextResponse.json(
          { error: "Leave entry already exists for these dates" },
          { status: 400 }
        );
      }
    }

    const createdLeave = await prisma.leave.create({
      data: {
        startDate: startDateObj,
        endDate:   endDateObj,
        userEmail: user.email,
        type:      leaveType,
        userNote:  notes,
        userName:  user.name,
        days:      calcDays,
        hours:     calcHours,
        year,
      },
    });

    const baseUrl  = process.env.NEXTAUTH_URL ?? "https://system.camprotec.com.kh";
    const leaveUrl = `${baseUrl}/dashboard/leaves/${createdLeave.id}`;

    const leaveLabel = getLeaveLabel(leaveType);
    const dateRange  = isShortLeave
      ? `${format(startDateObj, "dd MMM yyyy")} (${calcHours} ម៉ោង)`
      : calcDays === 1
        ? format(startDateObj, "dd MMM yyyy")
        : `${format(startDateObj, "dd MMM yyyy")} → ${format(endDateObj, "dd MMM yyyy")} (${calcDays} ថ្ងៃ)`;

    await sendTelegramMessage(
      [
        `📄 <b>សំណើច្បាប់ថ្មី</b>`,
        ``,
        `👤 <b>ឈ្មោះ៖</b> ${user.name}`,
        `📋 <b>ប្រភេទ៖</b> ${leaveLabel}`,
        `📅 <b>កាលបរិច្ឆេទ៖</b> ${dateRange}`,
        `📝 <b>មូលហេតុ៖</b> ${notes || "—"}`,
        ``,
        `⏳ <i>កំពុងរង់ចាំការអនុម័ត</i>`,
      ].join("\n"),
      [{ text: "👀 មើល និងអនុម័ត →", url: leaveUrl }]
    );

    return NextResponse.json({ message: "Success" }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}