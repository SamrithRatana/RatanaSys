"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { PiCaretUpDownBold } from "react-icons/pi";
import { BsCheckLg } from "react-icons/bs";
import { IoCalendarOutline } from "react-icons/io5";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormDescription,
  FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { format, differenceInMinutes, differenceInDays } from "date-fns";
import {
  Command, CommandEmpty, CommandGroup,
  CommandInput, CommandItem,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { leaveTypes } from "@/lib/dummy-data";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import DialogWrapper from "@/components/Common/DialogWrapper";
import { User } from "@prisma/client";
import toast from "react-hot-toast";
import { useState, useEffect, useMemo } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const leaveKhmerLabels: Record<string, string> = {
  ANNUAL:    "ច្បាប់ប្រចាំឆ្នាំ-Annual Leave",
  SICK:      "ច្បាប់ឈឺផ្ទាល់ខ្លួន-Sick Leave",
  PERSONAL:  "ច្បាប់ផ្ទាល់ខ្លួន-Personal Leave",
  MATERNITY: "ច្បាប់មាតុភាព-Maternity Leave",
  SPECIAL:   "ច្បាប់ពិសេស-Special Leave",
};

const MATERNITY_DAYS: Record<string, number> = { MALE: 7, FEMALE: 90 };

// Work-day time options  08:00 – 17:00 in 30-min steps
const TIME_OPTIONS: string[] = [];
for (let h = 8; h <= 17; h++) {
  for (const m of [0, 30]) {
    if (h === 17 && m === 30) break;
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

const DEFAULT_START_TIME = "08:00";
const DEFAULT_END_TIME   = "17:00";
const WORK_HOURS_PER_DAY = 8; // for display only

const today = new Date();
today.setHours(0, 0, 0, 0);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function calcHoursFromTimes(startTime: string, endTime: string): number {
  const diff = timeToMinutes(endTime) - timeToMinutes(startTime);
  return Math.max(0, diff / 60);
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────
const formSchema = z
  .object({
    notes:           z.string().min(1, "Notes are required.").max(500),
    leave:           z.string({ required_error: "Please select a leave type." }),
    maternityGender: z.enum(["MALE", "FEMALE"]).optional(),
    startDate:       z.date({ required_error: "A start date is required." }),
    endDate:         z.date().optional(),
    // Personal leave unified fields
    personalMode:    z.enum(["RANGE", "TIME"]).optional(), // RANGE = multi-day, TIME = partial day
    startTime:       z.string().optional(),
    endTime:         z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const isPersonal  = data.leave === "PERSONAL";
    const isMaternity = data.leave === "MATERNITY";
    const isSpecial   = data.leave === "SPECIAL";

    // Maternity gender required
    if (isMaternity && !data.maternityGender) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please select Male (Paternity) or Female (Maternity).",
        path: ["maternityGender"],
      });
    }

    // Personal: need an end date for RANGE mode
    if (isPersonal && data.personalMode === "RANGE" && !data.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An end date is required.",
        path: ["endDate"],
      });
    }

    // Personal: time mode — validate start < end
    if (isPersonal && data.personalMode === "TIME") {
      if (!data.startTime || !data.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Start and end times are required.",
          path: ["startTime"],
        });
      } else if (timeToMinutes(data.startTime) >= timeToMinutes(data.endTime)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "End time must be after start time.",
          path: ["endTime"],
        });
      }
    }

    // Non-personal non-maternity: need end date
    if (!isPersonal && !isMaternity && !data.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An end date is required.",
        path: ["endDate"],
      });
    }

    // Special: 7-day advance notice
    if (isSpecial && data.startDate) {
      const minDate = new Date(today);
      minDate.setDate(minDate.getDate() + 7);
      if (data.startDate < minDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Special leave must be requested at least 7 days in advance.",
          path: ["startDate"],
        });
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// TimeSelect — a simple styled select for time options
// ─────────────────────────────────────────────────────────────────────────────
function TimeSelect({
  value,
  onChange,
  min,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 flex-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {TIME_OPTIONS.map((t) => {
          const disabled = min ? timeToMinutes(t) <= timeToMinutes(min) : false;
          return (
            <option key={t} value={t} disabled={disabled}>
              {t}
            </option>
          );
        })}
      </select>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
type Props = { user: User };

const RequestForm = ({ user }: Props) => {
  const [open,          setOpen]          = useState(false);
  const [openLeaveType, setOpenLeaveType] = useState(false);
  const [openStartDate, setOpenStartDate] = useState(false);
  const [openEndDate,   setOpenEndDate]   = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      startTime: DEFAULT_START_TIME,
      endTime:   DEFAULT_END_TIME,
    },
  });

  const selectedLeave   = form.watch("leave");
  const maternityGender = form.watch("maternityGender");
  const startDateValue  = form.watch("startDate");
  const endDateValue    = form.watch("endDate");
  const personalMode    = form.watch("personalMode");
  const startTime       = form.watch("startTime") ?? DEFAULT_START_TIME;
  const endTime         = form.watch("endTime")   ?? DEFAULT_END_TIME;

  const isPersonal  = selectedLeave === "PERSONAL";
  const isMaternity = selectedLeave === "MATERNITY";
  const isTimeMode  = isPersonal && personalMode === "TIME";
  const isRangeMode = isPersonal && personalMode === "RANGE";

  const currentYear = today.getFullYear();

  // ── Computed summary values ─────────────────────────────────────────────
  const calculatedHours = useMemo(() => {
    if (!isTimeMode) return 0;
    return calcHoursFromTimes(startTime, endTime);
  }, [isTimeMode, startTime, endTime]);

  const calculatedDays = useMemo(() => {
    if (isTimeMode) return 0;
    if (!startDateValue) return 0;
    const end = isRangeMode ? endDateValue : startDateValue;
    if (!end) return 0;
    return differenceInDays(end, startDateValue) + 1;
  }, [isTimeMode, isRangeMode, startDateValue, endDateValue]);

  // ── Auto-set dates for Maternity / Special ──────────────────────────────
  useEffect(() => {
    if (isMaternity && maternityGender) {
      const autoStart = new Date(today);
      const autoEnd   = new Date(today);
      autoEnd.setDate(autoEnd.getDate() + MATERNITY_DAYS[maternityGender]);
      form.setValue("startDate", autoStart, { shouldValidate: false });
      form.setValue("endDate",   autoEnd,   { shouldValidate: false });
    } else if (selectedLeave === "SPECIAL") {
      const autoStart = new Date(today);
      autoStart.setDate(autoStart.getDate() + 7);
      const autoEnd = new Date(autoStart);
      autoEnd.setDate(autoEnd.getDate() + 7);
      form.setValue("startDate", autoStart, { shouldValidate: false });
      form.setValue("endDate",   autoEnd,   { shouldValidate: false });
    }
  }, [selectedLeave, maternityGender]); // eslint-disable-line react-hooks/exhaustive-deps

  // Shift endDate when startDate changes (Maternity / Special)
  useEffect(() => {
    if (!startDateValue) return;
    if (isMaternity && maternityGender) {
      const autoEnd = new Date(startDateValue);
      autoEnd.setDate(autoEnd.getDate() + MATERNITY_DAYS[maternityGender]);
      form.setValue("endDate", autoEnd, { shouldValidate: false });
    } else if (selectedLeave === "SPECIAL") {
      const autoEnd = new Date(startDateValue);
      autoEnd.setDate(autoEnd.getDate() + 7);
      form.setValue("endDate", autoEnd, { shouldValidate: false });
    }
  }, [startDateValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const getMinStartDate = (): Date => {
    if (selectedLeave === "SPECIAL") {
      const minDate = new Date(today);
      minDate.setDate(minDate.getDate() + 7);
      return minDate;
    }
    return today;
  };

  // ── Submit ──────────────────────────────────────────────────────────────
  async function onSubmit(values: FormValues) {
    try {
      const isShort = isPersonal && values.personalMode === "TIME";
      const resolvedType = isShort ? "SHORT" : values.leave;

      const effectiveEmail =
        user.email ??
        ((user as any).telegramId ? `telegram-${(user as any).telegramId}` : null) ??
        (user.id ? `userid-${user.id}` : null) ??
        `name-${user.name?.replace(/\s+/g, "-").toLowerCase()}`;

      const formattedValues = {
        notes:           values.notes,
        leave:           resolvedType,
        type:            resolvedType,
        maternityGender: values.maternityGender,
        startDate:       format(values.startDate, "yyyy-MM-dd"),
        endDate: isShort
          ? format(values.startDate, "yyyy-MM-dd")
          : format(values.endDate!, "yyyy-MM-dd"),
        hours:     isShort ? calculatedHours : undefined,
        startTime: isShort ? values.startTime : undefined,
        endTime:   isShort ? values.endTime   : undefined,
        user: { ...user, email: effectiveEmail },
      };

      const res = await fetch("/api/leave", {
        method: "POST",
        body:   JSON.stringify(formattedValues),
      });

      if (res.ok) {
        toast.success("Leave Submitted", { duration: 4000 });
        setOpen(false);
        form.reset({
          startTime: DEFAULT_START_TIME,
          endTime:   DEFAULT_END_TIME,
        });
      } else {
        const data = await res.json();
        toast.error(`An error occurred: ${JSON.stringify(data)}`, { duration: 6000 });
      }
    } catch (error) {
      console.error("An error occurred:", error);
      toast.error("An unexpected error occurred");
    }
  }

  // ── Show-date-fields logic ──────────────────────────────────────────────
  const showDateFields =
    !!selectedLeave &&
    (!isPersonal || !!personalMode) &&
    (!isMaternity || !!maternityGender);

  return (
    <DialogWrapper
      btnTitle="ចុចដើម្បីស្នើសុំច្បាប់"
      title="Submit your Leave Application"
      descr="ត្រូវប្រាកដថាអ្នកជ្រើសរើសកាលបរិច្ឆេទត្រឹមត្រូវសម្រាប់ការសុំច្បាប់"
      isBtn={true}
      open={open}
      setOpen={() => setOpen(!open)}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

          {/* ── Leave Type ─────────────────────────────────────────────────── */}
          <FormField
            control={form.control}
            name="leave"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Leave Type (ប្រភេទច្បាប់)</FormLabel>
                <Popover modal={true} open={openLeaveType} onOpenChange={setOpenLeaveType}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn("justify-between", !field.value && "text-muted-foreground")}
                      >
                        {field.value
                          ? leaveKhmerLabels[field.value] ?? leaveTypes.find((l) => l.value === field.value)?.label
                          : "ជ្រើសរើសប្រភេទច្បាប់"}
                        <PiCaretUpDownBold className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0">
                    <Command>
                      <CommandInput placeholder="ស្វែងរកប្រភេទច្បាប់..." />
                      <CommandEmpty>រកមិនឃើញប្រភេទច្បាប់។</CommandEmpty>
                      <CommandGroup>
                        {leaveTypes.map((leave) => (
                          <CommandItem
                            value={leaveKhmerLabels[leave.value] ?? leave.label}
                            key={leave.value}
                            onSelect={() => {
                              form.setValue("leave", leave.value);
                              form.resetField("personalMode");
                              form.resetField("maternityGender");
                              form.resetField("startDate");
                              form.resetField("endDate");
                              form.setValue("startTime", DEFAULT_START_TIME);
                              form.setValue("endTime",   DEFAULT_END_TIME);
                              setOpenLeaveType(false);
                            }}
                          >
                            <BsCheckLg className={cn("mr-2 h-4 w-4", leave.value === field.value ? "opacity-100" : "opacity-0")} />
                            {leaveKhmerLabels[leave.value] ?? leave.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* ── Special leave banner ───────────────────────────────────────── */}
          {selectedLeave === "SPECIAL" && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>
                <strong>7-day advance notice required.</strong> ច្បាប់ប្រភេទនេះត្រូវតែស្នើសុំ
                យ៉ាងហោចណាស់ <strong>7 ថ្ងៃ</strong> មុនពេលចូលច្បាប់។
              </span>
            </div>
          )}

          {/* ── Maternity gender ───────────────────────────────────────────── */}
          {isMaternity && (
            <FormField
              control={form.control}
              name="maternityGender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>សូមជ្រើសរើសភេទ (Select Gender)</FormLabel>
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <button
                      type="button"
                      onClick={() => field.onChange("MALE")}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 p-4 text-sm font-medium transition-all cursor-pointer",
                        field.value === "MALE"
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-400"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                      )}
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="10" cy="14" r="5" /><line x1="19" y1="5" x2="14.14" y2="9.86" /><polyline points="15 5 19 5 19 9" />
                      </svg>
                      បុរស (Male)
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900 rounded-full px-2 py-0.5">
                        Paternity · 7 ថ្ងៃ
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => field.onChange("FEMALE")}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 p-4 text-sm font-medium transition-all cursor-pointer",
                        field.value === "FEMALE"
                          ? "border-pink-500 bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300 dark:border-pink-400"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                      )}
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="5" /><line x1="12" y1="13" x2="12" y2="21" /><line x1="9" y1="18" x2="15" y2="18" />
                      </svg>
                      ស្ត្រី (Female)
                      <span className="text-xs font-semibold text-pink-600 dark:text-pink-400 bg-pink-100 dark:bg-pink-900 rounded-full px-2 py-0.5">
                        Maternity · 90 ថ្ងៃ
                      </span>
                    </button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* ── Personal Leave: unified date/time picker ───────────────────── */}
          {isPersonal && (
            <FormField
              control={form.control}
              name="personalMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Personal Leave Mode</FormLabel>

                  {/* Mode toggle */}
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    {/* Full Day(s) */}
                    <button
                      type="button"
                      onClick={() => {
                        field.onChange("RANGE");
                        form.resetField("startDate");
                        form.resetField("endDate");
                        form.setValue("startTime", DEFAULT_START_TIME);
                        form.setValue("endTime",   DEFAULT_END_TIME);
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 p-4 text-sm font-medium transition-all cursor-pointer",
                        field.value === "RANGE"
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-400"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                      )}
                    >
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      ច្បាប់ពេញថ្ងៃ
                      <span className="text-xs font-normal opacity-60">ជ្រើសរើសថ្ងៃចាប់ផ្ដើម → បញ្ចប់</span>
                    </button>

                    {/* Partial / Time-based */}
                    <button
                      type="button"
                      onClick={() => {
                        field.onChange("TIME");
                        form.resetField("startDate");
                        form.resetField("endDate");
                        form.setValue("startTime", DEFAULT_START_TIME);
                        form.setValue("endTime",   DEFAULT_END_TIME);
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 p-4 text-sm font-medium transition-all cursor-pointer",
                        field.value === "TIME"
                          ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-400"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                      )}
                    >
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" />
                      </svg>
                      ច្បាប់រយៈពេលខ្លី
                      <span className="text-xs font-normal opacity-60">ជ្រើសម៉ោង · កាត់ច្បាប់ផ្ទាល់ខ្លួន</span>
                    </button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* ── Date fields (all leave types) ─────────────────────────────── */}
          {showDateFields && (
            <div className="space-y-4">

              {/* ── PERSONAL RANGE MODE: start + end date ── */}
              {isRangeMode && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Start date */}
                    <FormField
                      control={form.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>ថ្ងៃចាប់ផ្ដើម</FormLabel>
                          <Popover modal={true} open={openStartDate} onOpenChange={setOpenStartDate}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button variant="outline" className={cn("justify-between", !field.value && "text-muted-foreground")}>
                                  {field.value ? format(field.value, "dd MMM yyyy") : "ជ្រើសរើសថ្ងៃ"}
                                  <IoCalendarOutline className="h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={(date) => {
                                  field.onChange(date);
                                  // Reset end date if it's before new start
                                  if (endDateValue && date && endDateValue < date) {
                                    form.resetField("endDate");
                                  }
                                  setOpenStartDate(false);
                                }}
                                disabled={(date) => date < today || date.getFullYear() > currentYear}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* End date */}
                    <FormField
                      control={form.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>ថ្ងៃបញ្ចប់</FormLabel>
                          <Popover modal={true} open={openEndDate} onOpenChange={setOpenEndDate}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button variant="outline" className={cn("justify-between", !field.value && "text-muted-foreground")}>
                                  {field.value ? format(field.value, "dd MMM yyyy") : "ជ្រើសរើសថ្ងៃ"}
                                  <IoCalendarOutline className="h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={(date) => { field.onChange(date); setOpenEndDate(false); }}
                                disabled={(date) =>
                                  date < today ||
                                  (startDateValue ? date < startDateValue : false)
                                }
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Duration summary */}
                  {startDateValue && endDateValue && (
                    <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      <IoCalendarOutline className="h-4 w-4 shrink-0" />
                      <span>
                        រយៈពេល: <strong>{calculatedDays} ថ្ងៃ</strong>
                        {" · "}
                        {format(startDateValue, "dd MMM")} → {format(endDateValue, "dd MMM yyyy")}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* ── PERSONAL TIME MODE: single date + time range ── */}
              {isTimeMode && (
                <>
                  {/* Date picker */}
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>ថ្ងៃ</FormLabel>
                        <Popover modal={true} open={openStartDate} onOpenChange={setOpenStartDate}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button variant="outline" className={cn("justify-between", !field.value && "text-muted-foreground")}>
                                {field.value ? format(field.value, "EEEE, dd MMM yyyy") : "ជ្រើសរើសថ្ងៃ"}
                                <IoCalendarOutline className="h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={(date) => { field.onChange(date); setOpenStartDate(false); }}
                              disabled={(date) => date < today || date.getFullYear() > currentYear}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Time range */}
                  <div>
                    <FormLabel className="mb-1.5 block">ម៉ោងធ្វើការ (ម៉ោងចាប់ផ្ដើម → ម៉ោងបញ្ចប់)</FormLabel>
                    <div className="flex items-end gap-3">
                      <FormField
                        control={form.control}
                        name="startTime"
                        render={({ field }) => (
                          <FormItem className="flex-1 m-0">
                            <FormControl>
                              <TimeSelect
                                label="ចាប់ពី"
                                value={field.value ?? DEFAULT_START_TIME}
                                onChange={(v) => {
                                  field.onChange(v);
                                  // Push endTime forward if needed
                                  if (timeToMinutes(v) >= timeToMinutes(endTime)) {
                                    const idx = TIME_OPTIONS.indexOf(v);
                                    const next = TIME_OPTIONS[idx + 1] ?? DEFAULT_END_TIME;
                                    form.setValue("endTime", next);
                                  }
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <span className="pb-2 text-muted-foreground font-medium">→</span>

                      <FormField
                        control={form.control}
                        name="endTime"
                        render={({ field }) => (
                          <FormItem className="flex-1 m-0">
                            <FormControl>
                              <TimeSelect
                                label="ដល់"
                                value={field.value ?? DEFAULT_END_TIME}
                                onChange={field.onChange}
                                min={startTime}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Hours summary */}
                  {calculatedHours > 0 && (
                    <div className={cn(
                      "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm",
                      calculatedHours >= WORK_HOURS_PER_DAY
                        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        : "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                    )}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" />
                      </svg>
                      <span>
                        រយៈពេល: <strong>{calculatedHours} ម៉ោង</strong>
                        {" · "}
                        {startTime} → {endTime}
                        {calculatedHours >= WORK_HOURS_PER_DAY && (
                          <span className="ml-1 opacity-75">(គ្រប់ 1 ថ្ងៃការ — ពិចារណាប្រើ ច្បាប់ពេញថ្ងៃ)</span>
                        )}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* ── NON-PERSONAL LEAVES: standard start + end date ── */}
              {!isPersonal && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>ថ្ងៃចាប់ផ្ដើម</FormLabel>
                          <Popover modal={true} open={openStartDate} onOpenChange={setOpenStartDate}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button variant="outline" className={cn("justify-between", !field.value && "text-muted-foreground")}>
                                  {field.value ? format(field.value, "dd MMM yyyy") : "ជ្រើសរើសថ្ងៃ"}
                                  <IoCalendarOutline className="h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={(date) => { field.onChange(date); setOpenStartDate(false); }}
                                disabled={(date) => {
                                  const minDate = getMinStartDate();
                                  return date < today || date.getFullYear() > currentYear || date < minDate;
                                }}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {!isMaternity && (
                      <FormField
                        control={form.control}
                        name="endDate"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>ថ្ងៃបញ្ចប់</FormLabel>
                            <Popover modal={true} open={openEndDate} onOpenChange={setOpenEndDate}>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button variant="outline" className={cn("justify-between", !field.value && "text-muted-foreground")}>
                                    {field.value ? format(field.value, "dd MMM yyyy") : "ជ្រើសរើសថ្ងៃ"}
                                    <IoCalendarOutline className="h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={(date) => { field.onChange(date); setOpenEndDate(false); }}
                                  disabled={(date) =>
                                    date < today ||
                                    (startDateValue ? date < startDateValue : false)
                                  }
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  {/* Maternity auto-end info */}
                  {isMaternity && startDateValue && endDateValue && (
                    <div className="flex items-center gap-2 rounded-lg border border-pink-200 bg-pink-50 px-4 py-2.5 text-sm text-pink-700 dark:border-pink-800 dark:bg-pink-950 dark:text-pink-300">
                      <IoCalendarOutline className="h-4 w-4 shrink-0" />
                      <span>
                        ថ្ងៃបញ្ចប់ស្វ័យប្រវត្តិ:{" "}
                        <strong>{format(endDateValue, "dd MMM yyyy")}</strong>
                        {" · "}
                        {MATERNITY_DAYS[maternityGender!]} ថ្ងៃ
                      </span>
                    </div>
                  )}

                  {/* Duration summary for non-maternity */}
                  {!isMaternity && startDateValue && endDateValue && (
                    <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      <IoCalendarOutline className="h-4 w-4 shrink-0" />
                      <span>
                        រយៈពេល: <strong>{calculatedDays} ថ្ងៃ</strong>
                        {" · "}
                        {format(startDateValue, "dd MMM")} → {format(endDateValue, "dd MMM yyyy")}
                      </span>
                    </div>
                  )}
                </>
              )}

            </div>
          )}

          {/* ── Notes ─────────────────────────────────────────────────────── */}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reason (មូលហេតុ)</FormLabel>
                <FormControl>
                  <Textarea placeholder="Reason" {...field} />
                </FormControl>
                <FormDescription>Add extra notes to support your request.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full">Submit</Button>
        </form>
      </Form>
    </DialogWrapper>
  );
};

export default RequestForm;
