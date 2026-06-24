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

type State = { [key: string]: number };
type Action = { type: string; value: number };
type Props  = { balance: Balances };

const EditBalances = ({ balance }: Props) => {
  const initialState: State = {
    annualCredit:       Number(balance.annualCredit       ?? 0),
    annualUsed:         Number(balance.annualUsed         ?? 0),
    annualAvailable:    Number(balance.annualAvailable    ?? 0),
    sickCredit:         Number(balance.sickCredit         ?? 0),
    sickUsed:           Number(balance.sickUsed           ?? 0),
    sickAvailable:      Number(balance.sickAvailable      ?? 0),
    personalCredit:     Number(balance.personalCredit     ?? 0),
    personalUsed:       Number(balance.personalUsed       ?? 0),
    personalAvailable:  Number(balance.personalAvailable  ?? 0),
    maternityCredit:    Number(balance.maternityCredit    ?? 0),
    maternityUsed:      Number(balance.maternityUsed      ?? 0),
    maternityAvailable: Number(balance.maternityAvailable ?? 0),
    specialCredit:      Number(balance.specialCredit      ?? 0),
    specialUsed:        Number(balance.specialUsed        ?? 0),
    specialAvailable:   Number(balance.specialAvailable   ?? 0),
    shortUsed:          Number(balance.shortUsed          ?? 0),
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
      // ✅ URL uses the real balance.id → hits /api/balance/[balanceId]/route.ts
      const url = `/api/balance/${balance.id}`;

      console.log("Submitting to:", url);
      console.log("Payload:", state);

      const res = await fetch(url, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        // Send state values + id (route also reads id from URL param now)
        body: JSON.stringify({ ...state, id: balance.id }),
      });

      console.log("Response status:", res.status);

      if (res.ok) {
        toast.success("Balance updated ✅", { duration: 4000 });
        setOpen(false);
        router.refresh();
      } else {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        console.error("API error:", err);
        toast.error(err?.error ?? "Update failed", { duration: 6000 });
      }
    } catch (error) {
      console.error("Fetch error:", error);
      toast.error("Unexpected error — check console");
    } finally {
      setLoading(false);
    }
  }

  const OnTimeBadge = () => (
    <div className="flex items-center h-9 px-3 rounded-md border border-input bg-muted text-xs font-semibold text-green-600">
      On Time
    </div>
  );

  return (
    <DialogWrapper
      title={`Edit Credits — ${balance.name}`}
      icon={IoPencil}
      isBtn={false}
      open={open}
      setOpen={() => setOpen(!open)}
    >
      <form onSubmit={submitEditedBal}>
        <div className="grid grid-cols-3 gap-2 my-3">

          {Object.keys(initialState)
            .filter((key) => key !== "shortUsed")
            .map((key) => (
              <div className="flex flex-col" key={key}>
                <Label className="text-xs">{key}</Label>
                <Input
                  type="number"
                  step="any"
                  onChange={handleInputChange(key)}
                  value={state[key]}
                />
              </div>
            ))}

          {/* SHORT Credit — read only */}
          <div className="flex flex-col">
            <Label className="text-xs">shortCredit</Label>
            <OnTimeBadge />
          </div>

          {/* SHORT Used — editable */}
          <div className="flex flex-col">
            <Label className="text-xs">shortUsed (hrs)</Label>
            <Input
              type="number"
              step="any"
              onChange={handleInputChange("shortUsed")}
              value={state["shortUsed"]}
            />
          </div>

          {/* SHORT Available — read only */}
          <div className="flex flex-col">
            <Label className="text-xs">shortAvailable</Label>
            <OnTimeBadge />
          </div>

        </div>

        <Button type="submit" disabled={loading} className="w-full mt-2">
          {loading ? "Saving…" : "Save Changes"}
        </Button>
      </form>
    </DialogWrapper>
  );
};

export default EditBalances;