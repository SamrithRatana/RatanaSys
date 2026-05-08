"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { PiCaretUpDownBold } from "react-icons/pi";
import { BsCheckLg } from "react-icons/bs";
import { IoCalendarOutline } from "react-icons/io5";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { format } from "date-fns";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { leaveTypes } from "@/lib/dummy-data";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import DialogWrapper from "@/components/Common/DialogWrapper";
import { User } from "@prisma/client";
import toast from "react-hot-toast";
import { useState } from "react";

type Props = { user: User };

const formSchema = z
  .object({
    notes:         z.string().min(1, "Notes are required.").max(500),
    leave:         z.string({ required_error: "Please select a leave type." }),
    personalSubType: z.enum(["FULL", "SHORT"]).optional(),
    startDate:     z.date({ required_error: "A start date is required." }),
    endDate:       z.date().optional(),
    hours:         z.coerce
                     .number()
                     .min(0.5, "Minimum 0.5 hours")
                     .max(8, "Maximum 8 hours per day")
                     .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.leave === "PERSONAL" && !data.personalSubType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please choose Full Day or Short Leave.",
        path: ["personalSubType"],
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

  const selectedLeave    = form.watch("leave");
  const personalSubType  = form.watch("personalSubType");
  const isPersonal       = selectedLeave === "PERSONAL";
  const isShortLeave     = isPersonal && personalSubType === "SHORT";
  const isFullDay        = isPersonal && personalSubType === "FULL";
  const showEndDate      = !isPersonal || isFullDay;
  const showHours        = isShortLeave;
  const showDateFields   = !isPersonal || !!personalSubType;

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const isShort      = values.leave === "PERSONAL" && values.personalSubType === "SHORT";
      // If personal short leave → send type as SHORT so balance logic knows to use hours
      const resolvedType = isShort ? "SHORT" : values.leave;

      const effectiveEmail =
        user.email ??
        ((user as any).telegramId
          ? `telegram-${(user as any).telegramId}`
          : null) ??
        (user.id ? `userid-${user.id}` : null) ??
        `name-${user.name?.replace(/\s+/g, "-").toLowerCase()}`;

      const formattedValues = {
        notes:     values.notes,
        leave:     resolvedType,
        type:      resolvedType,
        startDate: values.startDate.toISOString(),
        endDate:   isShort
          ? values.startDate.toISOString()
          : values.endDate!.toISOString(),
        hours: isShort ? Number(values.hours) : undefined,
        user: {
          ...user,
          email: effectiveEmail,
        },
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentYear = today.getFullYear();

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
                <Popover
                  modal={true}
                  open={openLeaveType}
                  onOpenChange={setOpenLeaveType}
                >
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn("justify-between", !field.value && "text-muted-foreground")}
                      >
                        {field.value
                          ? leaveTypes.find((l) => l.value === field.value)?.label
                          : "Select a leave"}
                        <PiCaretUpDownBold className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0">
                    <Command>
                      <CommandInput placeholder="Search a leave..." />
                      <CommandEmpty>No leave type found.</CommandEmpty>
                      <CommandGroup>
                        {leaveTypes.map((leave) => (
                          <CommandItem
                            value={leave.label}
                            key={leave.value}
                            onSelect={() => {
                              form.setValue("leave", leave.value);
                              form.resetField("personalSubType");
                              form.resetField("endDate");
                              form.resetField("hours");
                              setOpenLeaveType(false);
                            }}
                          >
                            <BsCheckLg
                              className={cn(
                                "mr-2 h-4 w-4",
                                leave.value === field.value ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {leave.label}
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

          {/* ── Personal sub-type (Full Day / Short Leave) ── */}
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
                      onClick={() => {
                        field.onChange("FULL");
                        form.resetField("hours");
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 p-4 text-sm font-medium transition-all cursor-pointer",
                        field.value === "FULL"
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-400"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-gray-600"
                      )}
                    >
                      <svg
                        width="26" height="26" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="1.8"
                        strokeLinecap="round" strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="4" />
                        <line x1="12" y1="2"  x2="12" y2="5"  />
                        <line x1="12" y1="19" x2="12" y2="22" />
                        <line x1="4.22"  y1="4.22"  x2="6.34"  y2="6.34"  />
                        <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
                        <line x1="2"  y1="12" x2="5"  y2="12" />
                        <line x1="19" y1="12" x2="22" y2="12" />
                        <line x1="4.22"  y1="19.78" x2="6.34"  y2="17.66" />
                        <line x1="17.66" y1="6.34"  x2="19.78" y2="4.22"  />
                      </svg>
                      Full Day
                      <span className="text-xs font-normal opacity-60">All day leave</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        field.onChange("SHORT");
                        form.resetField("endDate");
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 p-4 text-sm font-medium transition-all cursor-pointer",
                        field.value === "SHORT"
                          ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-400"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-gray-600"
                      )}
                    >
                      <svg
                        width="26" height="26" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="1.8"
                        strokeLinecap="round" strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <polyline points="12 7 12 12 15 15" />
                      </svg>
                      Short Leave
                      <span className="text-xs font-normal opacity-60">Hourly · cuts personal</span>
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
              {/* Start Date */}
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{isShortLeave ? "Date" : "Start Date"}</FormLabel>
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
                            setOpenStartDate(false);
                          }}
                          disabled={(date: Date) =>
                            date < today || date.getFullYear() > currentYear
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Hours — Short Leave only */}
              {showHours && (
                <FormField
                  control={form.control}
                  name="hours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hours Requested</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0.5}
                          max={8}
                          step={0.5}
                          placeholder="e.g. 2"
                          {...field}
                          onChange={(e) => field.onChange(e.target.valueAsNumber)}
                        />
                      </FormControl>
                      <FormDescription>
                        Enter 0.5 – 8 hours. Deducted from your <strong>Personal</strong> leave balance.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* End Date — Full day leaves only */}
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
                              setOpenEndDate(false);
                            }}
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