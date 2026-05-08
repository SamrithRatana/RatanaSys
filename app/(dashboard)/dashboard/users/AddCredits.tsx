"use client";

import { FaPlus } from "react-icons/fa6";
import CreditField from "./CreditField";
import { FormEvent, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import Image from "next/image";

const creditTypes = [
  "annual",
  "sick",
  "personal",
  "maternity",
  "special",
] as const;

const NSSF_DEFAULTS = {
  ANNUAL:    18,
  SICK:      7,
  PERSONAL:  7,
  MATERNITY: 90,
  SPECIAL:   7,
};

const initialCreditValues: { [key: string]: number } = {
  ANNUAL:    0,
  SICK:      0,
  PERSONAL:  0,
  MATERNITY: 0,
  SPECIAL:   0,
};

type Props = {
  email?:      string | null;
  name:        string;
  userId:      string;
  telegramId?: string | null;
};

const AddCredits = ({ email, name, userId, telegramId }: Props) => {
  const [creditValues, setCreditValues] = useState(initialCreditValues);
  const [open, setOpen] = useState(false);
  const [nssfOpen, setNssfOpen] = useState(false);
  const [nssfChecked, setNssfChecked] = useState(false);
  const router = useRouter();

  const handleCreditChange = (type: string, value: number) => {
    setCreditValues((prev) => ({ ...prev, [type.toUpperCase()]: value }));
  };

  function handleOpenClick() {
    setNssfChecked(false);
    setCreditValues({ ...initialCreditValues });
    setOpen(true);
  }

  function handleNssfOpen(e: React.MouseEvent) {
    e.stopPropagation();
    setNssfOpen(true);
  }

  function handleNssfAccept() {
    setCreditValues({ ...NSSF_DEFAULTS });
    setNssfChecked(true);
    setNssfOpen(false);
  }

  function handleNssfCancel() {
    setNssfOpen(false);
  }

  async function SubmitCredits(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const year = new Date().getFullYear().toString();
      const res = await fetch("/api/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...creditValues,
          year,
          email,
          name,
          userId,
          telegramId,
        }),
      });

      if (res.ok) {
        toast.success("Credits Submitted", { duration: 4000 });
        setOpen(false);
        router.refresh();
      } else {
        const errorData = await res.json();
        toast.error(`An error occurred: ${errorData.error}`, { duration: 6000 });
      }
    } catch (error) {
      console.error("An error occurred:", error);
      toast.error("An unexpected error occurred");
    }
  }

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleOpenClick();
        }}
        className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-gray-100 transition-colors text-blue-600 hover:text-blue-800"
      >
        <FaPlus />
      </button>

      {/* Portal — renders outside table DOM to avoid z-index issues */}
      {typeof window !== "undefined" && createPortal(
        <>
          {/* NSSF Legal Popup */}
          {nssfOpen && (
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b">
                  <div className="flex items-center gap-2 mb-1">
                    <Image
                      src="/Nssf.jpg"
                      alt="NSSF Logo"
                      width={80}
                      height={80}
                      className="object-contain rounded"
                    />
                    <span className="text-lg font-bold text-[#0EA5E9]">NSSF Cambodia</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      Leave Legal
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 text-left">Legal Agreement Statement</p>
                </div>

                {/* Scrollable content */}
                <div className="overflow-y-auto px-6 py-4 flex-1 text-sm text-gray-700 dark:text-gray-300 space-y-4">
                  <p className="text-gray-500 text-left">
                    &ldquo;This agreement governs the administration of leave entitlements within the LMS,
                    ensuring full compliance with the Labor Law of Cambodia and NSSF regulations. All users
                    acknowledge that specific leave categories, including but not limited to Maternity Leave
                    and Occupational Risk benefits, are subject to the eligibility criteria and reimbursement
                    protocols established by NSSF Cambodia.&rdquo;
                  </p>

                  {/* 1. Annual Leave */}
                  <div>
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1 text-left">
                      1. Annual Leave{" "}
                      <span className="text-[#0EA5E9] font-bold ml-2">&rarr; 18 days</span>
                    </h3>
                    <ul className="list-disc list-inside space-y-1 text-xs text-gray-600 dark:text-gray-400 text-left">
                      <li><span className="font-medium">Accrual Rate:</span> 1.5 days per month, totaling 18 days per year.</li>
                      <li><span className="font-medium">Seniority Bonus:</span> +1 day every 3 years of continuous service.</li>
                      <li><span className="font-medium">Restrictions:</span> Cannot be converted to cash during active employment.</li>
                    </ul>
                  </div>

                  {/* 2. Sick Leave */}
                  <div>
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1 text-left">
                      2. Sick Leave{" "}
                      <span className="text-[#0EA5E9] font-bold ml-2">&rarr; 7 days</span>
                    </h3>
                    <ul className="list-disc list-inside space-y-1 text-xs text-gray-600 dark:text-gray-400 text-left">
                      <li><span className="font-medium">Requirement:</span> Valid medical certificate required.</li>
                      <li><span className="font-medium">1st month:</span> 100% of salary.</li>
                      <li><span className="font-medium">2nd – 3rd month:</span> 60% of salary.</li>
                      <li><span className="font-medium">4th month onwards:</span> Unpaid leave.</li>
                    </ul>
                  </div>

                  {/* 3. Maternity Leave */}
                  <div>
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1 text-left">
                      3. Maternity Leave{" "}
                      <span className="text-[#0EA5E9] font-bold ml-2">&rarr; 90 days</span>
                    </h3>
                    <ul className="list-disc list-inside space-y-1 text-xs text-gray-600 dark:text-gray-400 text-left">
                      <li><span className="font-medium">Duration:</span> 90 calendar days.</li>
                      <li><span className="font-medium">Employer Payment:</span> 50% wages with 1+ year of service.</li>
                      <li><span className="font-medium">NSSF Payment:</span> 70% daily allowance for insured workers.</li>
                    </ul>
                  </div>

                  {/* 4. Special Leave */}
                  <div>
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1 text-left">
                      4. Special / Personal Leave{" "}
                      <span className="text-[#0EA5E9] font-bold ml-2">&rarr; 7 days</span>
                    </h3>
                    <ul className="list-disc list-inside space-y-1 text-xs text-gray-600 dark:text-gray-400 text-left">
                      <li><span className="font-medium">Duration:</span> Up to 7 days per year.</li>
                      <li><span className="font-medium">Eligible Events:</span> Marriage, birth of child, death of immediate family member.</li>
                    </ul>
                  </div>

                  {/* Auto-fill summary */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-green-700 mb-2 text-left">
                      Clicking Accept will auto-fill:
                    </p>
                    <div className="grid grid-cols-5 gap-2 text-center">
                      {Object.entries(NSSF_DEFAULTS).map(([key, val]) => (
                        <div key={key} className="bg-white rounded-md border border-green-200 py-2">
                          <p className="text-xs text-gray-500">{key}</p>
                          <p className="text-sm font-bold text-green-600">{val}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleNssfCancel(); }}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleNssfAccept(); }}
                    className="px-6 py-2 text-sm rounded-lg bg-[#0EA5E9] text-white font-semibold hover:bg-[#0284C7] transition-colors"
                  >
                    Accept
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Add Credits Dialog */}
          {open && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
              onClick={() => { setOpen(false); setNssfChecked(false); }}
            >
              <div
                className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-left">Add Credits</h2>
                    <p className="text-sm text-gray-500 text-left">
                      Adding credits for: <span className="font-medium text-gray-700 dark:text-gray-300">{name}</span>
                    </p>
                    <p className="text-xs text-gray-400 text-left mt-0.5">
                      {email
                        ? `📧 ${email}`
                        : telegramId
                        ? `📱 Telegram ID: ${telegramId}`
                        : `🆔 ${userId}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); setNssfChecked(false); }}
                    className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none mt-1"
                  >
                    ×
                  </button>
                </div>

                {/* Body */}
                <div className="px-6 py-4">
                  <form onSubmit={SubmitCredits}>
                    {/* NSSF Radio toggle */}
                    <div
                      className="flex items-center gap-3 mb-4 p-3 rounded-lg border border-[#BAE6FD] bg-[#F0F9FF] cursor-pointer hover:bg-[#E0F2FE] transition-colors"
                      onClick={handleNssfOpen}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${nssfChecked ? "border-[#0EA5E9] bg-[#0EA5E9]" : "border-gray-400"}`}>
                        {nssfChecked && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#0284C7]">NSSF Cambodia Leave Legal</p>
                        <p className="text-xs text-gray-500">
                          Click to view legal agreement and auto-fill standard values
                        </p>
                      </div>
                    </div>

                    {/* Credit fields */}
                    {creditTypes.map((type) => (
                      <div key={type} className="my-3 text-left">
                        <CreditField
                          key={`${type}-${creditValues[type.toUpperCase()]}`}
                          name={`${type}Credit`}
                          label={`${type.charAt(0).toUpperCase() + type.slice(1)} Credit`}
                          onChange={(value) => handleCreditChange(type, value)}
                          value={creditValues[type.toUpperCase()]}
                        />
                      </div>
                    ))}

                    <Button type="submit" className="w-full mt-2">Submit</Button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </>,
        document.body
      )}
    </>
  );
};

export default AddCredits;