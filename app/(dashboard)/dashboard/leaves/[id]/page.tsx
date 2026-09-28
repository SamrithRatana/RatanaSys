import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import Container from "@/components/Common/Container";
import LeaveDetail from "./LeaveDetail";
import { moderatorScopeError } from "@/lib/data/departmentScope";
import { leaveOwnerEmail } from "@/lib/leaveServer";

type Props = {
  params: { id: string };
};

export default async function LeaveDetailPage({ params }: Props) {
  const user = await getCurrentUser();

  const leave = await prisma.leave.findUnique({
    where:   { id: params.id },
    include: { attachments: { select: { id: true, fileName: true, mimeType: true, size: true } } },
  });

  if (!leave) return notFound();

  // Moderators can open leaves of their own department (and their own leave, read-only)
  let canApprove = user?.role === "ADMIN" || user?.role === "MODERATOR";
  if (user?.role === "MODERATOR") {
    const isOwn = leave.userEmail === leaveOwnerEmail(user);
    const scopeError = await moderatorScopeError(user, leave.userEmail);
    if (scopeError && !isOwn) return notFound();
    canApprove = !scopeError;
  }

  return (
    <Container>
      <LeaveDetail
        leave={leave}
        currentUserRole={user?.role ?? "USER"}
        currentUserName={user?.name ?? user?.email ?? "Unknown"}
        canApprove={canApprove}
      />
    </Container>
  );
}