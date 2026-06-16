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
  Building2, Briefcase, Zap,
} from "lucide-react";

type Props = {
  leave: Leave;
  currentUserRole: string;
  currentUserName: string;
};

function leaveTypeLabel(type: string): string {
  const map: Record<string, string> = {
    ANNUAL:    "ច្បាប់ឈប់សម្រាកប្រចាំឆ្នាំ (Annual Leave)",
    SICK:      "ច្បាប់ឈប់សម្រាកឈឺ (Sick Leave)",
    PERSONAL:  "ច្បាប់ឈប់សម្រាកផ្ទាល់ខ្លួន (Personal Leave)",
    SHORT:     "ច្បាប់ឈប់សម្រាកផ្ទាល់ខ្លួន · រយៈពេលខ្លី (Personal Leave – Short)",
    MATERNITY: "ច្បាប់មាតុភាព (Maternity Leave)",
    SPECIAL:   "ច្បាប់ឈប់សម្រាកពិសេស (Special Leave)",
  };
  return map[type?.toUpperCase()] ?? type;
}

function formatHourLabel(h: number): string {
  const totalMin = Math.round(h * 60);
  if (totalMin < 60) return `${totalMin} នាទី`;
  if (totalMin % 60 === 0) return `${totalMin / 60} ម៉ោង`;
  const hrs = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return `${hrs} ម៉ោង ${min} នាទី`;
}

function StatusBadge({ status }: { status: LeaveStatus }) {
  const map: Record<LeaveStatus, { label: string; className: string }> = {
    APPROVED:     { label: "បានអនុម័ត",    className: "bg-green-500 text-white" },
    PENDING:      { label: "កំពុងរង់ចាំ",   className: "bg-amber-500 text-white" },
    REJECTED:     { label: "បានបដិសេធ",    className: "bg-red-500 text-white" },
    INMODERATION: { label: "កំពុងពិនិត្យ", className: "bg-indigo-500 text-white" },
  };
  const { label, className } = map[status] ?? { label: status, className: "bg-gray-400 text-white" };
  return <Badge className={className}>{label}</Badge>;
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-base font-medium">{value}</span>
      </div>
    </div>
  );
}

