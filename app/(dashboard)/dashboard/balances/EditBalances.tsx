"use client";

import DialogWrapper from "@/components/Common/DialogWrapper";
import { FormEvent, useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { IoPencil } from "react-icons/io5";
import { Button } from "@/components/ui/button";
import { Balances } from "@prisma/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type Props = { balance: Balances };

const LEAVE_TYPES = [
  { key: "annual",    label: "Annual"    },
  { key: "sick",      label: "Sick"      },
  { key: "personal",  label: "Personal"  },
  { key: "maternity", label: "Maternity" },
  { key: "special",   label: "Special"   },
] as const;

type LeaveKey = (typeof LEAVE_TYPES)[number]["key"];
type Row = { credit: number; used: number };
type FormState = Record<LeaveKey, Row>;

const EditBalances = ({ balance }: Props) => {
  const router = useRouter();
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<FormState>({
    annual:    { credit: Number(balance.annualCredit    ?? 0), used: Number(balance.annualUsed    ?? 0) },
    sick:      { credit: Number(balance.sickCredit      ?? 0), used: Number(balance.sickUsed      ?? 0) },
    personal:  { credit: Number(balance.personalCredit  ?? 0), used: Number(balance.personalUsed  ?? 0) },
    maternity: { credit: Number(balance.maternityCredit ?? 0), used: Number(balance.maternityUsed ?? 0) },
    special:   { credit: Number(balance.specialCredit   ?? 0), used: Number(balance.specialUsed   ?? 0) },
  });

  function handleChange(key: LeaveKey, field: "credit" | "used", raw: string) {
    const val = parseFloat(raw);
    setForm((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: isNaN(val) ? 0 : val },
    }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      // Send all 3 fields per type — Available = Credit - Used
      const payload: Record<string, number | string> = { id: balance.id };

      for (const t of LEAVE_TYPES) {
        const { credit, used } = form[t.key];
        const available = credit - used;
        payload[`${t.key}Credit`]    = credit;
        payload[`${t.key}Used`]      = used;
        payload[`${t.key}Available`] = available;
      }

      const res = await fetch(`/api/balance/${balance.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(`${balance.name}'s balance updated ✅`, { duration: 4000 });
        setOpen(false);
        router.refresh();
      } else {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        toast.error(err?.error ?? "Update failed", { duration: 6000 });
      }
    } catch (error) {
      console.error("Fetch error:", error);
      toast.error("Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DialogWrapper
      title={`Edit Balance — ${balance.name}`}
      icon={IoPencil}
      isBtn={false}
      open={open}
      setOpen={() => setOpen(!open)}
    >
      <form onSubmit={handleSubmit}>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          ✏️ Edit <strong>Credit</strong> and <strong>Used</strong> manually.
          <strong> Available</strong> is auto-calculated as Credit − Used.
        </p>

        {/* Column headers */}
        <div className="grid grid-cols-4 gap-2 mb-1 px-1">
          <span className="text-xs font-semibold text-muted-foreground">Type</span>
          <span className="text-xs font-semibold text-blue-600 text-center">Credit (days)</span>
          <span className="text-xs font-semibold text-orange-500 text-center">Used (days)</span>
          <span className="text-xs font-semibold text-muted-foreground text-center">Available</span>
        </div>

        <div className="space-y-2 mb-5">
          {LEAVE_TYPES.map((t) => {
            const { credit, used } = form[t.key];
            const avail = credit - used;

            return (
              <div key={t.key} className="grid grid-cols-4 gap-2 items-center">
                {/* Type label */}
                <Label className="text-sm font-medium">{t.label}</Label>

                {/* Credit — editable */}
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={credit}
                  onChange={(e) => handleChange(t.key, "credit", e.target.value)}
                  className="h-8 text-sm text-center border-blue-200 focus:border-blue-400"
                  disabled={loading}
                />

                {/* Used — manually editable */}
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={used}
                  onChange={(e) => handleChange(t.key, "used", e.target.value)}
                  className="h-8 text-sm text-center border-orange-200 focus:border-orange-400"
                  disabled={loading}
                />

                {/* Available — read only, auto-calculated */}
                <div
                  className={`h-8 flex items-center justify-center rounded-md border text-sm font-semibold
                    ${avail < 0
                      ? "bg-red-50 border-red-200 text-red-600"
                      : "bg-green-50 border-green-200 text-green-700"
                    }`}
                >
                  {avail % 1 === 0 ? avail : avail.toFixed(1)}d
                </div>
              </div>
            );
          })}
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Saving…" : "Save Changes"}
        </Button>
      </form>
    </DialogWrapper>
  );
};

export default EditBalances;