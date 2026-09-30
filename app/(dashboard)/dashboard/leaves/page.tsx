export const dynamic = 'force-dynamic'

import Container from "@/components/Common/Container";
import LeavesTable from "./LeavesTable";
import TableWrapper from "@/components/Common/TableWrapper";
import { getAllLeaveDays, getUserLeaveDays } from "@/lib/data/getLeaveDays";
import { getCurrentUser } from "@/lib/session";
import { getTeamsData } from "@/lib/data/getTeamsData";
import { getEventsData } from "@/lib/data/getEventData";
import { holidayYmds } from "@/lib/leaveRules";
import { Leave, User } from "@prisma/client";
import { redirect } from "next/navigation";
import type { OwnLeave } from "@/app/(portal)/portal/history/HistoryTable";

export default async function AdminLeaves() {
  const loggedInUser = await getCurrentUser();

  if (
    !loggedInUser ||
    (loggedInUser.role !== "ADMIN" && loggedInUser.role !== "MODERATOR")
  ) {
    redirect("/dashboard");
  }

  let allLeaves: Leave[] | null = null;
  let myLeaves: OwnLeave[] = [];
  // teammates + holidays feed the edit dialog (the full request form)
  let teammates: Awaited<ReturnType<typeof getTeamsData>>["teammates"] = [];
  let holidays: string[] = [];

  try {
    const [all, mine, teams, events] = await Promise.all([
      getAllLeaveDays(),
      getUserLeaveDays(),
      getTeamsData().catch(() => ({ teams: [], teammates: [] })),
      getEventsData().catch(() => []),
    ]);
    allLeaves = all as Leave[] | null;
    myLeaves  = (mine ?? []) as OwnLeave[];
    teammates = teams.teammates;
    holidays  = holidayYmds(events);
  } catch (error) {
    console.error("Failed to load leaves:", error);
  }

  if (!allLeaves) {
    return (
      <Container>
        <p className="text-center text-red-500 mt-10">
          Failed to load leaves. Please refresh the page.
        </p>
      </Container>
    );
  }

  return (
    <Container>
      <TableWrapper title="All Leaves">
        <LeavesTable
          leaves={allLeaves}
          currentUserRole={loggedInUser.role}
          currentUserName={loggedInUser.name ?? ""}
          currentUserEmail={loggedInUser.email ?? ""}
          myLeaves={myLeaves}
          user={loggedInUser as unknown as User}
          teammates={teammates}
          holidays={holidays}
        />
      </TableWrapper>
    </Container>
  );
}
