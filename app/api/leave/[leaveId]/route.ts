import { getCurrentUser } from "@/lib/session";
import { LeaveStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { ApprovalError, decideLeave } from "@/lib/leaveDecision";

type EditBody = {
  notes?: string;
  status: LeaveStatus;
  id?:    string;
};

type Params = { params: { leaveId: string } };

// Approve/reject a leave from the web dashboard. The Telegram one-click
// buttons (app/api/telegram/webhook/route.ts) call the exact same
// decideLeave() so both paths behave identically.
export async function PATCH(req: Request, { params }: Params) {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: EditBody = await req.json();
    if (body.status !== LeaveStatus.APPROVED && body.status !== LeaveStatus.REJECTED) {
      return NextResponse.json({ error: "Invalid approval state" }, { status: 400 });
    }
    const id = params.leaveId ?? body.id;
    const message = await decideLeave(loggedInUser, id, body.status, body.notes ?? "");
    return NextResponse.json({ message }, { status: 200 });
  } catch (error) {
    if (error instanceof ApprovalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
