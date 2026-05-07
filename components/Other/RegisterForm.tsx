"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { orgDepartments, orgTitles } from "@/lib/dummy-data";
import { Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Password strength rules ──────────────────────────────────────────────────

const passwordRules = [
  { label: "At least 8 characters",        test: (p: string) => p.length >= 8 },
  { label: "At least one uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "At least one number",           test: (p: string) => /[0-9]/.test(p) },
  { label: "At least one symbol (!@#$…)",   test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function RegisterForm() {
  const router = useRouter();
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [touched, setTouched]           = useState(false); // show rules after first keystroke

  const [form, setForm] = useState({
    name:            "",
    password:        "",
    confirmPassword: "",
    department:      "",
    title:           "",
  });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === "password") setTouched(true);
  }

  const allRulesPassed = passwordRules.every((r) => r.test(form.password));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!allRulesPassed) {
      setError("Password does not meet the requirements.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!form.department) {
      setError("Please select a department.");
      return;
    }
    if (!form.title) {
      setError("Please select a job title.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:       form.name,
        password:   form.password,
        department: form.department,
        title:      form.title,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Something went wrong.");
      return;
    }

    router.push("/login?registered=true");
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">

      {/* ── Username ── */}
      <div className="grid gap-1">
        <Label htmlFor="name">Username</Label>
        <Input
          id="name"
          name="name"
          placeholder="e.g. john_doe"
          value={form.name}
          onChange={handleChange}
          required
        />
      </div>

      {/* ── Department ── */}
      <div className="grid gap-1">
        <Label htmlFor="department">Department</Label>
        <select
          id="department"
          name="department"
          value={form.department}
          onChange={handleChange}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          required
        >
          <option value="">Select department…</option>
          {orgDepartments.map((dept) => (
            <option key={dept.id} value={dept.label}>
              {dept.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Job Title ── */}
      <div className="grid gap-1">
        <Label htmlFor="title">Job Title</Label>
        <select
          id="title"
          name="title"
          value={form.title}
          onChange={handleChange}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          required
        >
          <option value="">Select title…</option>
          {orgTitles.map((t) => (
            <option key={t.id} value={t.label}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Password ── */}
      <div className="grid gap-1">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="Min. 8 chars with symbol"
            value={form.password}
            onChange={handleChange}
            required
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

        {/* Password strength checklist */}
        {touched && (
          <ul className="mt-2 grid gap-1">
            {passwordRules.map((rule) => {
              const passed = rule.test(form.password);
              return (
                <li
                  key={rule.label}
                  className={cn(
                    "flex items-center gap-1.5 text-[11px]",
                    passed ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                  )}
                >
                  {passed
                    ? <CheckCircle2 className="h-3 w-3 shrink-0" />
                    : <XCircle className="h-3 w-3 shrink-0" />
                  }
                  {rule.label}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Confirm Password ── */}
      <div className="grid gap-1">
        <Label htmlFor="confirmPassword">Confirm Password</Label>
        <div className="relative">
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type={showConfirm ? "text" : "password"}
            placeholder="Repeat your password"
            value={form.confirmPassword}
            onChange={handleChange}
            required
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
        {/* Inline match indicator */}
        {form.confirmPassword.length > 0 && (
          <p className={cn(
            "text-[11px] flex items-center gap-1 mt-1",
            form.password === form.confirmPassword
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-destructive"
          )}>
            {form.password === form.confirmPassword
              ? <><CheckCircle2 className="h-3 w-3" /> Passwords match</>
              : <><XCircle className="h-3 w-3" /> Passwords do not match</>
            }
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={loading || !allRulesPassed}>
        {loading ? "Creating account…" : "Create account"}
      </Button>

    </form>
  );
}
