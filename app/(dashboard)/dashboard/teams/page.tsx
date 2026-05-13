export const dynamic = "force-dynamic";

import { getCurrentUser } from "@/lib/session";
import { getTeamsData } from "@/lib/data/getTeamsData";
import Container from "@/components/Common/Container";
import TeamsTable from "./TeamsTable";
import CreateTeamModal from "./CreateTeamModal";
import prisma from "@/lib/prisma";

const TeamsPage = async () => {
  const user = await getCurrentUser();
  const teams = await getTeamsData();

  const allUsers = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, department: true },
    orderBy: { name: "asc" },
  });

  // ✅ Fetch departments from DB
  const departments = await prisma.department.findMany({
    orderBy: { label: "asc" },
    select: { id: true, label: true },
  });

  return (
    <Container>
      <div className="flex flex-col md:flex-row py-6 items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Teams</h2>
        {user?.role === "ADMIN" && (
          <CreateTeamModal allUsers={allUsers} departments={departments} />
        )}
      </div>
      <TeamsTable teams={teams} currentUserRole={user?.role ?? ""} />
    </Container>
  );
};

export default TeamsPage;