export default function LeaveDetail({ leave, currentUserRole, currentUserName }: Props) {
  const router = useRouter();
  const [notes, setNotes]     = useState("");
  const [loading, setLoading] = useState(false);

  const isApproved = leave.status === LeaveStatus.APPROVED;
  const isRejected = leave.status === LeaveStatus.REJECTED;
  const isDone     = isApproved || isRejected;

  const isStep1 = !leave.headDepartmentApproved;
  const isStep2 = leave.headDepartmentApproved && !leave.managerApproved && !isDone;

  // ── MODERATOR: can only act on Step 1 (head dept approval) ───────────────
  const canActAsModerator = currentUserRole === "MODERATOR" && isStep1 && !isDone;

  // ── ADMIN: skips Step 1, goes straight to final — always available if not done
  const canActAsAdmin = currentUserRole === "ADMIN" && !isDone;

  const canAct = canActAsModerator || canActAsAdmin;

  const actionLabel = canActAsAdmin
    ? "សេចក្តីសម្រេចរបស់អ្នកគ្រប់គ្រង (Final)"
    : "សេចក្តីសម្រេចរបស់ប្រធានផ្នែក";

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
              ? "ការឈប់សម្រាកបានអនុម័តចុងក្រោយ! ✅"
              : "ប្រធានផ្នែកបានអនុម័ត! កំពុងរង់ចាំអ្នកគ្រប់គ្រង ✅"
            : "ការឈប់សម្រាកបានបដិសេធ ❌",
          { duration: 4000 }
        );
        router.refresh();
      } else {
        const err = await res.json();
        toast.error(err.error ?? "មានបញ្ហាកើតឡើង", { duration: 6000 });
      }
    } catch {
      toast.error("មានបញ្ហាដែលមិននឹកស្មានដល់កើតឡើង");
    } finally {
      setLoading(false);
    }
  }

  const isShortLeave = leave.type === "SHORT";

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6">

      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/dashboard/leaves")}
        className="gap-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        ត្រឡប់ទៅបញ្ជីការឈប់សម្រាក
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">លម្អិតសំណើឈប់សម្រាក</h1>
          <p className="text-sm text-muted-foreground mt-1">លេខសម្គាល់: {leave.id}</p>
        </div>
        <StatusBadge status={leave.status} />
      </div>

      {/* ── Leave Info Card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            ព័ត៌មានការឈប់សម្រាក
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">

          <InfoRow
            icon={<User className="h-4 w-4" />}
            label="បុគ្គលិក"
            value={leave.userName ?? "—"}
          />

          <InfoRow
            icon={<Briefcase className="h-4 w-4" />}
            label="ប្រភេទការឈប់សម្រាក"
            value={leaveTypeLabel(leave.type)}
          />

          <InfoRow
            icon={<CalendarDays className="h-4 w-4" />}
            label="កាលបរិច្ឆេទ"
            value={
              isShortLeave ? (
                dayjs(leave.startDate).format("DD MMM YYYY")
              ) : (
                <span>
                  {dayjs(leave.startDate).format("DD MMM YYYY")}
                  {" → "}
                  {dayjs(leave.endDate).format("DD MMM YYYY")}
                </span>
              )
            }
          />

          <InfoRow
            icon={<Clock className="h-4 w-4" />}
            label="រយៈពេល"
            value={
               leave.hours && leave.hours > 0
    ? leave.days && leave.days > 0
      ? `${leave.days} ថ្ងៃ ${formatHourLabel(Number(leave.hours))}`
      : formatHourLabel(Number(leave.hours))
    : `${leave.days} ថ្ងៃ`
            }
          />

          <InfoRow
            icon={<Clock className="h-4 w-4" />}
            label="បានស្នើនៅ"
            value={dayjs(leave.createdAt).format("DD MMM YYYY HH:mm")}
          />

          <InfoRow
            icon={<FileText className="h-4 w-4" />}
            label="មូលហេតុ"
            value={leave.userNote ?? "—"}
          />

        </CardContent>
      </Card>

      {/* ── Approval Progress Card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            ដំណើរការអនុម័ត
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Step 1 — Head Dept */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                leave.headDepartmentApproved
                  ? "bg-green-100 text-green-600"
                  : "bg-amber-100 text-amber-600"
              }`}>
                {leave.headDepartmentApproved
                  ? <CheckCircle2 className="h-5 w-5" />
                  : <Clock className="h-5 w-5" />}
              </div>
              <div className="w-px flex-1 bg-border mt-2" />
            </div>
            <div className="pb-4">
              <p className="text-sm font-semibold">ជំហានទី ១ — ប្រធានផ្នែក</p>
              {leave.headDepartmentApproved ? (
                <>
                  <p className="text-sm text-green-600">✅ បានអនុម័តដោយ {leave.headDepartment}</p>
                  {leave.headDepartmentNote && (
                    <p className="text-xs text-muted-foreground mt-1">
                      កំណត់ចំណាំ: {leave.headDepartmentNote}
                    </p>
                  )}
                  {leave.headDepartmentAt && (
                    <p className="text-xs text-muted-foreground">
                      {formatDistance(new Date(leave.headDepartmentAt), new Date(), { addSuffix: true })}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-amber-500">⏳ កំពុងរង់ចាំការអនុម័តពីប្រធានផ្នែក</p>
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
              <p className="text-sm font-semibold">ជំហានទី ២ — អ្នកគ្រប់គ្រង</p>
              {leave.managerApproved ? (
                <>
                  <p className="text-sm text-green-600">✅ បានអនុម័តដោយ {leave.manager}</p>
                  {leave.managerNote && (
                    <p className="text-xs text-muted-foreground mt-1">
                      កំណត់ចំណាំ: {leave.managerNote}
                    </p>
                  )}
                  {leave.managerAt && (
                    <p className="text-xs text-muted-foreground">
                      {formatDistance(new Date(leave.managerAt), new Date(), { addSuffix: true })}
                    </p>
                  )}
                </>
              ) : leave.status === LeaveStatus.REJECTED ? (
                <p className="text-sm text-red-500">
                  ❌ បានបដិសេធ — {leave.headDepartmentNote ?? leave.managerNote ?? "គ្មានកំណត់ចំណាំ"}
                </p>
              ) : (
                <p className="text-sm text-gray-400">
                  {leave.headDepartmentApproved
                    ? "⏳ កំពុងរង់ចាំការអនុម័តពីអ្នកគ្រប់គ្រង"
                    : "— រង់ចាំប្រធានផ្នែកអនុម័ត"}
                </p>
              )}
            </div>
          </div>

        </CardContent>
      </Card>

      {/* ── Action Card (shown to MODERATOR on Step 1, or ADMIN at any time) ── */}
      {canAct && (
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/10">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <CheckCircle2 className="h-4 w-4" />
              {actionLabel}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            <div className="rounded-md bg-muted p-3 text-sm">
              {canActAsModerator && (
                <p className="text-amber-600 font-medium">
                  📋 ជំហានទី ១ ក្នុង ២ — អ្នកកំពុងអនុម័តក្នុងតួនាទី <strong>ប្រធានផ្នែក</strong>
                </p>
              )}
              {canActAsAdmin && (
                <p className="text-indigo-600 font-medium flex items-center gap-1.5">
                  <Zap className="h-4 w-4 inline-block" />
                  Admin — អ្នកអាចអនុម័ត <strong>ចុងក្រោយដោយផ្ទាល់</strong> ដោយមិនចាំបាច់រង់ចាំប្រធានផ្នែក
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">កំណត់ចំណាំ</Label>
              <Textarea
                id="notes"
                placeholder="បន្ថែមកំណត់ចំណាំសម្រាប់សេចក្តីសម្រេចរបស់អ្នក..."
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
                {canActAsAdmin
                  ? "អនុម័តចុងក្រោយ (Final Approve)"
                  : "អនុម័តក្នុងតួនាទីប្រធានផ្នែក"}
              </Button>
              <Button
                variant="destructive"
                className="flex-1 gap-2"
                disabled={loading}
                onClick={() => handleAction("REJECTED")}
              >
                <XCircle className="h-4 w-4" />
                បដិសេធ
              </Button>
            </div>

          </CardContent>
        </Card>
      )}

      {/* ── Moderator waiting notice (Step 2 — Admin's turn) ── */}
      {currentUserRole === "MODERATOR" && isStep2 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
          <CardContent className="py-4 text-center">
            <p className="text-amber-700 dark:text-amber-400 text-sm font-medium">
              ⏳ ច្បាប់នេះកំពុងរង់ចាំការអនុម័តពី <strong>អ្នកគ្រប់គ្រង (Admin)</strong>។{" "}
              តួនាទីរបស់អ្នក (Moderator) ត្រូវបានបញ្ចប់នៅជំហានទី ១ រួចហើយ។
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Done notice ── */}
      {isDone && (
        <Card className={`border ${isApproved ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}`}>
          <CardContent className="py-4 text-center">
            <p className={`font-semibold ${isApproved ? "text-green-600" : "text-red-600"}`}>
              {isApproved
                ? "🎉 ការឈប់សម្រាកនេះបានអនុម័តពេញលេញ។"
                : "❌ ការឈប់សម្រាកនេះបានបដិសេធ។"}
            </p>
          </CardContent>
        </Card>
      )}

    </div>
  );
}