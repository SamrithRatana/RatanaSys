"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

type Props = {
  email: string;
  userName?: string;
  year?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default" | "lg";
};

export default function ExportLeaveCardButton({
  email,
  userName,
  year,
  variant = "outline",
  size = "sm",
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    const toastId = toast.loading("កំពុងបង្កើតឯកសារ Excel...");

    try {
      const y = year ?? new Date().getFullYear().toString();
      const res = await fetch(
        `/api/leave/export/${encodeURIComponent(email)}?year=${y}`
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Export failed" }));
        throw new Error(err.error ?? "Export failed");
      }

      // Trigger browser download
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `leave-card-${userName ?? email}-${y}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("បញ្ចូលទិន្នន័យបានជោគជ័យ! ✅", { id: toastId });
    } catch (err: any) {
      toast.error(err.message ?? "Export failed", { id: toastId });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleExport}
      disabled={loading}
      className="gap-2"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileSpreadsheet className="h-4 w-4 text-green-600" />
      )}
      {loading ? "កំពុងបង្កើត..." : "Export បណ្ណច្បាប់"}
    </Button>
  );
}
