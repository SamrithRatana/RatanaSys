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

const EditBalances = ({ balance }: Props) => {
  const router = useRouter();

  // Only Credit is editable — Used/Available are always recomputed from
  // approved leave records in getBalanceData.ts, so editing them has no effect.
  const [credits, setCredits] = useState<Record<LeaveKey, number>>({
    annual:    Number(balance.annualCredit    ?? 0),
    sick:      Number(balance.sickCredit      ?? 0),
    personal:  Number(balance.personalCredit  ?? 0),
    maternity: Number(balance.maternityCredit ?? 0),
    special:   Number(balance.specialCredit   ?? 0),
  });

  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);

  function handleChange(key: LeaveKey, raw: string) {
    const val = parseFloat(raw);
    setCredits((prev) => ({ ...prev, [key]: isNaN(val) ? 0 : val }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      // Only send Credit fields — Used stays as DB audit trail,
      // Available on display is always derived from approved leaves anyway.
      const payload: Record<string, number | string> = {
        id:              balance.id,
        annualCredit:    credits.annual,
        sickCredit:      credits.sick,
        personalCredit:  credits.personal,
        maternityCredit: credits.maternity,
        specialCredit:   credits.special,
      };

      const res = await fetch(`/api/balance/${balance.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(`${balance.name}'s credits updated ✅`, { duration: 4000 });
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
      title={`Edit Credits — ${balance.name}`}
      icon={IoPencil}
      isBtn={false}
      open={open}
      setOpen={() => setOpen(!open)}
    >
      <form onSubmit={handleSubmit}>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          ⚠️ Only <strong>Credit</strong> is editable. Used &amp; Available are always
          auto-calculated from approved leave records.
        </p>

        {/* Column headers */}
        <div className="grid grid-cols-3 gap-3 mb-1 px-1">
          <span className="text-xs font-semibold text-muted-foreground">Type</span>
          <span className="text-xs font-semibold text-muted-foreground text-center">Credit (days)</span>
          <span className="text-xs font-semibold text-muted-foreground text-center">Used · Avail (live)</span>
        </div>

        <div className="space-y-2 mb-5">
          {LEAVE_TYPES.map((t) => {
            const usedKey  = `${t.key}Used`  as keyof Balances;
            const usedDays = Number(balance[usedKey] ?? 0);
            const avail    = credits[t.key] - usedDays;

            return (
              <div key={t.key} className="grid grid-cols-3 gap-3 items-center">
                <Label className="text-sm font-medium">{t.label}</Label>

                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={credits[t.key]}
                  onChange={(e) => handleChange(t.key, e.target.value)}
                  className="h-8 text-sm text-center"
                  disabled={loading}
                />

                <div className="text-xs text-center text-muted-foreground">
                  {usedDays}d used ·{" "}
                  <span className={avail < 0 ? "text-red-500 font-semibold" : "text-green-600 font-semibold"}>
                    {avail % 1 === 0 ? avail : avail.toFixed(1)}d
                  </span>
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