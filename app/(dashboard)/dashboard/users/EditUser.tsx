"use client";

import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import DialogWrapper from "@/components/Common/DialogWrapper";
import { Separator } from "@/components/ui/separator";
import toast from "react-hot-toast";
import { IoPencil } from "react-icons/io5";
import { FaTelegram } from "react-icons/fa";
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PiCaretUpDownBold } from "react-icons/pi";
import { cn } from "@/lib/utils";
import { UserRoles, orgDepartments, orgTitles } from "@/lib/dummy-data";
import { BsCheckLg } from "react-icons/bs";
import { Account, User } from "@prisma/client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// ─── Types ───────────────────────────────────────────────────────────────────

export type UserWithAccounts = User & {
  accounts: Account[];
};

type EditUserProps = {
  user: UserWithAccounts;
};

// ─── Google SVG ──────────────────────────────────────────────────────────────

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

// ─── Integration Badge ────────────────────────────────────────────────────────

function IntegrationBadge({
  connected,
  icon,
  label,
}: {
  connected: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
        connected
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-dashed border-muted-foreground/30 bg-muted/40 text-muted-foreground opacity-50"
      )}
    >
      <span className={cn("flex h-4 w-4 items-center justify-center", !connected && "grayscale")}>
        {icon}
      </span>
      {label}
      {connected && <ShieldCheck className="h-3 w-3 text-emerald-500" />}
    </div>
  );
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const formSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email"),
    phone: z.string().max(50).optional().or(z.literal("")),
    manager: z.string().optional().or(z.literal("")),
    department: z.string().optional().or(z.literal("")),
    title: z.string().optional().or(z.literal("")),
    role: z.enum(UserRoles as unknown as [string, ...string[]]),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters")
      .optional()
      .or(z.literal("")),
    confirmPassword: z.string().optional().or(z.literal("")),
  })
  .refine(
    (data) => {
      if (data.password && data.password !== data.confirmPassword) return false;
      return true;
    },
    { message: "Passwords do not match", path: ["confirmPassword"] }
  );

type FormValues = z.infer<typeof formSchema>;

// ─── Component ───────────────────────────────────────────────────────────────

const EditUser = ({ user }: EditUserProps) => {
  const [open, setOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();

  const hasGoogle   = user.accounts.some((a) => a.provider === "google");
  const hasTelegram = !!user.telegramId;
  const hasPassword = !!user.password;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name:            user.name       ?? "",
      email:           user.email      ?? "",
      phone:           user.phone      ?? "",
      manager:         user.manager    ?? "",
      department:      user.department ?? "",
      title:           user.title      ?? "",
      role:            user.role,
      password:        "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: FormValues) {
    const id = user.id;
    const { confirmPassword, ...payload } = values;
    try {
      const res = await fetch("/api/user/userId", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, id }),
      });
      if (res.ok) {
        toast.success("User updated successfully", { duration: 4000 });
        setOpen(false);
        router.refresh();
      } else {
        const msg = await res.text();
        toast.error(`Error: ${msg}`, { duration: 6000 });
      }
    } catch (err) {
      console.error(err);
      toast.error("An unexpected error occurred");
    }
  }

  return (
    <>
      {/* ✅ ONE trigger button only — icon prop removed from DialogWrapper */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
      >
        <IoPencil size={16} />
      </Button>

      <DialogWrapper
        title="Edit User"
        isBtn={false}
        // ❌ icon={IoPencil} removed — was causing the second pencil icon
        open={open}
        setOpen={() => setOpen(!open)}
      >
        <div className="max-h-[70vh] overflow-y-auto pr-1">

          {/* ── Integration Status ── */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Integrations:</span>
            <IntegrationBadge
              connected={hasGoogle}
              icon={<GoogleIcon className="h-4 w-4" />}
              label="Google"
            />
            <IntegrationBadge
              connected={hasTelegram}
              icon={<FaTelegram className="h-4 w-4 text-[#26A5E4]" />}
              label="Telegram"
            />
          </div>

          <Separator className="mb-6" />

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

              {/* ── Name ── */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Full name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Email ── */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@company.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Phone ── */}
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 016285116" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Manager ── */}
              <FormField
                control={form.control}
                name="manager"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Manager</FormLabel>
                    <FormControl>
                      <Input placeholder="Manager name or email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Department ── */}
              <FormField
                control={form.control}
                name="department"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Department</FormLabel>
                    <Popover modal={true}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn("justify-between", !field.value && "text-muted-foreground")}
                          >
                            {field.value
                              ? orgDepartments.find((d) => d.label === field.value)?.label
                              : "Select a department"}
                            <PiCaretUpDownBold className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[220px] p-0">
                        <Command>
                          <CommandInput placeholder="Search department…" />
                          <CommandEmpty>No department found.</CommandEmpty>
                          <CommandGroup>
                            {orgDepartments.map((dpt) => (
                              <CommandItem
                                value={dpt.label}
                                key={dpt.id}
                                onSelect={() => form.setValue("department", dpt.label)}
                              >
                                <BsCheckLg className={cn("mr-2 h-4 w-4", dpt.label === field.value ? "opacity-100" : "opacity-0")} />
                                {dpt.label}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </FormItem>
                )}
              />

              {/* ── Title ── */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Job Title</FormLabel>
                    <Popover modal={true}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn("justify-between", !field.value && "text-muted-foreground")}
                          >
                            {field.value
                              ? orgTitles.find((t) => t.label === field.value)?.label
                              : "Select a title"}
                            <PiCaretUpDownBold className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[220px] p-0">
                        <Command>
                          <CommandInput placeholder="Search title…" />
                          <CommandEmpty>No title found.</CommandEmpty>
                          <CommandGroup>
                            {orgTitles.map((title) => (
                              <CommandItem
                                value={title.label}
                                key={title.id}
                                onSelect={() => form.setValue("title", title.label)}
                              >
                                <BsCheckLg className={cn("mr-2 h-4 w-4", title.label === field.value ? "opacity-100" : "opacity-0")} />
                                {title.label}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </FormItem>
                )}
              />

              {/* ── Role ── */}
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Role</FormLabel>
                    <Popover modal={true}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn("justify-between", !field.value && "text-muted-foreground")}
                          >
                            {field.value ?? "Select a role"}
                            <PiCaretUpDownBold className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[220px] p-0">
                        <Command>
                          <CommandInput placeholder="Search role…" />
                          <CommandEmpty>No role found.</CommandEmpty>
                          <CommandGroup>
                            {(UserRoles as unknown as string[]).map((role, i) => (
                              <CommandItem
                                value={role}
                                key={i}
                                onSelect={() => form.setValue("role", role as FormValues["role"])}
                              >
                                <BsCheckLg className={cn("mr-2 h-4 w-4", role === field.value ? "opacity-100" : "opacity-0")} />
                                {role}
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

              {/* ── Password Section ── */}
              <div className="rounded-lg border border-dashed border-muted-foreground/40 bg-muted/30 p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {hasPassword ? "Change Password" : "Set Password"}
                  </p>
                  {!hasPassword && (
                    <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50">
                      No password set
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground -mt-2">
                  {hasPassword
                    ? "Leave blank to keep the existing password."
                    : "This user signed in via Google or Telegram. Set a password to allow credentials login too."}
                </p>

                {/* New Password */}
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">New Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Min. 6 characters"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Confirm Password */}
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Confirm Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showConfirm ? "text" : "password"}
                            placeholder="Repeat password"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirm((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button type="submit" className="w-full">
                Save Changes
              </Button>

            </form>
          </Form>

        </div>
      </DialogWrapper>
    </>
  );
};

export default EditUser;