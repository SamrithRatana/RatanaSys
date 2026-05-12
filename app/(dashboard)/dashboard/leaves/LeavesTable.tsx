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
import { Search, Eye, User, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

// ── inline HistoryTable (same as HistoryTable.tsx but embedded) ──
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Pencil, Trash2, X, Check, FileEdit } from "lucide-react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";

type LeaveProps = {
  leaves: Leave[];
  currentUserRole: string;
  currentUserName?: string;
  currentUserEmail?: string;
};

// ─────────────────────────────────────────────
// Mini HistoryTable rendered inside LeavesTable
// ─────────────────────────────────────────────
function MyHistoryTable({ history }: { history: Leave[] }) {
  const router = useRouter();

  const [editingLeave, setEditingLeave] = useState<Leave | null>(null);
  const [editNotes,    setEditNotes]    = useState("");
  const [editStart,    setEditStart]    = useState("");
  const [editEnd,      setEditEnd]      = useState("");
  const [editHours,    setEditHours]    = useState<number>(0);
  const [loading,      setLoading]      = useState(false);

  function openEdit(item: Leave) {
    setEditingLeave(item);
    setEditNotes(item.userNote ?? "");
    setEditStart(dayjs(item.startDate).format("YYYY-MM-DD"));
    setEditEnd(dayjs(item.endDate).format("YYYY-MM-DD"));
    setEditHours(item.hours ?? 0);
  }

  function closeEdit() { setEditingLeave(null); }

  async function submitEdit() {
    if (!editingLeave) return;
    setLoading(true);
    try {
      const isShort = editingLeave.type === "SHORT";
      const res = await fetch(`/api/leave/${editingLeave.id}/user-edit`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes:     editNotes,
          startDate: editStart,
          endDate:   isShort ? editStart : editEnd,
          hours:     isShort ? editHours : undefined,
        }),
      });
      if (res.ok) {
        toast.success("Leave updated ✅", { duration: 4000 });
        closeEdit();
        router.refresh();
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Update failed", { duration: 5000 });
      }
    } catch {
      toast.error("Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  async function cancelLeave(id: string) {
    if (!confirm("Are you sure you want to cancel this leave request?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/leave/${id}/user-edit`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Leave cancelled ❌", { duration: 4000 });
        router.refresh();
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Cancel failed", { duration: 5000 });
      }
    } catch {
      toast.error("Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  const isShortEdit = editingLeave?.type === "SHORT";

  return (
    <>
      <Table>
        <TableHeader className="whitespace-nowrap">
          <TableRow>
            <TableHead>Actions</TableHead>
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
          {history.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                You have no leave requests.
              </TableCell>
            </TableRow>
          ) : (
            history.map((item) => {
              const isPending = item.status === LeaveStatus.PENDING;
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    {isPending && (
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-blue-600 border-blue-200 hover:bg-blue-50 h-7 px-2"
                          onClick={() => openEdit(item)}
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-red-500 border-red-200 hover:bg-red-50 h-7 px-2"
                          disabled={loading}
                          onClick={() => cancelLeave(item.id)}
                        >
                          <Trash2 className="h-3 w-3" /> Cancel
                        </Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{item.type}</TableCell>
                  <TableCell>{dayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss")}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <span>{dayjs(item.startDate).format("DD/MM/YYYY")}</span>
                      {" - "}
                      <span>{dayjs(item.endDate).format("DD/MM/YYYY")}</span>
                    </span>
                  </TableCell>
                  <TableCell>{item.days}</TableCell>
                  <TableCell>{item.hours ?? 0}</TableCell>
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
                  <TableCell>
                    {item.headDepartmentApproved
                      ? <span className="text-green-600 font-medium">✅ {item.headDepartment}</span>
                      : <span className="text-amber-500">Pending</span>}
                  </TableCell>
                  <TableCell>{item.headDepartmentNote ?? "—"}</TableCell>
                  <TableCell>
                    {item.managerApproved
                      ? <span className="text-green-600 font-medium">✅ {item.manager}</span>
                      : item.headDepartmentApproved
                        ? <span className="text-indigo-500">Awaiting Manager</span>
                        : <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell className="text-right">{item.managerNote ?? "—"}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* ── Edit Popup ── */}
      {editingLeave && typeof window !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
          onClick={closeEdit}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4 border-b flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <FileEdit className="h-5 w-5 text-blue-600" />
                  <h2 className="text-lg font-semibold">កែសម្រួលសំណើច្បាប់</h2>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {editingLeave.type} · {dayjs(editingLeave.startDate).format("DD MMM YYYY")}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none mt-1"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className={`grid gap-3 ${isShortEdit ? "grid-cols-1" : "grid-cols-2"}`}>
                <div className="space-y-1.5">
                  <Label className="text-sm">{isShortEdit ? "កាលបរិច្ឆេទ" : "ថ្ងៃចាប់ផ្តើម"}</Label>
                  <Input
                    type="date"
                    value={editStart}
                    onChange={(e) => setEditStart(e.target.value)}
                    className="h-9"
                  />
                </div>
                {!isShortEdit && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">ថ្ងៃបញ្ចប់</Label>
                    <Input
                      type="date"
                      value={editEnd}
                      min={editStart}
                      onChange={(e) => setEditEnd(e.target.value)}
                      className="h-9"
                    />
                  </div>
                )}
              </div>
              {isShortEdit && (
                <div className="space-y-1.5">
                  <Label className="text-sm">ចំនួនម៉ោង (0.5 – 8)</Label>
                  <Input
                    type="number"
                    min={0.5}
                    max={8}
                    step={0.5}
                    value={editHours}
                    onChange={(e) => setEditHours(Number(e.target.value))}
                    className="h-9"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-sm">មូលហេតុ / Reason</Label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  placeholder="Update your reason..."
                  className="resize-none"
                />
              </div>
              <Separator />
              <div className="flex gap-3 pt-1">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2"
                  disabled={loading}
                  onClick={submitEdit}
                >
                  <Check className="h-4 w-4" />
                  រក្សាទុក
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  disabled={loading}
                  onClick={closeEdit}
                >
                  <X className="h-4 w-4" />
                  បោះបង់
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// Main LeavesTable
// ─────────────────────────────────────────────
const LeavesTable = ({ leaves, currentUserRole, currentUserName, currentUserEmail }: LeaveProps) => {
  const [search, setSearch] = useState("");
  const [myOnly, setMyOnly] = useState(false);
  const router = useRouter();

  // my own leaves filtered by email (reliable) or name fallback
  const myLeaves = leaves.filter((leave) =>
    currentUserEmail
      ? leave.userEmail === currentUserEmail
      : leave.userName  === currentUserName
  );

  const filtered = leaves.filter((leave) =>
    leave.userName?.toLowerCase().includes(search.toLowerCase())
  );

  function canEdit(leave: Leave): boolean {
    if (
      leave.status === LeaveStatus.APPROVED ||
      leave.status === LeaveStatus.REJECTED
    ) return false;
    if (currentUserRole === "ADMIN") return true;
    if (currentUserRole === "MODERATOR") return !leave.headDepartmentApproved;
    return false;
  }

  const isModerator = currentUserRole === "MODERATOR";

  // ── When myOnly is active, render the HistoryTable view ──
  if (myOnly) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
            onClick={() => setMyOnly(false)}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to All Leaves
          </Button>
          <h2 className="text-xl font-semibold">My Leave History</h2>
        </div>
        <MyHistoryTable history={myLeaves} />
      </div>
    );
  }

  // ── Default: full All Leaves table ──
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">All Leaves</h2>
          {isModerator && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
              onClick={() => setMyOnly(true)}
            >
              <User className="h-3.5 w-3.5" />
              My History Request
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
                No leaves found for &quot;{search}&quot;
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