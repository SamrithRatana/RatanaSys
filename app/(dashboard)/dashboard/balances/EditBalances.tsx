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
type Props = { balance: Balances };

const EditBalances = ({ balance }: Props) => {
  const initialState: State = {
    annualCredit:       balance.annualCredit       ?? 0,
    annualUsed:         balance.annualUsed         ?? 0,
    annualAvailable:    balance.annualAvailable    ?? 0,
    sickCredit:         balance.sickCredit         ?? 0,
    sickUsed:           balance.sickUsed           ?? 0,
    sickAvailable:      balance.sickAvailable      ?? 0,
    personalCredit:     balance.personalCredit     ?? 0,
    personalUsed:       balance.personalUsed       ?? 0,
    personalAvailable:  balance.personalAvailable  ?? 0,
    maternityCredit:    balance.maternityCredit    ?? 0,
    maternityUsed:      balance.maternityUsed      ?? 0,
    maternityAvailable: balance.maternityAvailable ?? 0,
    specialCredit:      balance.specialCredit      ?? 0,
    specialUsed:        balance.specialUsed        ?? 0,
    specialAvailable:   balance.specialAvailable   ?? 0,
    shortUsed:          balance.shortUsed          ?? 0, // ← only real SHORT field
  };

  const reducer = (state: State, action: Action): State => ({
    ...state,
    [action.type]: action.value,
  });

  const [open, setOpen] = useState(false);
  const [state, dispatch] = useReducer(reducer, initialState);
  const router = useRouter();

  const handleInputChange =
    (type: string) => (e: FormEvent<HTMLInputElement>) => {
      dispatch({ type, value: e.currentTarget.valueAsNumber });
    };

  async function submitEditedBal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const res = await fetch("/api/balance/balanceId", {
        method: "PATCH",
        body: JSON.stringify({ ...state, id: balance.id }),
      });

      if (res.ok) {
        toast.success("Edit Successful", { duration: 4000 });
        setOpen(false);
        router.refresh();
      } else {
        const errorMessage = await res.text();
        toast.error(`An error occurred: ${errorMessage}`, { duration: 6000 });
      }
    } catch (error) {
      console.error("An error occurred:", error);
      toast.error("An unexpected error occurred");
    }
  }

  // Badge shown instead of an input for SHORT credit & available
  const OnTimeBadge = () => (
    <div className="flex items-center h-9 px-3 rounded-md border border-input bg-muted text-xs font-semibold text-green-600">
      On Time
    </div>
  );

  return (
    <DialogWrapper
      title="Edit Credits"
      icon={IoPencil}
      isBtn={false}
      open={open}
      setOpen={() => setOpen(!open)}
    >
      <form onSubmit={submitEditedBal}>
        <div className="grid grid-cols-3 gap-2 my-3">

          {/* All normal editable fields — skip shortUsed here, handle below */}
          {Object.keys(initialState)
            .filter((key) => key !== "shortUsed")
            .map((key) => (
              <div className="flex flex-col" key={key}>
                <Label className="text-xs">{key}</Label>
                <Input
                  type="number"
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

          {/* SHORT Used — editable (hours) */}
          <div className="flex flex-col">
            <Label className="text-xs">shortUsed (hrs)</Label>
            <Input
              type="number"
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
        <Button type="submit">Submit</Button>
      </form>
    </DialogWrapper>
  );
};

export default EditBalances;