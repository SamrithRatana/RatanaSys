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
    ANNUAL:    "Annual Leave",
    SICK:      "Sick Leave",
    PERSONAL:  "Personal Leave",
    MATERNITY: "Maternity Leave",
    SPECIAL:   "Special Leave",
    SHORT:     "Short Leave",
  };
  return labels[type.toUpperCase()] ?? `${type} Leave`;
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

    // Create and capture the new leave record
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

    // Build deep link to this specific leave
    const baseUrl  = process.env.NEXTAUTH_URL ?? "https://system.camprotec.com.kh";
    const leaveUrl = `${baseUrl}/dashboard/leaves/${createdLeave.id}`;

    // Telegram notification
    const leaveLabel = getLeaveLabel(leaveType);
    const dateRange  = isShortLeave
      ? `${format(startDateObj, "dd MMM yyyy")} (${calcHours} hr${calcHours !== 1 ? "s" : ""})`
      : calcDays === 1
        ? format(startDateObj, "dd MMM yyyy")
        : `${format(startDateObj, "dd MMM yyyy")} → ${format(endDateObj, "dd MMM yyyy")} (${calcDays} days)`;

    await sendTelegramMessage(
      [
        `📄 <b>New Leave Request</b>`,
        ``,
        `👤 <b>Name:</b> ${user.name}`,
        `📋 <b>Type:</b> ${leaveLabel}`,
        `📅 <b>Date:</b> ${dateRange}`,
        `📝 <b>Reason:</b> ${notes || "—"}`,
        ``,
        `⏳ <i>Awaiting approval</i>`,
      ].join("\n"),
      [{ text: "👀 View & Approve →", url: leaveUrl }]
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