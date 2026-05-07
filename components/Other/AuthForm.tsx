"use client";

import { Icons } from "@/components/Other/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientSafeProvider, getProviders, signIn } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Script from "next/script";

type Tab = "credentials" | "google" | "telegram";

declare global {
  interface Window {
    onTelegramAuth: (user: any) => void;
  }
}

export function AuthForm() {
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider>>({});
  const [tab, setTab] = useState<Tab>("credentials");

  // Credentials state
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const searchParams = useSearchParams();
  const registered = searchParams.get("registered") === "true";

  useEffect(() => {
    getProviders().then((p) =>
      setProviders(p as Record<string, ClientSafeProvider>)
    );
  }, []);

  // ── Telegram callback (called by Telegram widget) ────────
  useEffect(() => {
    window.onTelegramAuth = async (tgUser: any) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/telegram/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tgUser),
        });
        const data = await res.json();

        if (!res.ok || !data.tempToken) {
          setError(data.error || "Telegram login failed");
          setLoading(false);
          return;
        }

        const result = await signIn("telegram-phone", {
          tempToken: data.tempToken,
          callbackUrl: "/portal",
          redirect: false,
        });

        if (result?.error) {
          setError("Authentication failed. Please try again.");
        } else if (result?.url) {
          window.location.href = result.url;
        }
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    };
  }, []);

  // ── Credentials Login ─────────────────────────────────────
  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      identifier,
      password,
      callbackUrl: "/portal",
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email/username or password.");
    } else if (res?.url) {
      window.location.href = res.url;
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "credentials", label: "Password" },
    { id: "google", label: "Google" },
    { id: "telegram", label: "Telegram" },
  ];

  return (
    <div className="grid gap-6">
      {/* Load Telegram widget script once */}
      <Script src="https://telegram.org/js/telegram-widget.js?22" strategy="lazyOnload" />

      {registered && (
        <p className="text-sm text-center text-green-600 bg-green-50 border border-green-200 rounded-md py-2 px-3">
          Account created! You can now sign in.
        </p>
      )}

      {/* Tab Bar */}
      <div className="flex rounded-md border overflow-hidden">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setError(""); }}
            className={`flex-1 py-2 text-sm transition-colors ${
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Credentials Tab ── */}
      {tab === "credentials" && (
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
          <p className="text-center text-sm text-muted-foreground">
            No account yet?{" "}
            <Link href="/register" className="underline underline-offset-4 hover:text-primary">
              Create one
            </Link>
          </p>
        </form>
      )}

      {/* ── Google Tab ── */}
      {tab === "google" && (
        <div className="grid gap-4">
          {Object.values(providers)
            .filter((p) => p.id === "google")
            .map((provider) => (
              <Button
                key={provider.name}
                variant="outline"
                type="button"
                onClick={() => signIn(provider.id, { callbackUrl: "/portal" })}
              >
                <Icons.google className="mr-2 h-4 w-4" />
                Continue with Google
              </Button>
            ))}
        </div>
      )}

      {/* ── Telegram Tab ── */}
      {tab === "telegram" && (
        <div className="grid gap-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {loading ? (
            <p className="text-sm text-center text-muted-foreground">Signing in…</p>
          ) : (
            <div className="flex justify-center">
              {/* Official Telegram Login Widget */}
              <script
                async
                src="https://telegram.org/js/telegram-widget.js?22"
                data-telegram-login="camprotec_auth_bot"
                data-size="large"
                data-onauth="onTelegramAuth(user)"
                data-request-access="write"
              />
            </div>
          )}
          <p className="text-xs text-center text-muted-foreground">
            Your Telegram profile will be used to sign in
          </p>
        </div>
      )}
    </div>
  );
}