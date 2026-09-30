export const dynamic = 'force-dynamic'

import Container from "@/components/Common/Container";
import HistoryTable, { OwnLeave } from "./HistoryTable";
import TableWrapper from "../../../../components/Common/TableWrapper";
import { User } from "@prisma/client";
import { getUserLeaveDays } from "@/lib/data/getLeaveDays";
import { getCurrentUser } from "@/lib/session";
import { getTeamsData } from "@/lib/data/getTeamsData";
import { getEventsData } from "@/lib/data/getEventData";
import { holidayYmds } from "@/lib/leaveRules";

const UserHistory = async () => {
  // teammates + holidays feed the edit dialog (the full request form)
  const [leaveHistory, user, { teammates }, events] = await Promise.all([
    getUserLeaveDays(),
    getCurrentUser(),
    getTeamsData().catch(() => ({ teams: [], teammates: [] })),
    getEventsData().catch(() => []),
  ]);

  // null = not logged in / session missing
  if (leaveHistory === null || !user) {
    return <Container>Please log in to view your leave history.</Container>;
  }

  return (
    <Container>
      <TableWrapper title="My Leave History">
        <HistoryTable
          history={leaveHistory as OwnLeave[]}
          user={user as User}
          teammates={teammates}
          holidays={holidayYmds(events)}
        />
      </TableWrapper>
    </Container>
  );
};

export default UserHistory;
