import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import Container from "@/components/Common/Container";
import LeaveDetail from "./LeaveDetail";

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

  return (
    <Container>
      <LeaveDetail
        leave={leave}
        currentUserRole={user?.role ?? "USER"}
        currentUserName={user?.name ?? user?.email ?? "Unknown"}
      />
    </Container>
  );
}