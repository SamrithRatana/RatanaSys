"use client";

import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import dayjs from "dayjs";
import { Leave, LeaveStatus, User } from "@prisma/client";
import { ComponentProps, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import toast from "react-hot-toast";
import { Pencil, Trash2 } from "lucide-react";
import CertificateUploadButton from "@/components/Common/CertificateUploadButton";
import type RequestFormType from "@/app/(portal)/portal/RequestForm";

// The full request form, reused prefilled as the edit dialog
const RequestForm = dynamic(
  () => import("@/app/(portal)/portal/RequestForm"),
  { ssr: false },
) as React.ComponentType<ComponentProps<typeof RequestFormType>>;

export type OwnLeave = Leave & { attachments?: { id: string; fileName: string }[] };

type HistoryProps = {
  history:   OwnLeave[];
  user:      User;
  teammates: ComponentProps<typeof RequestFormType>["users"];
  holidays:  string[];
};

export default function HistoryTable({ history, user, teammates, holidays }: HistoryProps) {
  const router = useRouter();

  const [editingLeave, setEditingLeave] = useState<OwnLeave | null>(null);
  const [loading,      setLoading]      = useState(false);

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
            const canUploadCertificate = item.type === "SICK" && item.status !== LeaveStatus.REJECTED;

            return (
              <TableRow key={item.id}>

                {/* Actions */}
                <TableCell>
                  <div className="flex gap-1.5">
                    {isPending && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-blue-600 border-blue-200 hover:bg-blue-50 h-7 px-2"
                          onClick={() => setEditingLeave(item)}
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
                      </>
                    )}
                    {canUploadCertificate && (
                      <CertificateUploadButton leaveId={item.id} hasCertificate={(item.attachments?.length ?? 0) > 0} />
                    )}
                  </div>
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
                <TableCell>{Number((item.hours ?? 0).toFixed(2))}</TableCell>

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

      {/* ── Edit: the same form as a new request, prefilled ── */}
      {editingLeave && (
        <RequestForm
          key={editingLeave.id}
          user={user}
          users={teammates}
          holidays={holidays}
          editLeave={editingLeave}
          externalOpen
          onExternalClose={() => setEditingLeave(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}
