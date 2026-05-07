"use client";

import DialogWrapper from "@/components/Common/DialogWrapper";
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
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import * as z from "zod";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PiCaretUpDownBold } from "react-icons/pi";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { BsCheckLg } from "react-icons/bs";
import { leaveStatus } from "@/lib/dummy-data";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LeaveStatus } from "@prisma/client";

type EditLeaveProps = {
  id: string;
  days: number;
  type: string;
  year: string;
  email: string;
  user: string;
  startDate: Date;
  currentStatus: LeaveStatus;
  headDepartment: string | null;
  headDepartmentApproved: boolean | null;
};

const EditLeave = ({
  id,
  days,
  type,
  year,
  email,
  user,
  startDate,
  currentStatus,
  headDepartment,
  headDepartmentApproved,
}: EditLeaveProps) => {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const isStep1 = !headDepartmentApproved;
  const isStep2 = headDepartmentApproved && currentStatus === LeaveStatus.INMODERATION;

  const formSchema = z.object({
    notes: z.string().max(500),
    status: z.enum(leaveStatus),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      notes: "",
    },
  });

  async function editLeave(values: z.infer<typeof formSchema>) {
    try {
      const formValues = {
        ...values,
        notes: values.notes,
        status: values.status,
        id,
        days,
        type,
        year,
        email,
        user,
        startDate,
      };

      const res = await fetch(`/api/leave/${id}`, {
        method: "PATCH",
        body: JSON.stringify(formValues),
      });

      if (res.ok) {
        toast.success(
          isStep2
            ? "Manager approved! Leave fully approved."
            : "Head Department approved! Awaiting Manager.",
          { duration: 4000 }
        );
        setOpen(false);
        router.refresh();
      } else {
        const err = await res.json();
        toast.error(err.error ?? "An error occurred", { duration: 6000 });
      }
    } catch (error) {
      console.error("An error occurred:", error);
      toast.error("An unexpected error occurred");
    }
  }

  return (
    <DialogWrapper
      btnTitle={isStep2 ? "Manager Approval" : "Head Dept Approval"}
      title="Edit Leave"
      isBtn={true}
      open={open}
      setOpen={() => setOpen(!open)}
    >
      {/* Approval stage banner */}
      <div className="rounded-md p-3 mb-4 text-sm bg-muted border border-border">
        {isStep1 && (
          <p className="text-amber-600 font-medium">
            📋 Step 1 of 2 — Awaiting <strong>Moderator (Head Department)</strong> approval
          </p>
        )}
        {isStep2 && (
          <p className="text-indigo-600 font-medium">
            ✅ Step 2 of 2 — <strong>Head Department</strong> ({headDepartment}) approved.
            Awaiting <strong>Admin (Manager)</strong> final approval.
          </p>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(editLeave)} className="space-y-8">
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Make a Decision</FormLabel>
                {/* ✅ modal={true} fixes typing/clicking closing the popover inside a Dialog */}
                <Popover modal={true}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn(
                          "justify-between",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value
                          ? leaveStatus.find((s) => s === field.value)
                          : "Select a decision"}
                        <PiCaretUpDownBold className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0">
                    <Command>
                      <CommandInput placeholder="Search a status..." />
                      <CommandEmpty>No status found.</CommandEmpty>
                      <CommandGroup>
                        {leaveStatus.map((status, i) => (
                          <CommandItem
                            value={status}
                            key={i}
                            onSelect={() => form.setValue("status", status)}
                          >
                            <BsCheckLg
                              className={cn(
                                "mr-2 h-4 w-4",
                                status === field.value ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {status}
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

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea placeholder="Notes" {...field} />
                </FormControl>
                <FormDescription>
                  Add extra notes to support your decision.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit">
            {isStep2 ? "Submit as Manager" : "Submit as Head Department"}
          </Button>
        </form>
      </Form>
    </DialogWrapper>
  );
};

export default EditLeave;
