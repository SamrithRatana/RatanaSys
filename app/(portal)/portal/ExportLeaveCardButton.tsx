"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup,
  CommandInput, CommandItem,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, FileSpreadsheet, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

export type ExportableUser = { email: string; name: string | null; department: string | null };

type Props = {
  email: string;
  userName?: string;
  year?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default" | "lg";
  // Accounting & Cashier: pick any employee's card from this list
  exportUsers?: ExportableUser[];
};

async function downloadLeaveCard(email: string, userName: string | undefined, year: string) {
  const toastId = toast.loading("កំពុងបង្កើតឯកសារ Excel...");
  try {
    const res = await fetch(`/api/leave/export/${encodeURIComponent(email)}?year=${year}`);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Export failed" }));
      throw new Error(err.error ?? "Export failed");
    }

    // Trigger browser download
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `leave-card-${userName ?? email}-${year}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("បញ្ចូលទិន្នន័យបានជោគជ័យ! ✅", { id: toastId });
  } catch (err: any) {
    toast.error(err.message ?? "Export failed", { id: toastId });
  }
}

export default function ExportLeaveCardButton({
  email,
  userName,
  year,
  variant = "outline",
  size = "sm",
  exportUsers,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);
  const y = year ?? new Date().getFullYear().toString();

  async function run(targetEmail: string, targetName?: string) {
    setOpen(false);
    setLoading(true);
    try {
      await downloadLeaveCard(targetEmail, targetName, y);
    } finally {
      setLoading(false);
    }
  }

  const icon = loading
    ? <Loader2 className="h-4 w-4 animate-spin" />
    : <FileSpreadsheet className="h-4 w-4 text-green-600" />;
  const label = loading ? "កំពុងបង្កើត..." : "Export បណ្ណច្បាប់";

  if (!exportUsers?.length) {
    return (
      <Button variant={variant} size={size} onClick={() => run(email, userName)} disabled={loading} className="gap-2">
        {icon}
        {label}
      </Button>
    );
  }

  const others = exportUsers.filter((u) => u.email !== email);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={variant} size={size} disabled={loading} className="gap-2">
          {icon}
          {label}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="end">
        <Command>
          <CommandInput placeholder="ស្វែងរកបុគ្គលិក (Search employee)..." className="text-[13px]" />
          <CommandEmpty className="text-[13px] py-3 text-center">រកមិនឃើញបុគ្គលិក។</CommandEmpty>
          <CommandGroup className="max-h-72 overflow-y-auto">
            <CommandItem value={`__me ${userName ?? ""} ${email}`} onSelect={() => run(email, userName)} className="text-[13px] py-2">
              <span className="font-medium">ខ្ញុំ (My leave card)</span>
            </CommandItem>
            {others.map((u) => (
              <CommandItem
                key={u.email}
                value={`${u.name ?? ""} ${u.email} ${u.department ?? ""}`}
                onSelect={() => run(u.email, u.name ?? undefined)}
                className="text-[13px] py-2"
              >
                <span className="flex flex-col">
                  <span>{u.name ?? u.email}</span>
                  <span className="text-[11px] text-muted-foreground">{u.department ?? "—"} · {u.email}</span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
