import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import dayjs from "dayjs";
import { formatDistance, subDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Leave, LeaveStatus } from "@prisma/client";

type HistoryProps = {
  history: Leave[];
};

const HistoryTable = ({ history }: HistoryProps) => {
  return (
    <Table>
      <TableHeader className="whitespace-nowrap">
        <TableRow>
          <TableHead className="w-[100px]">Type</TableHead>
          <TableHead>Requested On</TableHead>
          <TableHead>Period</TableHead>
          <TableHead>Days</TableHead>
          <TableHead>Hours</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Head Dept</TableHead>
          <TableHead>Head Dept Note</TableHead>
          <TableHead>Manager</TableHead>
          <TableHead className="text-right">Manager Note</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="whitespace-nowrap">
        {history.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">{item.type}</TableCell>
            <TableCell>{dayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss")}</TableCell>
            <TableCell className="flex items-center gap-1">
              <span>{dayjs(item.startDate).format("DD/MM/YYYY")}</span>
              {" - "}
              <span>{dayjs(item.endDate).format("DD/MM/YYYY")}</span>
            </TableCell>
            <TableCell>{item.days}</TableCell>
            <TableCell>{item.hours ?? 0}</TableCell>

            {/* Status badge */}
            <TableCell>
              <Badge className={`
                ${item.status === LeaveStatus.APPROVED     && "bg-green-500"}
                ${item.status === LeaveStatus.PENDING      && "bg-amber-500"}
                ${item.status === LeaveStatus.REJECTED     && "bg-red-500"}
                ${item.status === LeaveStatus.INMODERATION && "bg-indigo-500"}
              `}>
                {item.status}
              </Badge>
            </TableCell>

            {/* Head Department */}
            <TableCell>
              {item.headDepartmentApproved
                ? <span className="text-green-600 font-medium">✅ {item.headDepartment}</span>
                : <span className="text-amber-500">Pending</span>}
            </TableCell>
            <TableCell>{item.headDepartmentNote ?? "—"}</TableCell>

            {/* Manager */}
            <TableCell>
              {item.managerApproved
                ? <span className="text-green-600 font-medium">✅ {item.manager}</span>
                : item.headDepartmentApproved
                  ? <span className="text-indigo-500">Awaiting Manager</span>
                  : <span className="text-gray-400">—</span>}
            </TableCell>
            <TableCell className="text-right">{item.managerNote ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default HistoryTable;