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
import { format } from "date-fns";
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

// Gender-based days
const MATERNITY_DAYS: Record<string, number> = {
  MALE:   7,
  FEMALE: 90,
};

type Props = { user: User };

const today = new Date();
today.setHours(0, 0, 0, 0);

const formSchema = z
  .object({
    notes:           z.string().min(1, "Notes are required.").max(500),
    leave:           z.string({ required_error: "Please select a leave type." }),
    personalSubType: z.enum(["FULL", "SHORT"]).optional(),
    maternityGender: z.enum(["MALE", "FEMALE"]).optional(),
    startDate:       z.date({ required_error: "A start date is required." }),
    endDate:         z.date().optional(),
    hours:           z.coerce
                       .number()
                       .min(0.5, "Minimum 0.5 hours")
                       .max(8, "Maximum 8 hours per day")
                       .optional(),
  })
  .superRefine((data, ctx) => {
    // Personal sub-type required
    if (data.leave === "PERSONAL" && !data.personalSubType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please choose Full Day or Short Leave.",
        path: ["personalSubType"],
      });
    }

    // Maternity gender required
    if (data.leave === "MATERNITY" && !data.maternityGender) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please select Male (Paternity) or Female (Maternity).",
        path: ["maternityGender"],
      });
    }

    const isShort      = data.leave === "PERSONAL" && data.personalSubType === "SHORT";
    const needsEndDate = data.leave !== "PERSONAL" || data.personalSubType === "FULL";

    if (needsEndDate && !data.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An end date is required.",
        path: ["endDate"],
      });
    }

    if (isShort && (!data.hours || data.hours <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please enter the number of hours.",
        path: ["hours"],
      });
    }

    // 7-day advance notice for Special leave ONLY
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
    defaultValues: {},
  });

  const selectedLeave   = form.watch("leave");
  const personalSubType = form.watch("personalSubType");
  const maternityGender = form.watch("maternityGender");
  const startDateValue  = form.watch("startDate");

  const isPersonal     = selectedLeave === "PERSONAL";
  const isMaternity    = selectedLeave === "MATERNITY";
  const isShortLeave   = isPersonal && personalSubType === "SHORT";
  const isFullDay      = isPersonal && personalSubType === "FULL";
  const showEndDate    = !isPersonal || isFullDay;
  const showHours      = isShortLeave;
  const showDateFields = (!isPersonal || !!personalSubType) && (!isMaternity || !!maternityGender);

  const currentYear = today.getFullYear();

  // Auto-set startDate & endDate when leave type / gender changes
  useEffect(() => {
    if (selectedLeave === "MATERNITY" && maternityGender) {
      // Maternity: let user pick startDate freely — just reset both fields
      form.resetField("startDate");
      form.resetField("endDate");
    } else if (selectedLeave === "SPECIAL") {
      // Special: start = today + 7, end = start + 7
      const autoStart = new Date(today);
      autoStart.setDate(autoStart.getDate() + 7);
      const autoEnd = new Date(autoStart);
      autoEnd.setDate(autoEnd.getDate() + 7);
      form.setValue("startDate", autoStart, { shouldValidate: false });
      form.setValue("endDate",   autoEnd,   { shouldValidate: false });
    }
  }, [selectedLeave, maternityGender]); // eslint-disable-line react-hooks/exhaustive-deps

  // Shift endDate when startDate changes
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
    // Only Special leave requires 7-day advance notice
    if (selectedLeave === "SPECIAL") {
      const minDate = new Date(today);
      minDate.setDate(minDate.getDate() + 7);
      return minDate;
    }
    return today;
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const isShort      = values.leave === "PERSONAL" && values.personalSubType === "SHORT";
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
        endDate:         isShort
          ? format(values.startDate, "yyyy-MM-dd")
          : format(values.endDate!, "yyyy-MM-dd"),
        hours: isShort ? Number(values.hours) : undefined,
        user: { ...user, email: effectiveEmail },
      };

      const res = await fetch("/api/leave", {
        method: "POST",
        body:   JSON.stringify(formattedValues),
      });

      if (res.ok) {
        toast.success("Leave Submitted", { duration: 4000 });
        setOpen(false);
        form.reset();
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
                              form.resetField("personalSubType");
                              form.resetField("maternityGender");
                              form.resetField("startDate");
                              form.resetField("endDate");
                              form.resetField("hours");
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

          {/* ── 7-day notice banner — Special leave ONLY ── */}
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

                    {/* Male / Paternity */}
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

                    {/* Female / Maternity */}
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

          {/* ── Personal sub-type ── */}
          {isPersonal && (
            <FormField
              control={form.control}
              name="personalSubType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Personal Leave Type</FormLabel>
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <button
                      type="button"
                      onClick={() => { field.onChange("FULL"); form.resetField("hours"); }}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 p-4 text-sm font-medium transition-all cursor-pointer",
                        field.value === "FULL"
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-400"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                      )}
                    >
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="4" />
                        <line x1="12" y1="2"  x2="12" y2="5"  /><line x1="12" y1="19" x2="12" y2="22" />
                        <line x1="4.22"  y1="4.22"  x2="6.34"  y2="6.34"  /><line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
                        <line x1="2"  y1="12" x2="5"  y2="12" /><line x1="19" y1="12" x2="22" y2="12" />
                        <line x1="4.22"  y1="19.78" x2="6.34"  y2="17.66" /><line x1="17.66" y1="6.34"  x2="19.78" y2="4.22"  />
                      </svg>
                      ច្បាប់ពេញថ្ងៃ
                      <span className="text-xs font-normal opacity-60">ច្បាប់ឈប់សម្រាកពេញមួយថ្ងៃ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { field.onChange("SHORT"); form.resetField("endDate"); }}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 p-4 text-sm font-medium transition-all cursor-pointer",
                        field.value === "SHORT"
                          ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-400"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                      )}
                    >
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" />
                      </svg>
                      ច្បាប់រយះពេលខ្លី
                      <span className="text-xs font-normal opacity-60">គិតជាម៉ោង · កាត់ច្បាប់ផ្ទាល់ខ្លួន</span>
                    </button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* ── Date fields ── */}
          {showDateFields && (
            <>
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{isShortLeave ? "Date" : "Start Date"}</FormLabel>
                    <Popover modal={true} open={openStartDate} onOpenChange={setOpenStartDate}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn("inline-flex justify-between", !field.value && "text-muted-foreground")}>
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <IoCalendarOutline className="h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => { field.onChange(date); setOpenStartDate(false); }}
                          disabled={(date: Date) => {
                            if (selectedLeave === "MATERNITY") {
                              return date < today || date.getFullYear() > currentYear;
                            }
                            const minStartDate = getMinStartDate();
                            return date < today || date.getFullYear() > currentYear || date < minStartDate;
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {showHours && (
                <FormField
                  control={form.control}
                  name="hours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ចំនួនម៉ោងស្នើសុំ</FormLabel>
                      <FormControl>
                        <Input type="number" min={0.5} max={8} step={0.5} placeholder="e.g. 2"
                          {...field} onChange={(e) => field.onChange(e.target.valueAsNumber)} />
                      </FormControl>
                      <FormDescription>
                        Enter 0.5 – 8 hours. Deducted from your <strong>Personal</strong> leave balance.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {showEndDate && (
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>End Date</FormLabel>
                      <Popover modal={true} open={openEndDate} onOpenChange={setOpenEndDate}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" className={cn("inline-flex justify-between", !field.value && "text-muted-foreground")}>
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
                            disabled={(date: Date) => date < today}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
