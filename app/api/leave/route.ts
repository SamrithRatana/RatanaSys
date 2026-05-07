import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { differenceInDays, parseISO } from "date-fns";

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
  };
};

export async function POST(req: NextRequest) {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) {
    return NextResponse.error();
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

    // ✅ Check balance before anything else
    const balance = await prisma.balances.findUnique({
      where: { email_year: { email: user.email, year } },
    });

    if (!balance) {
      return NextResponse.json(
        { error: "INSUFFICIENT_BALANCE" },
        { status: 400 }
      );
    }
const availableMap: Record<string, number> = {
  ANNUAL:    balance.annualAvailable    ?? 0,
  SICK:      balance.sickAvailable      ?? 0,
  PERSONAL:  balance.personalAvailable  ?? 0,
  MATERNITY: balance.maternityAvailable ?? 0,
  SPECIAL:   balance.specialAvailable   ?? 0,
  SHORT:     balance.annualAvailable    ?? 0,
};

    const available = availableMap[leaveType] ?? 0;

    if (available <= 0) {
      return NextResponse.json(
        { error: "INSUFFICIENT_BALANCE" },
        { status: 400 }
      );
    }

    // ✅ For non-short leaves, also check if requested days exceed available
    if (!isShortLeave && calcDays > available) {
      return NextResponse.json(
        { error: "INSUFFICIENT_BALANCE" },
        { status: 400 }
      );
    }

    // ✅ For short leaves, check if requested hours exceed available annual hours
    if (isShortLeave && calcHours > available * 8) {
      return NextResponse.json(
        { error: "INSUFFICIENT_BALANCE" },
        { status: 400 }
      );
    }

    // Duplicate check — only for non-short leaves
    if (!isShortLeave) {
      const existingLeave = await prisma.leave.findFirst({
        where: {
          startDate:  startDateObj,
          endDate:    endDateObj,
          type:       leaveType,
          userEmail:  user.email,
        },
      });

      if (existingLeave) {
        return NextResponse.json(
          { error: "Leave entry already exists for these dates" },
          { status: 400 }
        );
      }
    }

    await prisma.leave.create({
      data: {
        startDate:  startDateObj,
        endDate:    endDateObj,
        userEmail:  user.email,
        type:       leaveType,
        userNote:   notes,
        userName:   user.name,
        days:       calcDays,
        hours:      calcHours,
        year,
      },
    });

    return NextResponse.json({ message: "Success" }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}