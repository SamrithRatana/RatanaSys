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

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function calcPersonalHours(startTime: string, endTime: string): number {
  const startMin = timeToMinutes(startTime);
  const endMin   = timeToMinutes(endTime);
  return Math.max(0, (endMin - startMin) / 60);
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

// Format a minute count into a human-readable Khmer string
function formatDuration(totalMinutes: number): string {
  const hPart = Math.floor(totalMinutes / 60);
  const mPart = totalMinutes % 60;
  if (hPart === 0) return `${mPart} នាទី`;
  if (mPart === 0) return `${hPart} ម៉ោង`;
  return `${hPart} ម៉ោង ${mPart} នាទី`;
}

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

    const isPersonal = data.leave === "PERSONAL";

    if (!isPersonal && !data.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An end date is required.",
        path: ["endDate"],
      });
    }

    if (isPersonal && data.startDate && data.endDate) {
      const isSameDay = differenceInDays(data.endDate, data.startDate) === 0;
      if (isSameDay && data.personalStartTime && data.personalEndTime) {
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

const RequestForm = ({ user }: Props) => {
  const [open,          setOpen]          = useState(false);
  const [openLeaveType, setOpenLeaveType] = useState(false);
  const [openStartDate, setOpenStartDate] = useState(false);
  const [openEndDate,   setOpenEndDate]   = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      personalStartTime: "08:00",
      personalEndTime:   "17:00",
    },
  });

  const selectedLeave     = form.watch("leave");
  const maternityGender   = form.watch("maternityGender");
  const startDateValue    = form.watch("startDate");
  const endDateValue      = form.watch("endDate");
  const personalStartTime = form.watch("personalStartTime") ?? "08:00";
  const personalEndTime   = form.watch("personalEndTime")   ?? "17:00";

  const isPersonal  = selectedLeave === "PERSONAL";
  const isMaternity = selectedLeave === "MATERNITY";

  const isSameDay =
    isPersonal &&
    !!startDateValue &&
    !!endDateValue &&
    differenceInDays(endDateValue, startDateValue) === 0;

  const personalDays = isPersonal && startDateValue && endDateValue
    ? differenceInDays(endDateValue, startDateValue) + 1
    : 1;

  const personalHours = isSameDay
    ? calcPersonalHours(personalStartTime, personalEndTime)
    : null;

  // Human-readable summary label
  const personalSummary = (() => {
    if (!isPersonal || !startDateValue || !endDateValue) return null;
    if (isSameDay) {
      if (!personalHours || personalHours <= 0) return null;
      const totalMin = Math.round(personalHours * 60);
      return personalHours >= 8
        ? `1 ថ្ងៃ (${personalStartTime} – ${personalEndTime})`
        : `${formatDuration(totalMin)} (${personalStartTime} – ${personalEndTime})`;
    }
    return `${personalDays} ថ្ងៃ (${format(startDateValue, "dd MMM")} – ${format(endDateValue, "dd MMM yyyy")})`;
  })();

  const currentYear = today.getFullYear();

  // Auto-set dates for Maternity / Special
  useEffect(() => {
    if (selectedLeave === "MATERNITY" && maternityGender) {
      const autoStart = new Date(today);
      const days      = MATERNITY_DAYS[maternityGender];
      const autoEnd   = new Date(autoStart);
      autoEnd.setDate(autoEnd.getDate() + days);
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

  useEffect(() => {
    if (!startDateValue) return;
    if (selectedLeave === "MATERNITY" && maternityGender) {
      const days    = MATERNITY_DAYS[maternityGender];
      const autoEnd = new Date(startDateValue);
      autoEnd.setDate(autoEnd.getDate() + days);
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

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const isPersonalLeave = values.leave === "PERSONAL";
      const sameDay = isPersonalLeave && values.endDate
        ? differenceInDays(values.endDate, values.startDate) === 0
        : false;

      const hours = sameDay
        ? calcPersonalHours(
            values.personalStartTime ?? "08:00",
            values.personalEndTime   ?? "17:00",
          )
        : undefined;

      const days = isPersonalLeave
        ? sameDay
          ? hours && hours >= 8 ? 1 : 0
          : differenceInDays(values.endDate!, values.startDate) + 1
        : differenceInDays(values.endDate!, values.startDate) + 1;

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
        hours: hours !== undefined ? +hours.toFixed(4) : undefined,
        days,
        user: { ...user, email: effectiveEmail },
      };

      const res = await fetch("/api/leave", {
        method: "POST",
        body:   JSON.stringify(formattedValues),
      });

      if (res.ok) {
        toast.success("Leave Submitted", { duration: 4000 });
        setOpen(false);
        form.reset({ personalStartTime: "08:00", personalEndTime: "17:00" });
      } else {
        const data = await res.json();
        toast.error(`An error occurred: ${JSON.stringify(data)}`, { duration: 6000 });
      }
    } catch (error) {
      console.error("An error occurred:", error);
      toast.error("An unexpected error occurred");
    }
  }

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
                              form.resetField("maternityGender");
                              form.resetField("startDate");
                              form.resetField("endDate");
                              form.setValue("personalStartTime", "08:00");
                              form.setValue("personalEndTime",   "17:00");
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

          {/* ── Special leave 7-day banner ── */}
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

          {/* ── Maternity Gender Selector ── */}
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
                        <circle cx="10" cy="14" r="5" />
                        <line x1="19" y1="5" x2="14.14" y2="9.86" />
                        <polyline points="15 5 19 5 19 9" />
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
                        <circle cx="12" cy="8" r="5" />
                        <line x1="12" y1="13" x2="12" y2="21" />
                        <line x1="9"  y1="18" x2="15" y2="18" />
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

          {/* ── Date Fields ── */}
          {(!isMaternity || !!maternityGender) && (
            <>
              {/* Start Date */}
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>
                      {isPersonal ? "ថ្ងៃចាប់ផ្ដើម" : "Start Date"}
                    </FormLabel>
                    <Popover modal={true} open={openStartDate} onOpenChange={setOpenStartDate}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn("inline-flex justify-between", !field.value && "text-muted-foreground")}
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
                            if (isPersonal) {
                              form.setValue("endDate", date ?? undefined, { shouldValidate: false });
                            }
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
                    <FormLabel>
                      {isPersonal ? "ថ្ងៃបញ្ចប់" : "End Date"}
                    </FormLabel>
                    <Popover modal={true} open={openEndDate} onOpenChange={setOpenEndDate}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn("inline-flex justify-between", !field.value && "text-muted-foreground")}
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
                          onSelect={(date) => { field.onChange(date); setOpenEndDate(false); }}
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

              {/* ── Personal: same-day time pickers ── */}
              {isPersonal && isSameDay && (
                <FormItem>
                  <FormLabel>ម៉ោង (Time)</FormLabel>

                  {/* Time range inputs */}
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
                              const curEnd   = form.getValues("personalEndTime") ?? "17:00";
                              if (timeToMinutes(curEnd) <= timeToMinutes(newStart)) {
                                const pushed = Math.min(timeToMinutes(newStart) + 60, 17 * 60);
                                form.setValue("personalEndTime", minutesToTime(pushed));
                              }
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

                  {/* ── Hours + Minutes shortcut inputs ── */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {/* Hours input */}
                    <Input
                      type="number"
                      min={0}
                      max={9}
                      step={1}
                      placeholder="h"
                      className="w-14 text-center"
                      onChange={(e) => {
                        const h = parseFloat(e.target.value);
                        if (isNaN(h) || h < 0) return;
                        const startMin   = timeToMinutes(form.getValues("personalStartTime") ?? "08:00");
                        const curEnd     = timeToMinutes(form.getValues("personalEndTime")   ?? "17:00");
                        const curMinPart = (curEnd - startMin) % 60;
                        const endMin     = Math.min(startMin + h * 60 + curMinPart, 17 * 60);
                        form.setValue("personalEndTime", minutesToTime(endMin));
                      }}
                    />
                    <span className="text-sm text-muted-foreground">ម៉ោង</span>

                    {/* Minutes input */}
                    <Input
                      type="number"
                      min={0}
                      max={59}
                      step={5}
                      placeholder="m"
                      className="w-14 text-center"
                      onChange={(e) => {
                        const m = parseInt(e.target.value);
                        if (isNaN(m) || m < 0) return;
                        const startMin  = timeToMinutes(form.getValues("personalStartTime") ?? "08:00");
                        const curEnd    = timeToMinutes(form.getValues("personalEndTime")   ?? "17:00");
                        const curHrPart = Math.floor((curEnd - startMin) / 60);
                        const endMin    = Math.min(startMin + curHrPart * 60 + m, 17 * 60);
                        form.setValue("personalEndTime", minutesToTime(endMin));
                      }}
                    />
                    <span className="text-sm text-muted-foreground">នាទី</span>
                  </div>

                  <FormDescription className="mt-1">
                    វាយម៉ោង និងនាទី ដើម្បីគណនាម៉ោងបញ្ចប់ស្វ័យប្រវត្តិ
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}

              {/* ── Personal leave summary banner ── */}
              {isPersonal && personalSummary && (
                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                  <span>
                    ច្បាប់ស្នើសុំ: <strong>{personalSummary}</strong>
                    {isSameDay && personalHours != null && personalHours > 0 && personalHours < 8 && (() => {
                      const totalMin = Math.round(personalHours * 60);
                      return (
                        <> · កាត់ <strong>{formatDuration(totalMin)}</strong> ពីច្បាប់ផ្ទាល់ខ្លួន</>
                      );
                    })()}
                  </span>
                </div>
              )}
            </>
          )}

          {/* ── Notes ── */}
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

          <Button type="submit">Submit</Button>
        </form>
      </Form>
    </DialogWrapper>
  );
};

export default RequestForm;