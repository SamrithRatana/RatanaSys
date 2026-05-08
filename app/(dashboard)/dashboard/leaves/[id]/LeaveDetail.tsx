"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Leave, LeaveStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import dayjs from "dayjs";
import { formatDistance } from "date-fns";
import toast from "react-hot-toast";
import {
  ArrowLeft, CheckCircle2, XCircle,
  Clock, User, CalendarDays, FileText,
  Building2, Briefcase,
} from "lucide-react";

type Props = {
  leave: Leave;
  currentUserRole: string;
  currentUserName: string;
};

function StatusBadge({ status }: { status: LeaveStatus }) {
  const map: Record<LeaveStatus, { label: string; className: string }> = {
    APPROVED:     { label: "Approved",      className: "bg-green-500 text-white" },
    PENDING:      { label: "Pending",       className: "bg-amber-500 text-white" },
    REJECTED:     { label: "Rejected",      className: "bg-red-500 text-white" },
    INMODERATION: { label: "In Moderation", className: "bg-indigo-500 text-white" },
  };
  const { label, className } = map[status] ?? { label: status, className: "bg-gray-400 text-white" };
  return <Badge className={className}>{label}</Badge>;
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-medium">{value}</span>
      </div>
    </div>
  );
}

export default function LeaveDetail({ leave, currentUserRole, currentUserName }: Props) {
  const router = useRouter();
  const [notes, setNotes]       = useState("");
  const [loading, setLoading]   = useState(false);

  const isApproved = leave.status === LeaveStatus.APPROVED;
  const isRejected = leave.status === LeaveStatus.REJECTED;
  const isDone     = isApproved || isRejected;

  const isStep1 = !leave.headDepartmentApproved;
  const isStep2 = leave.headDepartmentApproved && leave.status === LeaveStatus.INMODERATION;

  const canActAsModerator = currentUserRole === "MODERATOR" && isStep1 && !isDone;
  const canActAsAdmin     = currentUserRole === "ADMIN" && isStep2 && !isDone;
  const canAct            = canActAsModerator || canActAsAdmin;

  async function handleAction(status: "APPROVED" | "REJECTED") {
    setLoading(true);
    try {
      const res = await fetch(`/api/leave/${leave.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes,
          status,
          id:        leave.id,
          days:      leave.days,
          type:      leave.type,
          year:      leave.year,
          email:     leave.userEmail,
          user:      leave.userName,
          startDate: leave.startDate,
        }),
      });

      if (res.ok) {
        toast.success(
          status === "APPROVED"
            ? canActAsAdmin
              ? "Leave fully approved! ✅"
              : "Head Dept approved! Awaiting Manager ✅"
            : "Leave rejected ❌",
          { duration: 4000 }
        );
        router.refresh();
      } else {
        const err = await res.json();
        toast.error(err.error ?? "An error occurred", { duration: 6000 });
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6">

      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/dashboard/leaves")}
        className="gap-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to All Leaves
      </Button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leave Request Detail</h1>
          <p className="text-sm text-muted-foreground mt-1">ID: {leave.id}</p>
        </div>
        <StatusBadge status={leave.status} />
      </div>

      {/* Leave Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Leave Information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <InfoRow
            icon={<User className="h-4 w-4" />}
            label="Employee"
            value={leave.userName ?? "—"}
          />
          <InfoRow
            icon={<Briefcase className="h-4 w-4" />}
            label="Leave Type"
            value={leave.type}
          />
          <InfoRow
            icon={<CalendarDays className="h-4 w-4" />}
            label="Period"
            value={
              <span>
                {dayjs(leave.startDate).format("DD MMM YYYY")}
                {" → "}
                {dayjs(leave.endDate).format("DD MMM YYYY")}
              </span>
            }
          />
          <InfoRow
            icon={<Clock className="h-4 w-4" />}
            label="Duration"
            value={
              leave.hours && leave.hours > 0
                ? `${leave.hours} hrs`
                : `${leave.days} day${leave.days !== 1 ? "s" : ""}`
            }
          />
          <InfoRow
            icon={<Clock className="h-4 w-4" />}
            label="Requested On"
            value={dayjs(leave.createdAt).format("DD MMM YYYY HH:mm")}
          />
          <InfoRow
            icon={<FileText className="h-4 w-4" />}
            label="Reason"
            value={leave.userNote ?? "—"}
          />
        </CardContent>
      </Card>

      {/* Approval Timeline Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Approval Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Step 1 — Head Dept */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                leave.headDepartmentApproved ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"
              }`}>
                {leave.headDepartmentApproved
                  ? <CheckCircle2 className="h-5 w-5" />
                  : <Clock className="h-5 w-5" />}
              </div>
              <div className="w-px flex-1 bg-border mt-2" />
            </div>
            <div className="pb-4">
              <p className="text-sm font-semibold">Step 1 — Head Department</p>
              {leave.headDepartmentApproved ? (
                <>
                  <p className="text-sm text-green-600">✅ Approved by {leave.headDepartment}</p>
                  {leave.headDepartmentNote && (
                    <p className="text-xs text-muted-foreground mt-1">Note: {leave.headDepartmentNote}</p>
                  )}
                  {leave.headDepartmentAt && (
                    <p className="text-xs text-muted-foreground">
                      {formatDistance(new Date(leave.headDepartmentAt), new Date(), { addSuffix: true })}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-amber-500">⏳ Awaiting Head Department approval</p>
              )}
            </div>
          </div>

          {/* Step 2 — Manager */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                leave.managerApproved
                  ? "bg-green-100 text-green-600"
                  : leave.status === LeaveStatus.REJECTED
                    ? "bg-red-100 text-red-500"
                    : "bg-gray-100 text-gray-400"
              }`}>
                {leave.managerApproved
                  ? <CheckCircle2 className="h-5 w-5" />
                  : leave.status === LeaveStatus.REJECTED
                    ? <XCircle className="h-5 w-5" />
                    : <Clock className="h-5 w-5" />}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold">Step 2 — Manager</p>
              {leave.managerApproved ? (
                <>
                  <p className="text-sm text-green-600">✅ Approved by {leave.manager}</p>
                  {leave.managerNote && (
                    <p className="text-xs text-muted-foreground mt-1">Note: {leave.managerNote}</p>
                  )}
                  {leave.managerAt && (
                    <p className="text-xs text-muted-foreground">
                      {formatDistance(new Date(leave.managerAt), new Date(), { addSuffix: true })}
                    </p>
                  )}
                </>
              ) : leave.status === LeaveStatus.REJECTED ? (
                <p className="text-sm text-red-500">❌ Rejected — {leave.headDepartmentNote ?? leave.managerNote ?? "No note"}</p>
              ) : (
                <p className="text-sm text-gray-400">
                  {leave.headDepartmentApproved ? "⏳ Awaiting Manager approval" : "— Pending Head Dept first"}
                </p>
              )}
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Action Card — only shown if current user can act */}
      {canAct && (
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/10">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <CheckCircle2 className="h-4 w-4" />
              {canActAsAdmin ? "Manager Decision" : "Head Department Decision"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            <div className="rounded-md bg-muted p-3 text-sm">
              {canActAsModerator && (
                <p className="text-amber-600 font-medium">
                  📋 Step 1 of 2 — You are approving as <strong>Head Department</strong>
                </p>
              )}
              {canActAsAdmin && (
                <p className="text-indigo-600 font-medium">
                  ✅ Step 2 of 2 — Head Dept ({leave.headDepartment}) already approved.
                  You are approving as <strong>Manager</strong>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add a note for your decision..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            <Separator />

            <div className="flex gap-3">
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2"
                disabled={loading}
                onClick={() => handleAction("APPROVED")}
              >
                <CheckCircle2 className="h-4 w-4" />
                {canActAsAdmin ? "Approve as Manager" : "Approve as Head Dept"}
              </Button>
              <Button
                variant="destructive"
                className="flex-1 gap-2"
                disabled={loading}
                onClick={() => handleAction("REJECTED")}
              >
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
            </div>

          </CardContent>
        </Card>
      )}

      {/* Already done */}
      {isDone && (
        <Card className={`border ${isApproved ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}`}>
          <CardContent className="py-4 text-center">
            <p className={`font-semibold ${isApproved ? "text-green-600" : "text-red-600"}`}>
              {isApproved ? "🎉 This leave has been fully approved." : "❌ This leave has been rejected."}
            </p>
          </CardContent>
        </Card>
      )}

    </div>
  );
}