import { getCurrentUser } from "@/lib/session";
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

    // Accept either `type` or `leave` field — form sends both
    const leaveType    = (body.type ?? body.leave ?? "").toUpperCase();
    const isShortLeave = leaveType === "SHORT";

    const startDateObj = parseISO(startDate);
    const endDateObj   = parseISO(endDate);

    // SHORT: days = 0, hours = what user entered
    // Full day: days = date diff + 1, hours = 0
    const calcDays  = isShortLeave ? 0 : differenceInDays(endDateObj, startDateObj) + 1;
    const calcHours = isShortLeave ? Number(hours ?? 0) : 0;

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

    const year = startDateObj.getFullYear().toString();

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