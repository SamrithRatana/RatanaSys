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
import { format, differenceInDays } from "date-fns";
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
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import DialogWrapper from "@/components/Common/DialogWrapper";
import { User } from "@prisma/client";
import toast from "react-hot-toast";
import { useState, useEffect } from "react";

const khmerFont: React.CSSProperties = {
  fontFamily: "'Battambang', serif",
};

const leaveKhmerLabels: Record<string, string> = {
  ANNUAL:    "ច្បាប់ប្រចាំឆ្នាំ-Annual Leave",
  SICK:      "ច្បាប់ឈឺផ្ទាល់ខ្លួន-Sick Leave",
  PERSONAL:  "ច្បាប់ផ្ទាល់ខ្លួន-Personal Leave",
  MATERNITY: "ច្បាប់មាតុភាព-Maternity Leave",
  SPECIAL:   "ច្បាប់ពិសេស-Special Leave",
};

const MATERNITY_DAYS: Record<string, number> = {
  MALE:   7,
  FEMALE: 90,
};

type Props = { user: User };

const today = new Date();
today.setHours(0, 0, 0, 0);

// ── Time helpers ──────────────────────────────────────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** Returns current local time as "HH:MM" */
function getCurrentTime(): string {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, "0");
  const m = now.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function calcPersonalHours(startTime: string, endTime: string): number {
  const startMin = timeToMinutes(startTime);
  const endMin   = timeToMinutes(endTime);
  return Math.max(0, (endMin - startMin) / 60);
}

function formatDuration(totalMinutes: number): string {
  const hPart = Math.floor(totalMinutes / 60);
  const mPart = totalMinutes % 60;
  if (hPart === 0) return `${mPart} នាទី`;
  if (mPart === 0) return `${hPart} ម៉ោង`;
  return `${hPart} ម៉ោង ${mPart} នាទី`;
}

