"use client";

import DialogWrapper from "@/components/Common/DialogWrapper";
import { FormEvent, useReducer, useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { IoPencil } from "react-icons/io5";
import { Button } from "@/components/ui/button";
import { Balances } from "@prisma/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type State  = { [key: string]: number };
type Action = { type: string; value: number };
type Props  = { balance: Balances };

// Only Credit fields are editable.
// Used & Available are always recomputed from approved leaves in getBalanceData.ts
// so editing them manually has zero visible effect.
const CREDIT_FIELDS = [
  { key: "annualCredit",    label: "Annual Credit (days)"    },
  { key: "sickCredit",      label: "Sick Credit (days)"      },
  { key: "personalCredit",  label: "Personal Credit (days)"  },
  { key: "maternityCredit", label: "Maternity Credit (days)" },
  { key: "specialCredit",   label: "Special Credit (days)"   },
] as const;

type CreditKey = (typeof CREDIT_FIELDS)[number]["key"];

const EditBalances = ({ balance }: Props) => {
  const initialState: State = {
    annualCredit:    Number(balance.annualCredit    ?? 0),
    sickCredit:      Number(balance.sickCredit      ?? 0),
    personalCredit:  Number(balance.personalCredit  ?? 0),
    maternityCredit: Number(balance.maternityCredit ?? 0),
    specialCredit:   Number(balance.specialCredit   ?? 0),
  };

  const reducer = (state: State, action: Action): State => ({
    ...state,
    [action.type]: action.value,
  });

  const [open,    setOpen]    = useState(false);
  const [state,   dispatch]   = useReducer(reducer, initialState);
  const [loading, setLoading] = useState(false);
  const router                = useRouter();

  const handleInputChange =
    (type: string) => (e: FormEvent<HTMLInputElement>) => {
      const val = e.currentTarget.valueAsNumber;
      dispatch({ type, value: isNaN(val) ? 0 : val });
    };

  async function submitEditedBal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      // Build payload: Credit fields + recalculated Available
      const payload: Record<string, number | string> = { id: balance.id };

      for (const f of CREDIT_FIELDS) {
        const newCredit = state[f.key];
        const usedKey   = f.key.replace("Credit", "Used")      as keyof Balances;
        const availKey  = f.key.replace("Credit", "Available");
        const usedVal   = Number(balance[usedKey] ?? 0);

        payload[f.key]   = newCredit;
        payload[availKey] = newCredit - usedVal;
      }

      // ✅ Correct URL — hits /api/balance/[balanceId]/route.ts
      const res = await fetch(`/api/balance/${balance.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success("Credits updated ✅", { duration: 4000 });
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
      <form onSubmit={submitEditedBal}>
        <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          ⚠️ Only <strong>Credit</strong> values are editable. Used &amp; Available are auto-computed from approved leaves.
        </p>

        <div className="space-y-3 mb-4">
          {CREDIT_FIELDS.map((f) => {
            const usedKey   = f.key.replace("Credit", "Used") as keyof Balances;
            const usedDays  = Number(balance[usedKey] ?? 0);
            const availDays = state[f.key] - usedDays;

            return (
              <div key={f.key} className="grid grid-cols-3 gap-2 items-center">
                <Label className="text-xs">{f.label}</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={state[f.key]}
                  onChange={handleInputChange(f.key)}
                  className="h-8 text-sm"
                  disabled={loading}
                />
                <span className="text-xs text-muted-foreground">
                  used {usedDays}d · avail{" "}
                  <span className={availDays < 0 ? "text-red-500 font-semibold" : "text-green-600"}>
                    {availDays}d
                  </span>
                </span>
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