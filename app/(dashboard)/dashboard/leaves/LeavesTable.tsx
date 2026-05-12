"use client";

import { useState } from "react";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import dayjs from "dayjs";
import { formatDistance, subDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Leave, LeaveStatus } from "@prisma/client";
import EditLeave from "./EditLeave";
import { Search, Eye, User } from "lucide-react";
import { useRouter } from "next/navigation";

type LeaveProps = {
  leaves: Leave[];
  currentUserRole: string;
  currentUserName?: string; // ← add this
};

const LeavesTable = ({ leaves, currentUserRole, currentUserName }: LeaveProps) => {
  const [search,       setSearch]       = useState("");
  const [myOnly,       setMyOnly]       = useState(false); // ← toggle state
  const router = useRouter();

  const filtered = leaves.filter((leave) => {
    const matchesSearch = leave.userName?.toLowerCase().includes(search.toLowerCase());
    const matchesMine   = myOnly ? leave.userName === currentUserName : true;
    return matchesSearch && matchesMine;
  });

  function canEdit(leave: Leave): boolean {
    if (
      leave.status === LeaveStatus.APPROVED ||
      leave.status === LeaveStatus.REJECTED
    ) {
      return false;
    }

    if (currentUserRole === "ADMIN") return true;

    if (currentUserRole === "MODERATOR") {
      return !leave.headDepartmentApproved;
    }

    return false;
  }

  const isModerator = currentUserRole === "MODERATOR";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">All Leaves</h2>
          {/* ── My Requests toggle — MODERATOR only ── */}
          {isModerator && (
            <Button
              size="sm"
              variant={myOnly ? "default" : "outline"}
              className={`gap-1.5 ${myOnly ? "bg-blue-600 hover:bg-blue-700 text-white" : "text-blue-600 border-blue-200 hover:bg-blue-50"}`}
              onClick={() => setMyOnly((prev) => !prev)}
            >
              <User className="h-3.5 w-3.5" />
{myOnly ? "Showing My History Request" : "My History Request"}
            </Button>
          )}
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <Table>
        <TableHeader className="whitespace-nowrap">
          <TableRow>
            <TableHead>View</TableHead>
            <TableHead>Edit</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Year</TableHead>
            <TableHead>Requested On</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Days</TableHead>
            <TableHead>Hours</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Requester Note</TableHead>
            <TableHead>Head Dept</TableHead>
            <TableHead>Head Dept Note</TableHead>
            <TableHead>Head Dept At</TableHead>
            <TableHead>Manager</TableHead>
            <TableHead>Manager Note</TableHead>
            <TableHead className="text-right">Manager At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="whitespace-nowrap">
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={17} className="text-center text-muted-foreground py-8">
                {myOnly
                  ? "You have no leave requests."
                  : `No leaves found for "${search}"`}
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((leave) => (
              <TableRow key={leave.id}>

                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    onClick={() => router.push(`/dashboard/leaves/${leave.id}`)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </Button>
                </TableCell>

                <TableCell>
                  {canEdit(leave) && (
                    <EditLeave
                      id={leave.id}
                      days={leave.days}
                      type={leave.type}
                      year={leave.year}
                      email={leave.userEmail}
                      user={leave.userName}
                      startDate={leave.startDate}
                      currentStatus={leave.status}
                      headDepartment={leave.headDepartment}
                      headDepartmentApproved={leave.headDepartmentApproved}
                    />
                  )}
                </TableCell>

                <TableCell className="font-medium">{leave.userName}</TableCell>
                <TableCell>{leave.type}</TableCell>
                <TableCell>{leave.year}</TableCell>
                <TableCell>{dayjs(leave.createdAt).format("YYYY-MM-DD HH:mm:ss")}</TableCell>
                <TableCell className="flex font-medium">
                  <span>{dayjs(leave.startDate).format("DD/MM/YYYY")}</span>
                  {" - "}
                  <span>{dayjs(leave.endDate).format("DD/MM/YYYY")}</span>
                </TableCell>
                <TableCell>{leave.days}</TableCell>
                <TableCell>{leave.hours ?? 0}</TableCell>

                <TableCell>
                  <Badge
                    className={`
                      ${leave.status === LeaveStatus.APPROVED     && "bg-green-500"}
                      ${leave.status === LeaveStatus.PENDING      && "bg-amber-500"}
                      ${leave.status === LeaveStatus.REJECTED     && "bg-red-500"}
                      ${leave.status === LeaveStatus.INMODERATION && "bg-indigo-500"}
                    `}
                  >
                    {leave.status}
                  </Badge>
                </TableCell>

                <TableCell>{leave.userNote ?? "—"}</TableCell>

                <TableCell>
                  {leave.headDepartmentApproved
                    ? <span className="text-green-600 font-medium">✅ {leave.headDepartment}</span>
                    : <span className="text-amber-500">Pending</span>}
                </TableCell>
                <TableCell>{leave.headDepartmentNote ?? "—"}</TableCell>
                <TableCell>
                  {leave.headDepartmentAt
                    ? formatDistance(subDays(new Date(leave.headDepartmentAt), 0), new Date(), { addSuffix: true })
                    : "—"}
                </TableCell>

                <TableCell>
                  {leave.managerApproved
                    ? <span className="text-green-600 font-medium">✅ {leave.manager}</span>
                    : leave.headDepartmentApproved
                      ? <span className="text-indigo-500">Awaiting Manager</span>
                      : <span className="text-gray-400">—</span>}
                </TableCell>
                <TableCell>{leave.managerNote ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {leave.managerAt
                    ? formatDistance(subDays(new Date(leave.managerAt), 0), new Date(), { addSuffix: true })
                    : "—"}
                </TableCell>

              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default LeavesTable;