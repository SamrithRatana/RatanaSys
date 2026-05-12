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

  const [allLeaves, myLeaves] = await Promise.all([
    getAllLeaveDays(),
    getUserLeaveDays(),
  ]);

  if (allLeaves === null) {
    return <Container>No Leaves found...</Container>;
  }

  return (
    <Container>
      <TableWrapper title="All Leaves">
        <LeavesTable
          leaves={allLeaves as Leave[]}
          currentUserRole={loggedInUser.role}
          currentUserName={loggedInUser.name ?? ""}
          currentUserEmail={loggedInUser.email ?? ""}
          myLeaves={(myLeaves ?? []) as Leave[]}
        />
      </TableWrapper>
    </Container>
  );
}