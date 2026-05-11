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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import dayjs from "dayjs";
import { Leave, LeaveStatus } from "@prisma/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Pencil, Trash2, X, Check, FileEdit } from "lucide-react";
import { createPortal } from "react-dom";

type HistoryProps = { history: Leave[] };

export default function HistoryTable({ history }: HistoryProps) {
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

  function closeEdit() {
    setEditingLeave(null);
  }

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
          {history.map((item) => {
            const isPending = item.status === LeaveStatus.PENDING;

            return (
              <TableRow key={item.id}>

                {/* Actions */}
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
          })}
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
            {/* Header */}
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

            {/* Body */}
            <div className="px-6 py-5 space-y-4">

              {/* Date fields */}
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

              {/* Hours — SHORT only */}
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

              {/* Notes */}
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

              {/* Actions */}
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