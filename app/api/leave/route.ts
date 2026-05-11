import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { differenceInDays, format } from "date-fns";
import { sendTelegramMessage } from "@/lib/sendTelegramMessage";

type SubmittedLeave = {
  notes:           string;
  leave?:          string;
  type?:           string;
  maternityGender?: "MALE" | "FEMALE"; // ← new
  startDate:       string;
  endDate:         string;
  hours?:          number;
  user: {
    email: string;
    image: string;
    name:  string;
    role:  string;
    id?:   string;
  };
};

// Gender-based maternity days
const MATERNITY_DAYS: Record<string, number> = {
  MALE:   7,
  FEMALE: 90,
};

function getLeaveLabel(type: string, gender?: string): string {
  if (type === "MATERNITY") {
    return gender === "MALE"
      ? "ច្បាប់មាតុភាព (បុរស · Paternity · 7ថ្ងៃ)"
      : "ច្បាប់មាតុភាព (ស្ត្រី · Maternity · 90ថ្ងៃ)";
  }
  const labels: Record<string, string> = {
    ANNUAL:    "ច្បាប់ឈប់សម្រាកប្រចាំឆ្នាំ",
    SICK:      "ច្បាប់ឈប់សម្រាកឈឺ",
    PERSONAL:  "ច្បាប់ឈប់សម្រាកផ្ទាល់ខ្លួន",
    SPECIAL:   "ច្បាប់ឈប់សម្រាកពិសេស",
    SHORT:     "ច្បាប់ឈប់សម្រាករយះពេលខ្លី",
  };
  return labels[type.toUpperCase()] ?? `ច្បាប់ ${type}`;
}

function safeParse(isoString: string): Date {
  const dateOnly = isoString.split("T")[0];
  return new Date(`${dateOnly}T12:00:00.000Z`);
}

function safeFormat(isoString: string, fmt: string): string {
  return format(safeParse(isoString), fmt);
}

export async function POST(req: NextRequest) {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: SubmittedLeave = await req.json();
    const { startDate, endDate, notes, hours, user, maternityGender } = body;

    const leaveType    = (body.type ?? body.leave ?? "").toUpperCase();
    const isShortLeave = leaveType === "SHORT";
    const isMaternity  = leaveType === "MATERNITY";

    const startDateObj = safeParse(startDate);
    const endDateObj   = safeParse(endDate);
    const year         = startDateObj.getFullYear().toString();

    // ── Gender-aware day calculation for MATERNITY ──────────────────────────
    let calcDays: number;
    if (isMaternity && maternityGender) {
      calcDays = MATERNITY_DAYS[maternityGender] ?? 90;
    } else if (isShortLeave) {
      calcDays = 0;
    } else {
      calcDays = differenceInDays(endDateObj, startDateObj) + 1;
    }

    const calcHours = isShortLeave ? Number(hours ?? 0) : 0;

    const createdLeave = await prisma.leave.create({
      data: {
        startDate:      startDateObj,
        endDate:        endDateObj,
        userEmail:      user.email,
        type:           leaveType,
        userNote:       notes,
        userName:       user.name,
        days:           calcDays,
        hours:          calcHours,
        year,
        // Store gender on the leave record if your schema has it,
        // otherwise remove this line:
        // maternityGender: maternityGender ?? null,
      },
    });

    const baseUrl    = process.env.NEXTAUTH_URL ?? "https://system.camprotec.com.kh";
    const leaveUrl   = `${baseUrl}/dashboard/leaves/${createdLeave.id}`;
    const leaveLabel = getLeaveLabel(leaveType, maternityGender);

    const dateRange = isShortLeave
      ? `${safeFormat(startDate, "dd MMM yyyy")} (${calcHours} ម៉ោង)`
      : calcDays === 1
        ? safeFormat(startDate, "dd MMM yyyy")
        : `${safeFormat(startDate, "dd MMM yyyy")} → ${safeFormat(endDate, "dd MMM yyyy")} (${calcDays} ថ្ងៃ)`;

    await sendTelegramMessage(
      [
        `📄 <b>សំណើច្បាប់ថ្មី</b>`,
        ``,
        `👤 <b>ឈ្មោះ៖</b> ${user.name}`,
        `📋 <b>ប្រភេទ៖</b> ${leaveLabel}`,
        ...(isMaternity && maternityGender
          ? [`⚧ <b>ភេទ៖</b> ${maternityGender === "MALE" ? "បុរស 👨" : "ស្ត្រី 👩"}`]
          : []),
        `📅 <b>កាលបរិច្ឆេទ៖</b> ${dateRange}`,
        `📝 <b>មូលហេតុ៖</b> ${notes || "—"}`,
        ``,
        `⏳ <i>រង់ចាំអនុម័តពីប្រធានផ្នែក</i>`,
      ].join("\n"),
      [{ text: "👀 មើល និងអនុម័តប្រធានផ្នែក →", url: leaveUrl }]
    );

    return NextResponse.json({ message: "Success" }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}