function blockFloatKeys(e: React.KeyboardEvent<HTMLInputElement>) {
  if ([".", ",", "-", "e", "E", "+"].includes(e.key)) {
    e.preventDefault();
  }
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const formSchema = z
  .object({
    notes:             z.string().min(1, "Notes are required.").max(500),
    leave:             z.string({ required_error: "Please select a leave type." }),
    maternityGender:   z.enum(["MALE", "FEMALE"]).optional(),
    startDate:         z.date({ required_error: "A start date is required." }),
    endDate:           z.date().optional(),
    personalStartTime: z.string().optional(),
    personalEndTime:   z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.leave === "MATERNITY" && !data.maternityGender) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please select Male (Paternity) or Female (Maternity).",
        path: ["maternityGender"],
      });
    }

    const isHourly = data.leave === "PERSONAL" || data.leave === "SICK";

    if (!isHourly && !data.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An end date is required.",
        path: ["endDate"],
      });
    }

    if (isHourly && data.startDate && data.endDate) {
      const same = differenceInDays(data.endDate, data.startDate) === 0;
      if (same && data.personalStartTime && data.personalEndTime) {
        const hrs = calcPersonalHours(data.personalStartTime, data.personalEndTime);
        if (hrs <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "End time must be after start time.",
            path: ["personalEndTime"],
          });
        }
      }
    }

    if (data.leave === "SPECIAL" && data.startDate) {
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

// ── Component ─────────────────────────────────────────────────────────────────

const RequestForm = ({ user }: Props) => {
  const [open,          setOpen]          = useState(false);
  const [openLeaveType, setOpenLeaveType] = useState(false);
  const [openStartDate, setOpenStartDate] = useState(false);
  const [openEndDate,   setOpenEndDate]   = useState(false);

  const [shortcutH, setShortcutH] = useState<number>(0);
  const [shortcutM, setShortcutM] = useState<number>(0);

  // ── Default start = current time, end = current time (user inputs duration) ─
  const initTime = getCurrentTime();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      personalStartTime: initTime,
      personalEndTime:   initTime,
    },
  });

  const selectedLeave     = form.watch("leave");
  const maternityGender   = form.watch("maternityGender");
  const startDateValue    = form.watch("startDate");
  const endDateValue      = form.watch("endDate");
  const personalStartTime = form.watch("personalStartTime") ?? initTime;
  const personalEndTime   = form.watch("personalEndTime")   ?? initTime;

  const isPersonal  = selectedLeave === "PERSONAL";
  const isSick      = selectedLeave === "SICK";
  const isMaternity = selectedLeave === "MATERNITY";
  const isHourly    = isPersonal || isSick;

  // same-day only applies to hourly leave types
  const isSameDay =
    isHourly &&
    !!startDateValue &&
    !!endDateValue &&
    differenceInDays(endDateValue, startDateValue) === 0;

  const leaveHours = isSameDay
    ? calcPersonalHours(personalStartTime, personalEndTime)
    : null;

  // ── Universal duration calculation ────────────────────────────────────────
  const totalDays: number | null = (() => {
    if (!startDateValue || !endDateValue) return null;
    if (isSameDay && leaveHours !== null && leaveHours > 0 && leaveHours < 8) return null;
    return differenceInDays(endDateValue, startDateValue) + 1;
  })();

  // ── Summary text for the banner ───────────────────────────────────────────
  const leaveSummary = (() => {
    if (!startDateValue || !endDateValue) return null;

    if (isSameDay) {
      const totalMin = Math.round((leaveHours ?? 0) * 60);

      // No duration input → full day
      if (!leaveHours || leaveHours <= 0) {
        return `1 ថ្ងៃ (${format(startDateValue, "dd MMM yyyy")})`;
      }
      if (leaveHours >= 8) {
        return `1 ថ្ងៃ (${personalStartTime} – ${personalEndTime})`;
      }
      return `${formatDuration(totalMin)} (${personalStartTime} – ${personalEndTime})`;
    }

    const days = differenceInDays(endDateValue, startDateValue) + 1;
    const startFmt = format(startDateValue, "dd MMM");
    const endFmt   = format(endDateValue,   "dd MMM yyyy");

    if (days === 1) {
      return `1 ថ្ងៃ (${format(startDateValue, "dd MMM yyyy")})`;
    }
    return `${days} ថ្ងៃ (${startFmt} – ${endFmt})`;
  })();

  const currentYear = today.getFullYear();

  const resetShortcuts = () => {
    setShortcutH(0);
    setShortcutM(0);
  };

  // ── Reset time fields to current time ────────────────────────────────────
  const resetTimesToNow = () => {
    const now = getCurrentTime();
    form.setValue("personalStartTime", now, { shouldValidate: false });
    form.setValue("personalEndTime",   now, { shouldValidate: false });
    resetShortcuts();
  };

  useEffect(() => {
    if (selectedLeave === "MATERNITY" && maternityGender) {
      const autoStart = new Date(today);
      const days      = MATERNITY_DAYS[maternityGender];
      const autoEnd   = new Date(autoStart);
      autoEnd.setDate(autoEnd.getDate() + days - 1); // -1 so total = exact days (start inclusive)
      form.setValue("startDate", autoStart, { shouldValidate: false });
      form.setValue("endDate",   autoEnd,   { shouldValidate: false });
    } else if (selectedLeave === "SPECIAL") {
      const autoStart = new Date(today);
      autoStart.setDate(autoStart.getDate() + 7);
      const autoEnd = new Date(autoStart);
      autoEnd.setDate(autoEnd.getDate() + 6); // +6 so total = 7 days (start inclusive)
      form.setValue("startDate", autoStart, { shouldValidate: false });
      form.setValue("endDate",   autoEnd,   { shouldValidate: false });
    }
  }, [selectedLeave, maternityGender]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!startDateValue) return;
    if (selectedLeave === "MATERNITY" && maternityGender) {
      const days    = MATERNITY_DAYS[maternityGender];
      const autoEnd = new Date(startDateValue);
      autoEnd.setDate(autoEnd.getDate() + days - 1); // -1 so total = exact days (start inclusive)
      form.setValue("endDate", autoEnd, { shouldValidate: false });
    } else if (selectedLeave === "SPECIAL") {
      const autoEnd = new Date(startDateValue);
      autoEnd.setDate(autoEnd.getDate() + 6); // +6 so total = 7 days (start inclusive)
      form.setValue("endDate", autoEnd, { shouldValidate: false });
    }
  }, [startDateValue]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── For hourly leaves: auto-set today as both start and end date ──────────
  // so TimePicker shows immediately without requiring date selection
  useEffect(() => {
    if (isHourly && !startDateValue) {
      const todayDate = new Date(today);
      form.setValue("startDate", todayDate, { shouldValidate: false });
      form.setValue("endDate",   todayDate, { shouldValidate: false });
      resetTimesToNow();
    }
  }, [selectedLeave]); // eslint-disable-line react-hooks/exhaustive-deps

  const getMinStartDate = (): Date => {
    if (selectedLeave === "SPECIAL") {
      const minDate = new Date(today);
      minDate.setDate(minDate.getDate() + 7);
      return minDate;
    }
    return today;
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const isPersonalLeave = values.leave === "PERSONAL";
      const isSickLeave     = values.leave === "SICK";
      const isHourlyLeave   = isPersonalLeave || isSickLeave;

      const sameDay = isHourlyLeave && values.endDate
        ? differenceInDays(values.endDate, values.startDate) === 0
        : false;

      // Raw hours from time picker (start → end diff)
      const rawHours = sameDay
        ? calcPersonalHours(
            values.personalStartTime ?? initTime,
            values.personalEndTime   ?? initTime,
          )
        : 0;

      // ── Core logic ────────────────────────────────────────────────────────
      // • No input (rawHours === 0, start === end time) → 1 day, hours = 0
      // • Partial hours (0 < rawHours < 8)              → days = 0, hours = rawHours
      // • Full day (rawHours >= 8)                      → days = 1, hours = rawHours
      // • Multi-day hourly                              → days = diff+1, hours = 0
      let submitDays:  number;
      let submitHours: number;

      if (isHourlyLeave) {
        if (sameDay) {
          if (rawHours <= 0) {
            // No duration input → full day, no hours stored
            submitDays  = 1;
            submitHours = 0;
          } else if (rawHours >= 8) {
            // >= 8 hours = 1 full day, no hours stored
            submitDays  = 1;
            submitHours = 0;
          } else {
            // Partial day → store hours only
            submitDays  = 0;
            submitHours = +rawHours.toFixed(4);
          }
        } else {
          // Multi-day hourly (different start/end date)
          submitDays  = differenceInDays(values.endDate!, values.startDate) + 1;
          submitHours = 0;
        }
      } else {
        submitDays  = differenceInDays(values.endDate!, values.startDate) + 1;
        submitHours = 0;
      }

      const effectiveEmail =
        user.email ??
        ((user as any).telegramId ? `telegram-${(user as any).telegramId}` : null) ??
        (user.id ? `userid-${user.id}` : null) ??
        `name-${user.name?.replace(/\s+/g, "-").toLowerCase()}`;

      const formattedValues = {
        notes:           values.notes,
        leave:           values.leave,
        type:            values.leave,
        maternityGender: values.maternityGender,
        startDate:       format(values.startDate, "yyyy-MM-dd"),
        endDate:         values.endDate
          ? format(values.endDate, "yyyy-MM-dd")
          : format(values.startDate, "yyyy-MM-dd"),
        hours: submitHours > 0 ? submitHours : undefined,
        days:  submitDays,
        user: { ...user, email: effectiveEmail },
      };

      const res = await fetch("/api/leave", {
        method: "POST",
        body:   JSON.stringify(formattedValues),
      });

      if (res.ok) {
        toast.success("Leave Submitted", { duration: 4000 });
        setOpen(false);
        const nowTime = getCurrentTime();
        form.reset({
          personalStartTime: nowTime,
          personalEndTime:   nowTime,
        });
        resetShortcuts();
      } else {
        const data = await res.json();
        toast.error(`An error occurred: ${JSON.stringify(data)}`, { duration: 6000 });
      }
    } catch (error) {
      console.error("An error occurred:", error);
      toast.error("An unexpected error occurred");
    }
  }

  // ── Shared time-picker (PERSONAL + SICK same-day) ─────────────────────────
  const TimePicker = () => (
    <FormItem>
      <div className="flex items-center gap-2 flex-wrap">
        <FormLabel style={khmerFont}>ម៉ោង (Time)</FormLabel>
        <span style={khmerFont} className="text-[14px] text-red-500">
          * បើឈប់ចាប់ពី 1 ថ្ងៃ មិនចាំបាច់បំពេញម៉ោងនេះទេ
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <FormField
          control={form.control}
          name="personalStartTime"
          render={({ field }) => (
            <FormControl>
              <Input
                type="time"
                min="06:00"
                max="16:59"
                className="w-32"
                {...field}
                onChange={(e) => {
                  field.onChange(e);
                  const newStart = e.target.value;
                  const curEnd   = form.getValues("personalEndTime") ?? initTime;
                  if (timeToMinutes(curEnd) <= timeToMinutes(newStart)) {
                    const pushed = Math.min(timeToMinutes(newStart) + 60, 17 * 60);
                    form.setValue("personalEndTime", minutesToTime(pushed));
                  }
                  resetShortcuts();
                }}
              />
            </FormControl>
          )}
        />

        <span className="text-muted-foreground text-sm">→</span>

        <FormField
          control={form.control}
          name="personalEndTime"
          render={({ field }) => (
            <FormControl>
              <Input
                type="time"
                min="06:01"
                max="17:00"
                className="w-32"
                {...field}
              />
            </FormControl>
          )}
        />
      </div>

      {/* ── Duration shortcut inputs ── */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <Input
          type="number"
          min={0}
          max={9}
          step={1}
          placeholder="h"
          className="w-14 text-center"
          value={shortcutH}
          onKeyDown={blockFloatKeys}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const h = Math.max(0, parseInt(e.target.value) || 0);
            setShortcutH(h);
            // Base off current personalStartTime (which is current clock time)
            const startMin = timeToMinutes(form.getValues("personalStartTime") ?? getCurrentTime());
            const endMin   = Math.min(startMin + h * 60 + shortcutM, 17 * 60);
            form.setValue("personalEndTime", minutesToTime(endMin), { shouldValidate: true });
          }}
        />
        <span style={khmerFont} className="text-[13px] text-muted-foreground">ម៉ោង</span>

        <Input
          type="number"
          min={0}
          max={59}
          step={5}
          placeholder="m"
          className="w-14 text-center"
          value={shortcutM}
          onKeyDown={blockFloatKeys}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const m = Math.max(0, parseInt(e.target.value) || 0);
            setShortcutM(m);
            // Base off current personalStartTime (which is current clock time)
            const startMin = timeToMinutes(form.getValues("personalStartTime") ?? getCurrentTime());
            const endMin   = Math.min(startMin + shortcutH * 60 + m, 17 * 60);
            form.setValue("personalEndTime", minutesToTime(endMin), { shouldValidate: true });
          }}
        />
        <span style={khmerFont} className="text-[13px] text-muted-foreground">នាទី</span>
      </div>

      <FormDescription style={khmerFont} className="mt-1 text-[12px]">
        វាយម៉ោង និងនាទី ដើម្បីគណនាម៉ោងបញ្ចប់ស្វ័យប្រវត្តិ
      </FormDescription>
      <FormMessage />
    </FormItem>
  );

  // ── Universal summary banner (all leave types) ────────────────────────────
  const SummaryBanner = () => {
    if (!leaveSummary) return null;

    const isSickBanner    = isSick;
    const isPartialHourly = isSameDay && leaveHours !== null && leaveHours > 0 && leaveHours < 8;
    const leaveLabel      = isSick ? "ច្បាប់ឈឺ" : "ច្បាប់ផ្ទាល់ខ្លួន";

    return (
      <div className={cn(
        "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm",
        isSickBanner
          ? "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
          : "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
      )}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8"  x2="12.01" y2="8"/>
        </svg>
        <span style={khmerFont} className="text-[13px]">
          រយៈពេល: <strong>{leaveSummary}</strong>
          {isPartialHourly && leaveHours !== null && (() => {
            const totalMin = Math.round(leaveHours * 60);
            return (
              <> · កាត់ <strong>{formatDuration(totalMin)}</strong> ពី{leaveLabel}</>
            );
          })()}
        </span>
      </div>
    );
  };

  return (
    <DialogWrapper
      btnTitle="ចុចដើម្បីស្នើសុំច្បាប់"
      btnStyle={khmerFont}
      title="Submit your Leave Application"
      descr="ត្រូវប្រាកដថាអ្នកជ្រើសរើសកាលបរិច្ឆេទត្រឹមត្រូវសម្រាប់ការសុំច្បាប់"
      descrStyle={khmerFont}
      isBtn={true}
      open={open}
      setOpen={() => setOpen(!open)}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

          {/* ── Leave Type ── */}
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
                        style={khmerFont}
                        className={cn("justify-between text-[13px]", !field.value && "text-muted-foreground")}
                      >
                        {field.value
                          ? leaveKhmerLabels[field.value] ?? leaveTypes.find((l) => l.value === field.value)?.label
                          : "ជ្រើសរើសប្រភេទច្បាប់"}
                        <PiCaretUpDownBold className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-[260px] p-0">
                    <Command>
                      <CommandInput placeholder="ស្វែងរកប្រភេទច្បាប់..." style={khmerFont} className="text-[13px]" />
                      <CommandEmpty style={khmerFont} className="text-[13px] py-3 text-center">រកមិនឃើញប្រភេទច្បាប់។</CommandEmpty>
                      <CommandGroup>
                        {leaveTypes.map((leave) => (
                          <CommandItem
                            value={leaveKhmerLabels[leave.value] ?? leave.label}
                            key={leave.value}
                            style={khmerFont}
                            className="text-[13px] py-2.5"
                            onSelect={() => {
                              form.setValue("leave", leave.value);
                              form.resetField("maternityGender");
                              form.resetField("startDate");
                              form.resetField("endDate");
                              // Reset times to current time when changing leave type
                              const nowTime = getCurrentTime();
                              form.setValue("personalStartTime", nowTime);
                              form.setValue("personalEndTime",   nowTime);
                              resetShortcuts();
                              setOpenLeaveType(false);
                            }}
                          >
                            <BsCheckLg className={cn("mr-2 h-4 w-4 shrink-0", leave.value === field.value ? "opacity-100" : "opacity-0")} />
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

          {/* ── Special leave 7-day banner ── */}
          {selectedLeave === "SPECIAL" && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span style={khmerFont} className="text-[13px]">
                <strong>7-day advance notice required.</strong> ច្បាប់ប្រភេទនេះត្រូវតែស្នើសុំ
                យ៉ាងហោចណាស់ <strong>7 ថ្ងៃ</strong> មុនពេលចូលច្បាប់។
              </span>
            </div>
          )}

          {/* ── Maternity Gender Selector ── */}
          {isMaternity && (
            <FormField
              control={form.control}
              name="maternityGender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel style={khmerFont}>សូមជ្រើសរើសភេទ (Select Gender)</FormLabel>
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
                        <circle cx="10" cy="14" r="5" />
                        <line x1="19" y1="5" x2="14.14" y2="9.86" />
                        <polyline points="15 5 19 5 19 9" />
                      </svg>
                      <span style={khmerFont} className="text-[13px]">បុរស (Male)</span>
                      <span style={khmerFont} className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900 rounded-full px-2 py-0.5">
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
                        <circle cx="12" cy="8" r="5" />
                        <line x1="12" y1="13" x2="12" y2="21" />
                        <line x1="9"  y1="18" x2="15" y2="18" />
                      </svg>
                      <span style={khmerFont} className="text-[13px]">ស្ត្រី (Female)</span>
                      <span style={khmerFont} className="text-[11px] font-semibold text-pink-600 dark:text-pink-400 bg-pink-100 dark:bg-pink-900 rounded-full px-2 py-0.5">
                        Maternity · 90 ថ្ងៃ
                      </span>
                    </button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* ── Date + Time Fields ── */}
          {(!isMaternity || !!maternityGender) && (
            <>
              {/* ── Hourly (PERSONAL / SICK): date pickers first, TimePicker below ── */}
              {isHourly && (
                <>
                  {/* Start Date */}
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel style={khmerFont}>ថ្ងៃចាប់ផ្ដើម</FormLabel>
                        <Popover modal={true} open={openStartDate} onOpenChange={setOpenStartDate}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                style={khmerFont}
                                className={cn("inline-flex justify-between text-[13px]", !field.value && "text-muted-foreground")}
                              >
                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
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
                                form.setValue("endDate", date ?? undefined, { shouldValidate: false });
                                const nowTime = getCurrentTime();
                                form.setValue("personalStartTime", nowTime, { shouldValidate: false });
                                form.setValue("personalEndTime",   nowTime, { shouldValidate: false });
                                resetShortcuts();
                                setOpenStartDate(false);
                              }}
                              disabled={(date: Date) => {
                                const min = getMinStartDate();
                                return date < today || date.getFullYear() > currentYear || date < min;
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* End Date */}
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel style={khmerFont}>ថ្ងៃបញ្ចប់</FormLabel>
                        <Popover modal={true} open={openEndDate} onOpenChange={setOpenEndDate}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                style={khmerFont}
                                className={cn("inline-flex justify-between text-[13px]", !field.value && "text-muted-foreground")}
                              >
                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
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
                                resetShortcuts();
                                setOpenEndDate(false);
                              }}
                              disabled={(date: Date) =>
                                date < today ||
                                (!!startDateValue && date < startDateValue)
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* TimePicker — shown below dates, only when same day */}
                  {isSameDay && <TimePicker />}
                </>
              )}

              {/* ── Non-hourly: Start + End date pickers ── */}
              {!isHourly && (
                <>
                  {/* Start Date */}
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel style={khmerFont}>Start Date</FormLabel>
                        <Popover modal={true} open={openStartDate} onOpenChange={setOpenStartDate}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                style={khmerFont}
                                className={cn("inline-flex justify-between text-[13px]", !field.value && "text-muted-foreground")}
                              >
                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
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
                                setOpenStartDate(false);
                              }}
                              disabled={(date: Date) => {
                                const min = getMinStartDate();
                                return date < today || date.getFullYear() > currentYear || date < min;
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* End Date */}
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel style={khmerFont}>End Date</FormLabel>
                        <Popover modal={true} open={openEndDate} onOpenChange={setOpenEndDate}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                style={khmerFont}
                                className={cn("inline-flex justify-between text-[13px]", !field.value && "text-muted-foreground")}
                              >
                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
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
                                resetShortcuts();
                                setOpenEndDate(false);
                              }}
                              disabled={(date: Date) =>
                                date < today ||
                                (!!startDateValue && date < startDateValue)
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {/* ── Universal duration banner ── */}
              <SummaryBanner />
            </>
          )}

          {/* ── Notes ── */}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel style={khmerFont}>Reason (មូលហេតុ)</FormLabel>
                <FormControl>
                  <Textarea placeholder="Reason" {...field} />
                </FormControl>
                <FormDescription className="text-[12px]">Add extra notes to support your request.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit">Submit</Button>
        </form>
      </Form>
    </DialogWrapper>
  );
};

export default RequestForm;
