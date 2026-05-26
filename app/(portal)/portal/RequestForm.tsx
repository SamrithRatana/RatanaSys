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
import { useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Constants & types
// ─────────────────────────────────────────────────────────────────────────────

const khmerFont: React.CSSProperties = { fontFamily: "'Battambang', serif" };

const leaveKhmerLabels: Record<string, string> = {
  ANNUAL:    "ច្បាប់ប្រចាំឆ្នាំ-Annual Leave",
  SICK:      "ច្បាប់ឈឺផ្ទាល់ខ្លួន-Sick Leave",
  PERSONAL:  "ច្បាប់ផ្ទាល់ខ្លួន-Personal Leave",
  MATERNITY: "ច្បាប់មាតុភាព-Maternity Leave",
  SPECIAL:   "ច្បាប់ពិសេស-Special Leave",
};

const MATERNITY_DAYS: Record<string, number> = { MALE: 7, FEMALE: 90 };

type SlotType = "FULL" | "HALF_AM" | "HALF_PM" | "CUSTOM";

// ── Segment (for segment mode) ────────────────────────────────────────────────
type Segment = {
  id:         string;
  date:       Date | undefined;
  endDate:    Date | undefined;
  slotType:   SlotType;
  startTime:  string;
  endTime:    string;
  shortcutH:  number;
  shortcutM:  number;
  calOpen:    boolean;
  calEndOpen: boolean;
};

const SLOT_LABELS: Record<SlotType, string> = {
  FULL:    "ពេញថ្ងៃ",
  HALF_AM: "ព្រឹក (08:00–12:00)",
  HALF_PM: "រសៀល (13:00–17:00)",
  CUSTOM:  "កំណត់ម៉ោង",
};

const SLOT_HOURS: Record<Exclude<SlotType, "CUSTOM">, number> = {
  FULL:    0,
  HALF_AM: 4,
  HALF_PM: 4,
};

const SLOT_TIMES: Record<Exclude<SlotType, "CUSTOM">, [string, string]> = {
  FULL:    ["08:00", "17:00"],
  HALF_AM: ["08:00", "12:00"],
  HALF_PM: ["13:00", "17:00"],
};

// ─── UPDATED Props type with external control ────────────────────────────────
type Props = {
  user: User;
  defaultLeave?: string;
  externalOpen?: boolean;
  onExternalClose?: () => void;
};

const today = new Date();
today.setHours(0, 0, 0, 0);

// ─────────────────────────────────────────────────────────────────────────────
// Time helpers
// ─────────────────────────────────────────────────────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minutesToTime(min: number): string {
  return `${Math.floor(min / 60).toString().padStart(2, "0")}:${(min % 60).toString().padStart(2, "0")}`;
}
function getCurrentTime(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
}
function calcHours(start: string, end: string): number {
  return Math.max(0, (timeToMinutes(end) - timeToMinutes(start)) / 60);
}
function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} នាទី`;
  if (m === 0) return `${h} ម៉ោង`;
  return `${h} ម៉ោង ${m} នាទី`;
}
function blockFloatKeys(e: React.KeyboardEvent<HTMLInputElement>) {
  if ([".", ",", "-", "e", "E", "+"].includes(e.key)) e.preventDefault();
}

// ─────────────────────────────────────────────────────────────────────────────
// Segment helpers
// ─────────────────────────────────────────────────────────────────────────────

function getSegmentDays(seg: Segment): number {
  if (seg.slotType !== "FULL" || !seg.date || !seg.endDate) return 1;
  const diff = differenceInDays(seg.endDate, seg.date);
  return diff >= 0 ? diff + 1 : 1;
}

function segmentValue(seg: Segment): { hours: number; days: number } {
  if (seg.slotType === "FULL")    return { hours: 0, days: getSegmentDays(seg) };
  if (seg.slotType === "HALF_AM") return { hours: SLOT_HOURS.HALF_AM, days: 0 };
  if (seg.slotType === "HALF_PM") return { hours: SLOT_HOURS.HALF_PM, days: 0 };
  const h = calcHours(seg.startTime, seg.endTime);
  if (h >= 8) return { hours: 0, days: 1 };
  return { hours: h, days: 0 };
}

function segmentDayFraction(seg: Segment): number {
  const { hours, days } = segmentValue(seg);
  if (days >= 1) return days;
  return hours / 8;
}

function segmentDurationLabel(seg: Segment): string {
  if (seg.slotType === "FULL") {
    const d = getSegmentDays(seg);
    return `${d} ថ្ងៃ`;
  }
  if (seg.slotType === "HALF_AM") return formatDuration(SLOT_HOURS.HALF_AM * 60);
  if (seg.slotType === "HALF_PM") return formatDuration(SLOT_HOURS.HALF_PM * 60);
  const h = calcHours(seg.startTime, seg.endTime);
  if (h <= 0) return "—";
  if (h >= 8) return "1 ថ្ងៃ";
  return formatDuration(Math.round(h * 60));
}

// ─────────────────────────────────────────────────────────────────────────────
// Zod schema
// ─────────────────────────────────────────────────────────────────────────────

const formSchema = z
  .object({
    notes:             z.string().min(1, "Notes are required.").max(500),
    leave:             z.string({ required_error: "Please select a leave type." }),
    maternityGender:   z.enum(["MALE", "FEMALE"]).optional(),
    startDate:         z.date().optional(),
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
    if (data.leave === "SPECIAL") {
      if (!data.startDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A start date is required.", path: ["startDate"] });
      }
      if (!data.endDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "An end date is required.", path: ["endDate"] });
      }
      if (data.startDate) {
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
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// New segment factory
// ─────────────────────────────────────────────────────────────────────────────

let _segId = 0;
function newSegment(date?: Date): Segment {
  return {
    id:         `seg-${++_segId}`,
    date,
    endDate:    date,
    slotType:   "FULL",
    startTime:  getCurrentTime(),
    endTime:    getCurrentTime(),
    shortcutH:  0,
    shortcutM:  0,
    calOpen:    false,
    calEndOpen: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

// ─── UPDATED signature with external control props ───────────────────────────
const RequestForm = ({ user, defaultLeave, externalOpen, onExternalClose }: Props) => {
  const [open,          setOpen]          = useState(false);
  const [openLeaveType, setOpenLeaveType] = useState(false);
  const [openStartDate, setOpenStartDate] = useState(false);
  const [openEndDate,   setOpenEndDate]   = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isSegmentMode, setIsSegmentMode] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([newSegment(new Date(today))]);

  const [drSlotType,  setDrSlotType]  = useState<SlotType>("FULL");
  const [drStartTime, setDrStartTime] = useState(getCurrentTime());
  const [drEndTime,   setDrEndTime]   = useState(getCurrentTime());
  const [drShortcutH, setDrShortcutH] = useState(0);
  const [drShortcutM, setDrShortcutM] = useState(0);

  const initTime = getCurrentTime();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      personalStartTime: initTime,
      personalEndTime:   initTime,
    },
  });

  // ─── Sync external open state ─────────────────────────────────────────────
  useEffect(() => {
    if (externalOpen !== undefined) setOpen(externalOpen);
  }, [externalOpen]);

  // ─── Pre-select leave type when opened externally ─────────────────────────
  useEffect(() => {
    if (externalOpen && defaultLeave) {
      form.setValue("leave", defaultLeave);
    }
  }, [externalOpen, defaultLeave]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedLeave   = form.watch("leave");
  const maternityGender = form.watch("maternityGender");
  const startDateValue  = form.watch("startDate");
  const endDateValue    = form.watch("endDate");

  const isPersonal  = selectedLeave === "PERSONAL";
  const isSick      = selectedLeave === "SICK";
  const isAnnual    = selectedLeave === "ANNUAL";
  const isMaternity = selectedLeave === "MATERNITY";

  const isFlexibleLeave = isAnnual || isPersonal || isSick;

  const currentYear = today.getFullYear();

  useEffect(() => {
    setIsSegmentMode(false);
    setSegments([newSegment(new Date(today))]);
    setDrSlotType("FULL");
    setDrStartTime(getCurrentTime());
    setDrEndTime(getCurrentTime());
    setDrShortcutH(0);
    setDrShortcutM(0);
  }, [selectedLeave]);

  useEffect(() => {
    if (selectedLeave === "MATERNITY" && maternityGender) {
      const autoStart = new Date(today);
      const days      = MATERNITY_DAYS[maternityGender];
      const autoEnd   = new Date(autoStart);
      autoEnd.setDate(autoEnd.getDate() + days - 1);
      form.setValue("startDate", autoStart, { shouldValidate: false });
      form.setValue("endDate",   autoEnd,   { shouldValidate: false });
    } else if (selectedLeave === "SPECIAL") {
      const autoStart = new Date(today);
      autoStart.setDate(autoStart.getDate() + 7);
      const autoEnd = new Date(autoStart);
      autoEnd.setDate(autoEnd.getDate() + 6);
      form.setValue("startDate", autoStart, { shouldValidate: false });
      form.setValue("endDate",   autoEnd,   { shouldValidate: false });
    }
  }, [selectedLeave, maternityGender]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!startDateValue) return;
    if (selectedLeave === "MATERNITY" && maternityGender) {
      const days    = MATERNITY_DAYS[maternityGender];
      const autoEnd = new Date(startDateValue);
      autoEnd.setDate(autoEnd.getDate() + days - 1);
      form.setValue("endDate", autoEnd, { shouldValidate: false });
    } else if (selectedLeave === "SPECIAL") {
      const autoEnd = new Date(startDateValue);
      autoEnd.setDate(autoEnd.getDate() + 6);
      form.setValue("endDate", autoEnd, { shouldValidate: false });
    }
  }, [startDateValue]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (drSlotType !== "FULL" && startDateValue) {
      form.setValue("endDate", startDateValue, { shouldValidate: false });
    }
  }, [drSlotType]); // eslint-disable-line react-hooks/exhaustive-deps

  const getMinStartDate = (): Date => {
    if (selectedLeave === "SPECIAL") {
      const d = new Date(today);
      d.setDate(d.getDate() + 7);
      return d;
    }
    return today;
  };

  const drHours: number = (() => {
    if (drSlotType === "FULL")    return 0;
    if (drSlotType === "HALF_AM") return SLOT_HOURS.HALF_AM;
    if (drSlotType === "HALF_PM") return SLOT_HOURS.HALF_PM;
    return calcHours(drStartTime, drEndTime);
  })();

  const drDurationLabel: string = (() => {
    if (drSlotType === "FULL") {
      if (!startDateValue || !endDateValue) return "";
      const d = differenceInDays(endDateValue, startDateValue) + 1;
      return `${d} ថ្ងៃ`;
    }
    if (drSlotType === "HALF_AM") return formatDuration(SLOT_HOURS.HALF_AM * 60);
    if (drSlotType === "HALF_PM") return formatDuration(SLOT_HOURS.HALF_PM * 60);
    const h = calcHours(drStartTime, drEndTime);
    if (h <= 0) return "—";
    if (h >= 8) return "1 ថ្ងៃ";
    return formatDuration(Math.round(h * 60));
  })();

  const drTimeRange: string = (() => {
    if (drSlotType === "HALF_AM") return `${SLOT_TIMES.HALF_AM[0]} – ${SLOT_TIMES.HALF_AM[1]}`;
    if (drSlotType === "HALF_PM") return `${SLOT_TIMES.HALF_PM[0]} – ${SLOT_TIMES.HALF_PM[1]}`;
    if (drSlotType === "CUSTOM")  return `${drStartTime} – ${drEndTime}`;
    return "";
  })();

  const handleToggleSegment = () => {
    setIsSegmentMode(prev => {
      const next = !prev;
      if (next) {
        const prefillDate = startDateValue ?? new Date(today);
        setSegments([newSegment(new Date(prefillDate))]);
        form.setValue("startDate", undefined as any, { shouldValidate: false });
        form.setValue("endDate",   undefined as any, { shouldValidate: false });
        setDrSlotType("FULL");
        setDrShortcutH(0);
        setDrShortcutM(0);
      } else {
        setSegments([newSegment(new Date(today))]);
      }
      return next;
    });
  };

  const updateSegment = useCallback((id: string, patch: Partial<Segment>) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }, []);

  const addSegment    = () => setSegments(prev => [...prev, newSegment()]);
  const removeSegment = (id: string) =>
    setSegments(prev => prev.filter(s => s.id !== id));

  const totalFraction = segments.reduce((sum, s) => sum + segmentDayFraction(s), 0);
  const totalLabel = (() => {
    if (totalFraction === 0) return null;
    const totalMin = Math.round(totalFraction * 8 * 60);
    if (totalMin % 480 === 0) return `${totalMin / 480} ថ្ងៃ`;
    const days   = Math.floor(totalMin / 480);
    const remMin = totalMin % 480;
    const daysStr = days > 0 ? `${days} ថ្ងៃ ` : "";
    return `${daysStr}${formatDuration(remMin)}`;
  })();

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    try {
      const effectiveEmail =
        user.email ??
        ((user as any).telegramId ? `telegram-${(user as any).telegramId}` : null) ??
        (user.id ? `userid-${user.id}` : null) ??
        `name-${user.name?.replace(/\s+/g, "-").toLowerCase()}`;

      const userPayload = { ...user, email: effectiveEmail };

      if (isFlexibleLeave && isSegmentMode) {
        const missing = segments.some(s => !s.date);
        if (missing) {
          toast.error("សូមជ្រើសរើសកាលបរិច្ឆេទសម្រាប់រាល់ segment !");
          return;
        }
        const invalidCustom = segments.some(
          s => s.slotType === "CUSTOM" && calcHours(s.startTime, s.endTime) <= 0
        );
        if (invalidCustom) {
          toast.error("ម៉ោងបញ្ចប់ត្រូវតែក្រោយម៉ោងចាប់ផ្ដើម!");
          return;
        }

        const segmentPayloads = segments.map((seg) => {
          const { hours, days } = segmentValue(seg);
          let startTime = "08:00";
          let endTime   = "17:00";
          if (seg.slotType === "HALF_AM") { startTime = "08:00"; endTime = "12:00"; }
          if (seg.slotType === "HALF_PM") { startTime = "13:00"; endTime = "17:00"; }
          if (seg.slotType === "CUSTOM")  { startTime = seg.startTime; endTime = seg.endTime; }
          return {
            date:      format(seg.date!, "yyyy-MM-dd"),
            endDate:   format(seg.endDate ?? seg.date!, "yyyy-MM-dd"),
            hours:     hours > 0 ? hours : undefined,
            days,
            startTime: seg.slotType !== "FULL" ? startTime : undefined,
            endTime:   seg.slotType !== "FULL" ? endTime   : undefined,
          };
        });

        const payload = {
          notes:     values.notes,
          leave:     values.leave,
          type:      values.leave,
          startDate: format(segments[0].date!, "yyyy-MM-dd"),
          endDate:   format(segments[segments.length - 1].endDate ?? segments[segments.length - 1].date!, "yyyy-MM-dd"),
          segments:  segmentPayloads,
          user:      userPayload,
        };

        const res = await fetch("/api/leave", {
          method: "POST",
          body:   JSON.stringify(payload),
        });

        if (res.ok) {
          toast.success(
            `បានស្នើសុំ ${segments.length} segment${segments.length > 1 ? "s" : ""} ដោយជោគជ័យ!`,
            { duration: 4000 }
          );
          setOpen(false);
          onExternalClose?.();
          setIsSegmentMode(false);
          setSegments([newSegment(new Date(today))]);
          form.reset({ personalStartTime: getCurrentTime(), personalEndTime: getCurrentTime() });
        } else {
          const errData = await res.json().catch(() => ({}));
          toast.error(`មានបញ្ហា: ${JSON.stringify(errData)}`, { duration: 6000 });
        }
        return;
      }

      if (isFlexibleLeave && !isSegmentMode) {
        if (!values.startDate) {
          toast.error("សូមជ្រើសរើសកាលបរិច្ឆេទ!");
          return;
        }
        if (drSlotType === "FULL" && !values.endDate) {
          toast.error("សូមជ្រើសរើសថ្ងៃបញ្ចប់!");
          return;
        }
        if (drSlotType === "CUSTOM" && calcHours(drStartTime, drEndTime) <= 0) {
          toast.error("ម៉ោងបញ្ចប់ត្រូវតែក្រោយម៉ោងចាប់ផ្ដើម!");
          return;
        }
      }

      const submitDays: number = (() => {
        if (!isFlexibleLeave) {
          return values.startDate && values.endDate
            ? differenceInDays(values.endDate, values.startDate) + 1
            : 1;
        }
        if (drSlotType === "FULL") {
          return values.startDate && values.endDate
            ? differenceInDays(values.endDate, values.startDate) + 1
            : 1;
        }
        return 0;
      })();

      const submitHours: number | undefined = (() => {
        if (!isFlexibleLeave) return undefined;
        if (drSlotType === "FULL") return undefined;
        if (drSlotType === "HALF_AM" || drSlotType === "HALF_PM") return SLOT_HOURS[drSlotType];
        return calcHours(drStartTime, drEndTime);
      })();

      const submitStartTime: string | undefined = (() => {
        if (!isFlexibleLeave || drSlotType === "FULL") return undefined;
        if (drSlotType === "HALF_AM") return "08:00";
        if (drSlotType === "HALF_PM") return "13:00";
        return drStartTime;
      })();

      const submitEndTime: string | undefined = (() => {
        if (!isFlexibleLeave || drSlotType === "FULL") return undefined;
        if (drSlotType === "HALF_AM") return "12:00";
        if (drSlotType === "HALF_PM") return "17:00";
        return drEndTime;
      })();

      const effectiveEndDate =
        isFlexibleLeave && drSlotType !== "FULL" && values.startDate
          ? values.startDate
          : values.endDate;

      const payload = {
        notes:           values.notes,
        leave:           values.leave,
        type:            values.leave,
        maternityGender: values.maternityGender,
        startDate:       values.startDate ? format(values.startDate, "yyyy-MM-dd") : "",
        endDate:         effectiveEndDate  ? format(effectiveEndDate, "yyyy-MM-dd") : "",
        days:            submitDays,
        ...(submitHours     !== undefined && { hours:     submitHours }),
        ...(submitStartTime !== undefined && { startTime: submitStartTime }),
        ...(submitEndTime   !== undefined && { endTime:   submitEndTime }),
        user: userPayload,
      };

      const res = await fetch("/api/leave", {
        method: "POST",
        body:   JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success("Leave Submitted", { duration: 4000 });
        setOpen(false);
        onExternalClose?.();
        setDrSlotType("FULL");
        setDrShortcutH(0);
        setDrShortcutM(0);
        form.reset({ personalStartTime: getCurrentTime(), personalEndTime: getCurrentTime() });
      } else {
        const data = await res.json();
        toast.error(`An error occurred: ${JSON.stringify(data)}`, { duration: 6000 });
      }
    } catch (error) {
      console.error("An error occurred:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sub-components
  // ─────────────────────────────────────────────────────────────────────────

  const SegmentRow = ({ seg, idx }: { seg: Segment; idx: number }) => {
    const isCustom = seg.slotType === "CUSTOM";
    const isFull   = seg.slotType === "FULL";

    return (
      <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span style={khmerFont} className="text-[12px] font-semibold text-gray-500 dark:text-gray-400">
            Segment {idx + 1}
          </span>
          {segments.length > 1 && (
            <button
              type="button"
              onClick={() => removeSegment(seg.id)}
              className="text-red-400 hover:text-red-600 text-[11px] underline"
              style={khmerFont}
            >
              លុប
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span style={khmerFont} className="text-[12px] text-gray-600 dark:text-gray-400">
            {isFull ? "ថ្ងៃចាប់ផ្តើម" : "កាលបរិច្ឆេទ"}
          </span>
          <Popover modal={true} open={seg.calOpen} onOpenChange={(o) => updateSegment(seg.id, { calOpen: o })}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" style={khmerFont}
                className={cn("inline-flex justify-between text-[13px] w-full", !seg.date && "text-muted-foreground")}>
                {seg.date ? format(seg.date, "dd MMM yyyy (EEEE)") : <span>ជ្រើសរើសថ្ងៃ</span>}
                <IoCalendarOutline className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={seg.date}
                onSelect={(date) => {
                  const patch: Partial<Segment> = { date: date ?? undefined, calOpen: false };
                  if (date && seg.endDate && seg.endDate < date) patch.endDate = date;
                  if (date && !seg.endDate) patch.endDate = date;
                  updateSegment(seg.id, patch);
                }}
                disabled={(date: Date) => date < today || date.getFullYear() > currentYear}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {isFull && (
          <div className="flex flex-col gap-1">
            <span style={khmerFont} className="text-[12px] text-gray-600 dark:text-gray-400">ថ្ងៃបញ្ចប់</span>
            <Popover modal={true} open={seg.calEndOpen} onOpenChange={(o) => updateSegment(seg.id, { calEndOpen: o })}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" style={khmerFont}
                  className={cn("inline-flex justify-between text-[13px] w-full", !seg.endDate && "text-muted-foreground")}>
                  {seg.endDate ? format(seg.endDate, "dd MMM yyyy (EEEE)") : <span>ជ្រើសរើសថ្ងៃបញ្ចប់</span>}
                  <IoCalendarOutline className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={seg.endDate}
                  onSelect={(date) => updateSegment(seg.id, { endDate: date ?? undefined, calEndOpen: false })}
                  disabled={(date: Date) =>
                    date < today || date.getFullYear() > currentYear || (!!seg.date && date < seg.date)
                  }
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span style={khmerFont} className="text-[12px] text-gray-600 dark:text-gray-400">ប្រភេទ</span>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {(["FULL", "HALF_AM", "HALF_PM", "CUSTOM"] as SlotType[]).map((slot) => (
              <button
                key={slot} type="button"
                onClick={() => {
                  const patch: Partial<Segment> = { slotType: slot, shortcutH: 0, shortcutM: 0 };
                  if (slot === "CUSTOM") { patch.startTime = getCurrentTime(); patch.endTime = getCurrentTime(); }
                  if (slot !== "FULL") patch.endDate = seg.date;
                  updateSegment(seg.id, patch);
                }}
                style={khmerFont}
                className={cn(
                  "rounded-lg border px-2 py-2 text-[11px] font-medium transition-all text-center leading-snug",
                  seg.slotType === slot
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-300"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                )}
              >
                {SLOT_LABELS[slot]}
              </button>
            ))}
          </div>
        </div>

        {isCustom && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Input type="time" min="08:00" max="16:59" className="w-32" value={seg.startTime}
                onChange={(e) => {
                  const newStart = e.target.value;
                  const endMin = timeToMinutes(seg.endTime);
                  const startMin = timeToMinutes(newStart);
                  const patch: Partial<Segment> = { startTime: newStart, shortcutH: 0, shortcutM: 0 };
                  if (endMin <= startMin) patch.endTime = minutesToTime(Math.min(startMin + 60, 17 * 60));
                  updateSegment(seg.id, patch);
                }}
              />
              <span className="text-muted-foreground text-sm">→</span>
              <Input type="time" min="08:01" max="17:00" className="w-32" value={seg.endTime}
                onChange={(e) => updateSegment(seg.id, { endTime: e.target.value, shortcutH: 0, shortcutM: 0 })}
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Input type="number" min={0} max={9} step={1} placeholder="h" className="w-14 text-center"
                value={seg.shortcutH} onKeyDown={blockFloatKeys} onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const h = Math.max(0, parseInt(e.target.value) || 0);
                  const startMin = timeToMinutes(seg.startTime);
                  const endMin = Math.min(startMin + h * 60 + seg.shortcutM, 17 * 60);
                  updateSegment(seg.id, { shortcutH: h, endTime: minutesToTime(endMin) });
                }}
              />
              <span style={khmerFont} className="text-[13px] text-muted-foreground">ម៉ោង</span>
              <Input type="number" min={0} max={59} step={5} placeholder="m" className="w-14 text-center"
                value={seg.shortcutM} onKeyDown={blockFloatKeys} onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const m = Math.max(0, parseInt(e.target.value) || 0);
                  const startMin = timeToMinutes(seg.startTime);
                  const endMin = Math.min(startMin + seg.shortcutH * 60 + m, 17 * 60);
                  updateSegment(seg.id, { shortcutM: m, endTime: minutesToTime(endMin) });
                }}
              />
              <span style={khmerFont} className="text-[13px] text-muted-foreground">នាទី</span>
            </div>
          </div>
        )}

        {seg.date && (
          <div className={cn(
            "text-[12px] rounded-md px-3 py-1.5 flex items-center gap-1.5",
            isAnnual ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
              : isSick ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
              : "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
          )}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span style={khmerFont}>
              {isFull && seg.endDate && seg.endDate > seg.date
                ? `${format(seg.date, "dd MMM")} → ${format(seg.endDate, "dd MMM")}`
                : format(seg.date, "dd MMM")}
              {" · "}<strong>{segmentDurationLabel(seg)}</strong>
              {seg.slotType === "CUSTOM" && <> ({seg.startTime} – {seg.endTime})</>}
              {(seg.slotType === "HALF_AM" || seg.slotType === "HALF_PM") && (
                <> ({SLOT_TIMES[seg.slotType][0]} – {SLOT_TIMES[seg.slotType][1]})</>
              )}
            </span>
          </div>
        )}
      </div>
    );
  };

  const TotalSummary = () => {
    if (!totalLabel) return null;
    const validSegs = segments.filter(s => s.date);
    if (validSegs.length === 0) return null;
    return (
      <div className={cn(
        "rounded-xl border-2 px-4 py-3 space-y-2",
        isAnnual ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950"
          : isSick ? "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950"
          : "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950"
      )}>
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={cn("shrink-0", isAnnual ? "text-green-600" : isSick ? "text-red-600" : "text-blue-600")}>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span style={khmerFont} className={cn("text-[13px] font-semibold",
            isAnnual ? "text-green-800 dark:text-green-300"
              : isSick ? "text-red-800 dark:text-red-300"
              : "text-blue-800 dark:text-blue-300")}>
            សរុប: {totalLabel}
          </span>
        </div>
        <div className="space-y-0.5">
          {validSegs.map((s) => {
            const isFull = s.slotType === "FULL";
            const dateLabel =
              isFull && s.endDate && s.endDate > s.date!
                ? `${format(s.date!, "dd MMM (EEE)")} → ${format(s.endDate, "dd MMM (EEE)")}`
                : s.date ? format(s.date, "dd MMM (EEE)") : "";
            return (
              <div key={s.id} style={khmerFont} className={cn("text-[11px] flex items-center gap-1",
                isAnnual ? "text-green-700 dark:text-green-400"
                  : isSick ? "text-red-700 dark:text-red-400"
                  : "text-blue-700 dark:text-blue-400")}>
                <span className="opacity-50">·</span>
                {dateLabel} — {segmentDurationLabel(s)}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <DialogWrapper
      btnTitle="ចុចដើម្បីស្នើសុំច្បាប់"
      btnStyle={khmerFont}
      title="Submit your Leave Application"
      descr="ត្រូវប្រាកដថាអ្នកជ្រើសរើសកាលបរិច្ឆេទត្រឹមត្រូវសម្រាប់ការសុំច្បាប់"
      descrStyle={khmerFont}
      isBtn={true}
      open={open}
      // ─── UPDATED: call onExternalClose when dialog closes ────────────────
      setOpen={() => {
        const next = !open;
        setOpen(next);
        if (!next) onExternalClose?.();
      }}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

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
                      <Button variant="outline" role="combobox" style={khmerFont}
                        className={cn("justify-between text-[13px]", !field.value && "text-muted-foreground")}>
                        {field.value
                          ? leaveKhmerLabels[field.value] ?? leaveTypes.find(l => l.value === field.value)?.label
                          : "ជ្រើសរើសប្រភេទច្បាប់"}
                        <PiCaretUpDownBold className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-[260px] p-0">
                    <Command>
                      <CommandInput placeholder="ស្វែងរកប្រភេទច្បាប់..." style={khmerFont} className="text-[13px]" />
                      <CommandEmpty style={khmerFont} className="text-[13px] py-3 text-center">
                        រកមិនឃើញប្រភេទច្បាប់។
                      </CommandEmpty>
                      <CommandGroup>
                        {leaveTypes.map((leave) => (
                          <CommandItem
                            value={leaveKhmerLabels[leave.value] ?? leave.label}
                            key={leave.value} style={khmerFont} className="text-[13px] py-2.5"
                            onSelect={() => {
                              form.setValue("leave", leave.value);
                              form.resetField("maternityGender");
                              form.resetField("startDate");
                              form.resetField("endDate");
                              setOpenLeaveType(false);
                            }}
                          >
                            <BsCheckLg className={cn("mr-2 h-4 w-4 shrink-0",
                              leave.value === field.value ? "opacity-100" : "opacity-0")} />
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

          {/* ── Special banner ── */}
          {selectedLeave === "SPECIAL" && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-amber-600">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span style={khmerFont} className="text-[13px] text-amber-800 dark:text-amber-300">
                <strong>7-day advance notice required.</strong> ច្បាប់ប្រភេទនេះត្រូវតែស្នើសុំ
                យ៉ាងហោចណាស់ <strong>7 ថ្ងៃ</strong> មុនពេលចូលច្បាប់។
              </span>
            </div>
          )}

          {/* ── Maternity Gender ── */}
          {isMaternity && (
            <FormField
              control={form.control}
              name="maternityGender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel style={khmerFont}>សូមជ្រើសរើសភេទ (Select Gender)</FormLabel>
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <button type="button" onClick={() => field.onChange("MALE")}
                      className={cn("flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 p-4 text-sm font-medium transition-all cursor-pointer",
                        field.value === "MALE"
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-400"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400")}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="10" cy="14" r="5"/><line x1="19" y1="5" x2="14.14" y2="9.86"/><polyline points="15 5 19 5 19 9"/>
                      </svg>
                      <span style={khmerFont} className="text-[13px]">បុរស (Male)</span>
                      <span style={khmerFont} className="text-[11px] font-semibold text-blue-600 bg-blue-100 dark:bg-blue-900 rounded-full px-2 py-0.5">Paternity · 7 ថ្ងៃ</span>
                    </button>
                    <button type="button" onClick={() => field.onChange("FEMALE")}
                      className={cn("flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 p-4 text-sm font-medium transition-all cursor-pointer",
                        field.value === "FEMALE"
                          ? "border-pink-500 bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300 dark:border-pink-400"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400")}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="5"/><line x1="12" y1="13" x2="12" y2="21"/><line x1="9" y1="18" x2="15" y2="18"/>
                      </svg>
                      <span style={khmerFont} className="text-[13px]">ស្ត្រី (Female)</span>
                      <span style={khmerFont} className="text-[11px] font-semibold text-pink-600 bg-pink-100 dark:bg-pink-900 rounded-full px-2 py-0.5">Maternity · 90 ថ្ងៃ</span>
                    </button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* ══════════════════════════════════════════════════════════════════
              FLEXIBLE LEAVE — ANNUAL / PERSONAL / SICK
          ══════════════════════════════════════════════════════════════════ */}
          {isFlexibleLeave && (
            <div className="space-y-4">

              <div className="flex items-center justify-between">
                <span style={khmerFont} className="text-[13px] font-semibold text-gray-700 dark:text-gray-300">
                  {isSegmentMode ? "កាលបរិច្ឆេទ & ប្រភេទ" : "កាលបរិច្ឆេទ"}
                </span>
                <button
                  type="button"
                  onClick={handleToggleSegment}
                  style={khmerFont}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium border transition-all",
                    isSegmentMode
                      ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-950 dark:text-blue-300"
                      : "border-gray-300 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400"
                  )}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    {isSegmentMode
                      ? <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>
                      : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}
                  </svg>
                  {isSegmentMode ? "ប្តូរទៅ Date Range" : "ប្តូរទៅ Segment Mode"}
                </button>
              </div>

              {/* ── DATE RANGE MODE ── */}
              {!isSegmentMode && (
                <div className="space-y-3">
                  <div className="flex flex-col gap-1.5">
                    <span style={khmerFont} className="text-[12px] font-medium text-gray-600 dark:text-gray-400">
                      ប្រភេទពេលវេលា
                    </span>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      {(["FULL", "HALF_AM", "HALF_PM", "CUSTOM"] as SlotType[]).map((slot) => (
                        <button
                          key={slot} type="button"
                          onClick={() => {
                            setDrSlotType(slot);
                            setDrShortcutH(0);
                            setDrShortcutM(0);
                            if (slot === "CUSTOM") {
                              setDrStartTime(getCurrentTime());
                              setDrEndTime(getCurrentTime());
                            }
                          }}
                          style={khmerFont}
                          className={cn(
                            "rounded-lg border px-2 py-2 text-[11px] font-medium transition-all text-center leading-snug",
                            drSlotType === slot
                              ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-300"
                              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                          )}
                        >
                          {SLOT_LABELS[slot]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {drSlotType === "CUSTOM" && (
                    <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Input
                          type="time" min="08:00" max="16:59" className="w-32"
                          value={drStartTime}
                          onChange={(e) => {
                            const newStart = e.target.value;
                            const endMin   = timeToMinutes(drEndTime);
                            const startMin = timeToMinutes(newStart);
                            setDrStartTime(newStart);
                            setDrShortcutH(0);
                            setDrShortcutM(0);
                            if (endMin <= startMin) {
                              setDrEndTime(minutesToTime(Math.min(startMin + 60, 17 * 60)));
                            }
                          }}
                        />
                        <span className="text-muted-foreground text-sm">→</span>
                        <Input
                          type="time" min="08:01" max="17:00" className="w-32"
                          value={drEndTime}
                          onChange={(e) => { setDrEndTime(e.target.value); setDrShortcutH(0); setDrShortcutM(0); }}
                        />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Input
                          type="number" min={0} max={9} step={1} placeholder="h"
                          className="w-14 text-center"
                          value={drShortcutH}
                          onKeyDown={blockFloatKeys}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const h = Math.max(0, parseInt(e.target.value) || 0);
                            const startMin = timeToMinutes(drStartTime);
                            const endMin = Math.min(startMin + h * 60 + drShortcutM, 17 * 60);
                            setDrShortcutH(h);
                            setDrEndTime(minutesToTime(endMin));
                          }}
                        />
                        <span style={khmerFont} className="text-[13px] text-muted-foreground">ម៉ោង</span>
                        <Input
                          type="number" min={0} max={59} step={5} placeholder="m"
                          className="w-14 text-center"
                          value={drShortcutM}
                          onKeyDown={blockFloatKeys}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const m = Math.max(0, parseInt(e.target.value) || 0);
                            const startMin = timeToMinutes(drStartTime);
                            const endMin = Math.min(startMin + drShortcutH * 60 + m, 17 * 60);
                            setDrShortcutM(m);
                            setDrEndTime(minutesToTime(endMin));
                          }}
                        />
                        <span style={khmerFont} className="text-[13px] text-muted-foreground">នាទី</span>
                      </div>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel style={khmerFont}>
                          {drSlotType === "FULL" ? "ថ្ងៃចាប់ផ្តើម (Start Date)" : "កាលបរិច្ឆេទ (Date)"}
                        </FormLabel>
                        <Popover modal={true} open={openStartDate} onOpenChange={setOpenStartDate}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button variant="outline" style={khmerFont}
                                className={cn("inline-flex justify-between text-[13px]", !field.value && "text-muted-foreground")}>
                                {field.value ? format(field.value, "dd MMM yyyy (EEEE)") : <span>ជ្រើសរើសថ្ងៃ</span>}
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
                                if (date) {
                                  if (drSlotType !== "FULL") {
                                    form.setValue("endDate", date, { shouldValidate: false });
                                  } else if (!endDateValue) {
                                    form.setValue("endDate", date, { shouldValidate: false });
                                  }
                                }
                                setOpenStartDate(false);
                              }}
                              disabled={(date: Date) => date < today || date.getFullYear() > currentYear}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {drSlotType === "FULL" && (
                    <FormField
                      control={form.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel style={khmerFont}>ថ្ងៃបញ្ចប់ (End Date)</FormLabel>
                          <Popover modal={true} open={openEndDate} onOpenChange={setOpenEndDate}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button variant="outline" style={khmerFont}
                                  className={cn("inline-flex justify-between text-[13px]", !field.value && "text-muted-foreground")}>
                                  {field.value ? format(field.value, "dd MMM yyyy (EEEE)") : <span>ជ្រើសរើសថ្ងៃបញ្ចប់</span>}
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
                                  date < today || date.getFullYear() > currentYear ||
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
                  )}

                  {startDateValue && drDurationLabel && drDurationLabel !== "—" && (
                    <div className={cn(
                      "flex items-center gap-2 rounded-lg border px-4 py-3",
                      isAnnual ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
                        : isSick ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
                        : "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950"
                    )}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        className={cn("shrink-0",
                          isAnnual ? "text-green-500" : isSick ? "text-red-500" : "text-blue-500")}>
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="16" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                      </svg>
                      <span style={khmerFont} className={cn("text-[13px]",
                        isAnnual ? "text-green-800 dark:text-green-300"
                          : isSick ? "text-red-800 dark:text-red-300"
                          : "text-blue-800 dark:text-blue-300")}>
                        {drSlotType === "FULL" && endDateValue ? (
                          <>
                            រយៈពេល: <strong>{drDurationLabel}</strong>
                            {" "}({format(startDateValue, "dd MMM")} – {format(endDateValue, "dd MMM yyyy")})
                          </>
                        ) : (
                          <>
                            <strong>{format(startDateValue, "dd MMM yyyy")}</strong>
                            {" · "}<strong>{drDurationLabel}</strong>
                            {drTimeRange && <> ({drTimeRange})</>}
                          </>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── SEGMENT MODE ── */}
              {isSegmentMode && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span style={khmerFont} className="text-[12px] text-gray-500 dark:text-gray-400">
                      បន្ថែម segment សម្រាប់ថ្ងៃផ្សេងៗ
                    </span>
                    <button
                      type="button"
                      onClick={addSegment}
                      style={khmerFont}
                      className="flex items-center gap-1 text-[12px] text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      បន្ថែម segment
                    </button>
                  </div>
                  {segments.map((seg, idx) => <SegmentRow key={seg.id} seg={seg} idx={idx} />)}
                  <TotalSummary />
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              CLASSIC MODE — SPECIAL
          ══════════════════════════════════════════════════════════════════ */}
          {!isFlexibleLeave && !isMaternity && selectedLeave && (
            <div className="space-y-4">
              <FormField
                control={form.control} name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel style={khmerFont}>Start Date</FormLabel>
                    <Popover modal={true} open={openStartDate} onOpenChange={setOpenStartDate}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" style={khmerFont}
                            className={cn("inline-flex justify-between text-[13px]", !field.value && "text-muted-foreground")}>
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <IoCalendarOutline className="h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value}
                          onSelect={(date) => { field.onChange(date); setOpenStartDate(false); }}
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
              <FormField
                control={form.control} name="endDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel style={khmerFont}>End Date</FormLabel>
                    <Popover modal={true} open={openEndDate} onOpenChange={setOpenEndDate}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" style={khmerFont}
                            className={cn("inline-flex justify-between text-[13px]", !field.value && "text-muted-foreground")}>
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <IoCalendarOutline className="h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value}
                          onSelect={(date) => { field.onChange(date); setOpenEndDate(false); }}
                          disabled={(date: Date) =>
                            date < today || (!!startDateValue && date < startDateValue)
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {startDateValue && endDateValue && (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-gray-500">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                  <span style={khmerFont} className="text-[13px] text-gray-700 dark:text-gray-300">
                    រយៈពេល: <strong>{differenceInDays(endDateValue, startDateValue) + 1} ថ្ងៃ</strong>
                    {" "}({format(startDateValue, "dd MMM")} – {format(endDateValue, "dd MMM yyyy")})
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Maternity auto-date info */}
          {isMaternity && maternityGender && startDateValue && endDateValue && (
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-gray-500">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <span style={khmerFont} className="text-[13px] text-gray-700 dark:text-gray-300">
                រយៈពេល: <strong>{MATERNITY_DAYS[maternityGender]} ថ្ងៃ</strong>
                {" "}({format(startDateValue, "dd MMM")} – {format(endDateValue, "dd MMM yyyy")})
              </span>
            </div>
          )}

          {/* ── Notes ── */}
          <FormField
            control={form.control} name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel style={khmerFont}>Reason (មូលហេតុ)</FormLabel>
                <FormControl>
                  <Textarea placeholder="Reason" {...field} />
                </FormControl>
                <FormDescription className="text-[12px]">
                  Add extra notes to support your request.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* ── Submit Button ── */}
          <Button
            type="submit"
            className="w-full"
            style={khmerFont}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                កំពុងដំណើរការ...
              </span>
            ) : isFlexibleLeave && isSegmentMode && segments.length > 1
              ? `Submit ${segments.length} Segments`
              : "Submit"
            }
          </Button>

        </form>
      </Form>
    </DialogWrapper>
  );
};

export default RequestForm;