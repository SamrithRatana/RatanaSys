"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";

const REPORT_TYPES = [
  {
    id: "leave-summary",
    title: "Leave Summary",
    format: "PDF",
    desc: "All leaves with status, dates, days & hours per user",
  },
  {
    id: "leave-balance",
    title: "Leave Balance",
    format: "CSV",
    desc: "Credit / used / available for all leave types per user",
  },
  {
    id: "leave-by-type",
    title: "Leave By Type",
    format: "PDF",
    desc: "Annual, sick, personal, maternity, special & short breakdown",
  },
  {
    id: "approval-workflow",
    title: "Approval Workflow",
    format: "PDF",
    desc: "Head dept + manager approval status and timeline",
  },
  {
    id: "monthly-overview",
    title: "Monthly Overview",
    format: "CSV",
    desc: "Leave trends and totals grouped by month",
  },
] as const;

type ReportId = typeof REPORT_TYPES[number]["id"];

type Props = {
  open: boolean;
  onClose: () => void;
  defaultFrom?: string;
  defaultTo?: string;
};

export const ReportDownloadModal = ({
  open, onClose, defaultFrom, defaultTo,
}: Props) => {
  const [selected, setSelected] = useState<ReportId>("leave-summary");
  const [from, setFrom] = useState(defaultFrom ?? dayjs().startOf("month").format("YYYY-MM-DD"));
  const [to, setTo]     = useState(defaultTo   ?? dayjs().endOf("month").format("YYYY-MM-DD"));
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: selected, from, to });
      const res = await fetch(`/api/reports/download?${params}`);
      if (!res.ok) throw new Error("Failed");

      const blob = await res.blob();
      const ext  = selected === "leave-balance" || selected === "monthly-overview" ? "csv" : "pdf";
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${selected}-${from}-${to}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Download Report</DialogTitle>
        </DialogHeader>

        {/* Date range */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">From date</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">To date</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
        </div>

        {/* Report type picker */}
        <p className="text-xs font-medium text-muted-foreground mt-2">Select report type</p>
        <div className="grid grid-cols-2 gap-2">
          {REPORT_TYPES.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r.id)}
              className={cn(
                "text-left border rounded-lg p-3 transition-colors",
                selected === r.id
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                  : "border-border hover:border-muted-foreground"
              )}
            >
              <Badge className={cn(
                "mb-1 text-xs",
                r.format === "PDF"
                  ? "bg-red-100 text-red-700 hover:bg-red-100"
                  : "bg-green-100 text-green-700 hover:bg-green-100"
              )}>
                {r.format}
              </Badge>
              <p className="text-sm font-medium leading-tight">{r.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{r.desc}</p>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleDownload} disabled={loading}>
            {loading ? "Generating…" : "Download"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};