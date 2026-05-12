export const dynamic = 'force-dynamic'

import Container from "@/components/Common/Container";
import LeavesTable from "./LeavesTable";
import TableWrapper from "@/components/Common/TableWrapper";
import { getAllLeaveDays, getUserLeaveDays } from "@/lib/data/getLeaveDays";
import { getCurrentUser } from "@/lib/session";
import { Leave } from "@prisma/client";
import { redirect } from "next/navigation";

export default async function AdminLeaves() {
  const loggedInUser = await getCurrentUser();

  if (
    !loggedInUser ||
    (loggedInUser.role !== "ADMIN" && loggedInUser.role !== "MODERATOR")
  ) {
    redirect("/dashboard");
  }

  let allLeaves: Leave[] | null = null;
  let myLeaves: Leave[] = [];

  try {
    [allLeaves, myLeaves] = await Promise.all([
      getAllLeaveDays(),
      getUserLeaveDays(),
    ]) as [Leave[], Leave[]];
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
        />
      </TableWrapper>
    </Container>
  );
}