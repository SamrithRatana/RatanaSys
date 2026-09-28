"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

// Login page: "Login with KID" (Google / Telegram / Apple / email through one
// KID account) or email/username + password.
export function AuthForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const searchParams = useSearchParams();
  const registered = searchParams.get("registered") === "true";

  // ✅ Key fix — read callbackUrl from URL
  const callbackUrl = searchParams.get("callbackUrl") || "/portal";

  // ── KID: /api/kid/callback opens the session and redirects straight in;
  //    it only comes back here with ?kidError=… when something went wrong ──
  const kidError = searchParams.get("kidError");
  const [kidLoading, setKidLoading] = useState(false);

  function startKidLogin() {
    setKidLoading(true);
    window.location.href = `/api/kid/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }

  const KID_ERRORS: Record<string, string> = {
    not_configured: "KID login is not configured yet (KID_CLIENT_ID / KID_CLIENT_SECRET).",
    nonce_mismatch: "The KID login expired or was started in another browser. Please try again.",
    login_failed:   "KID login failed. Please try again.",
    access_denied:  "KID login was cancelled.",
  };
  const kidMessage = kidError ? (KID_ERRORS[kidError] ?? KID_ERRORS.login_failed) : null;

  // ── Credentials Login ─────────────────────────────────────
  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", {
      identifier,
      password,
      callbackUrl, // ✅ use dynamic callbackUrl
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("Invalid email/username or password.");
    } else if (res?.url) {
      window.location.href = res.url;
    }
  }

  return (
    <div className="grid gap-6">
      {registered && (
        <p className="text-sm text-center text-green-600 bg-green-50 border border-green-200 rounded-md py-2 px-3">
          Account created! You can now sign in.
        </p>
      )}

      {/* ── KID (Google / Telegram / Apple / Email in one account) ── */}
      <div className="grid gap-2">
        <Button type="button" onClick={startKidLogin} disabled={kidLoading} className="h-11 text-[15px]">
          {kidLoading ? "Signing in with KID…" : "Login with KID"}
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          Google · Telegram · Apple · Email — one KID account
        </p>
        {kidMessage && (
          <p className="text-sm text-center text-destructive">{kidMessage}</p>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>

      {/* ── Credentials ── */}
      <form onSubmit={handleCredentials} className="grid gap-4">
        <div className="grid gap-1">
          <Label htmlFor="identifier">Email or Username</Label>
          <Input
            id="identifier"
            type="text"
            placeholder="name@company.com or username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
