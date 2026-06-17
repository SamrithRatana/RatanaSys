// app/(dashboard)/dashboard/report/page.tsx
export const dynamic = 'force-dynamic'

import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import Container from "@/components/Common/Container";
import ReportDownload from "./ReportDownload";
import prisma from "@/lib/prisma";

export default async function ReportPage() {
  const user = await getCurrentUser();

  if (
    !user ||
    (user.role !== "ADMIN" && user.role !== "MODERATOR")
  ) {
    redirect("/dashboard");
  }

  // Fetch all users for the search list
  const users = await prisma.user.findMany({
    select: {
      id:    true,
      name:  true,
      email: true,
      image: true,
    },
    orderBy: { name: "asc" },
  });

  return (
    <Container>
      <ReportDownload users={users} />
    </Container>
  );
}