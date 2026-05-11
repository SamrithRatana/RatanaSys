"use client";

import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import dayjs from "dayjs";
import { Leave, LeaveStatus } from "@prisma/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Pencil, Trash2, X, Check } from "lucide-react";

type HistoryProps = { history: Leave[] };

export default function HistoryTable({ history }: HistoryProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd,   setEditEnd]   = useState("");
  const [editHours, setEditHours] = useState<number>(0);
  const [loading,   setLoading]   = useState(false);

  function startEdit(item: Leave) {
    setEditingId(item.id);
    setEditNotes(item.userNote ?? "");
    setEditStart(dayjs(item.startDate).format("YYYY-MM-DD"));
    setEditEnd(dayjs(item.endDate).format("YYYY-MM-DD"));
    setEditHours(item.hours ?? 0);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function submitEdit(item: Leave) {
    setLoading(true);
    try {
      const res = await fetch(`/api/leave/${item.id}/user-edit`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes:     editNotes,
          startDate: editStart,
          endDate:   item.type === "SHORT" ? editStart : editEnd,
          hours:     item.type === "SHORT" ? editHours : undefined,
        }),
      });

      if (res.ok) {
        toast.success("Leave updated ✅", { duration: 4000 });
        setEditingId(null);
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

  return (
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
        {history.map((item) => {
          const isPending = item.status === LeaveStatus.PENDING;
          const isEditing = editingId === item.id;
          const isShort   = item.type === "SHORT";

          return (
            <>
              <TableRow key={item.id} className={isEditing ? "bg-blue-50/50 dark:bg-blue-950/10" : ""}>

                {/* Actions */}
                <TableCell>
                  {isPending && !isEditing && (
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-blue-600 border-blue-200 hover:bg-blue-50 h-7 px-2"
                        onClick={() => startEdit(item)}
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
                  {isEditing && (
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        className="gap-1 bg-green-600 hover:bg-green-700 text-white h-7 px-2"
                        disabled={loading}
                        onClick={() => submitEdit(item)}
                      >
                        <Check className="h-3 w-3" /> Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 h-7 px-2"
                        onClick={cancelEdit}
                      >
                        <X className="h-3 w-3" /> Cancel
                      </Button>
                    </div>
                  )}
                </TableCell>

                <TableCell className="font-medium">{item.type}</TableCell>
                <TableCell>{dayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss")}</TableCell>

                {/* Period — editable inline */}
                <TableCell>
                  {isEditing ? (
                    <div className="flex flex-col gap-1 min-w-[220px]">
                      <div className="flex items-center gap-1">
                        <Label className="text-xs w-10 shrink-0">Start</Label>
                        <Input
                          type="date"
                          value={editStart}
                          onChange={(e) => setEditStart(e.target.value)}
                          className="h-7 text-xs"
                        />
                      </div>
                      {!isShort && (
                        <div className="flex items-center gap-1">
                          <Label className="text-xs w-10 shrink-0">End</Label>
                          <Input
                            type="date"
                            value={editEnd}
                            onChange={(e) => setEditEnd(e.target.value)}
                            className="h-7 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="flex items-center gap-1">
                      <span>{dayjs(item.startDate).format("DD/MM/YYYY")}</span>
                      {" - "}
                      <span>{dayjs(item.endDate).format("DD/MM/YYYY")}</span>
                    </span>
                  )}
                </TableCell>

                <TableCell>{item.days}</TableCell>

                {/* Hours — editable for SHORT */}
                <TableCell>
                  {isEditing && isShort ? (
                    <Input
                      type="number"
                      min={0.5}
                      max={8}
                      step={0.5}
                      value={editHours}
                      onChange={(e) => setEditHours(Number(e.target.value))}
                      className="h-7 text-xs w-16"
                    />
                  ) : (
                    item.hours ?? 0
                  )}
                </TableCell>

                {/* Status */}
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

              {/* Inline notes editor — renders as a second row when editing */}
              {isEditing && (
                <TableRow key={`${item.id}-edit`} className="bg-blue-50/50 dark:bg-blue-950/10">
                  <TableCell colSpan={11} className="pt-0 pb-3">
                    <div className="flex flex-col gap-1 max-w-lg">
                      <Label className="text-xs text-muted-foreground">មូលហេតុ / Reason</Label>
                      <Textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        rows={2}
                        className="text-sm"
                        placeholder="Update your reason..."
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          );
        })}
      </TableBody>
    </Table>
  );
}