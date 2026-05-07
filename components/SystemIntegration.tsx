"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { ShieldCheck, Link2, Globe, X, CheckCircle2, AlertCircle } from "lucide-react";
import { FaTelegram } from "react-icons/fa";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type IntegrationUser = {
  accounts?: { provider: string }[];
  telegramId?: string | null;
};

type SystemIntegrationProps = {
  user: IntegrationUser;
};

// ─── Telegram global callback type ───────────────────────────────────────────

declare global {
  interface Window {
    onTelegramAuth: (user: any) => void;
  }
}

// ─── Google SVG ───────────────────────────────────────────────────────────────

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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SystemIntegration({ user }: SystemIntegrationProps) {
  const [open, setOpen]                         = useState(false);
  const [googleLoading, setGoogleLoading]       = useState(false);
  const [telegramLoading, setTelegramLoading]   = useState(false);
  const [telegramError, setTelegramError]       = useState("");
  const [showTelegramWidget, setShowTelegramWidget] = useState(false);
  const telegramRef = useRef<HTMLDivElement>(null);

  const hasGoogle   = user.accounts?.some((a) => a.provider === "google") ?? false;
  const hasTelegram = !!user.telegramId;
  const connectedCount = [true, hasGoogle, hasTelegram].filter(Boolean).length;

  // ── Inject Telegram widget when Connect is clicked ────────────────────────
  useEffect(() => {
    if (!showTelegramWidget || !telegramRef.current) return;

    telegramRef.current.innerHTML = "";

    // Same global callback as AuthForm
    window.onTelegramAuth = async (tgUser: any) => {
      setTelegramLoading(true);
      setTelegramError("");
      try {
        const res = await fetch("/api/telegram/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tgUser),
        });
        const data = await res.json();

        if (!res.ok || !data.tempToken) {
          setTelegramError(data.error || "Telegram linking failed");
          setTelegramLoading(false);
          return;
        }

        const result = await signIn("telegram-phone", {
          tempToken: data.tempToken,
          callbackUrl: window.location.href,
          redirect: false,
        });

        if (result?.error) {
          setTelegramError("Authentication failed. Please try again.");
        } else if (result?.url) {
          window.location.href = result.url;
        }
      } catch {
        setTelegramError("Network error. Please try again.");
      } finally {
        setTelegramLoading(false);
      }
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", "camprotec_auth_bot");
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    script.async = true;
    telegramRef.current.appendChild(script);
  }, [showTelegramWidget]);

  // ── Reset state when panel closes ─────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setShowTelegramWidget(false);
      setTelegramError("");
      setTelegramLoading(false);
      setGoogleLoading(false);
    }
  }, [open]);

  // ── Google link ───────────────────────────────────────────────────────────
  async function handleGoogleLink() {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: window.location.href });
    setGoogleLoading(false);
  }

  return (
    <>
      {/* ── Sidebar Trigger Button ── */}
      <button
        onClick={() => setOpen(true)}
        title="System Integration"
        className={cn(
          "group relative flex h-9 w-9 items-center justify-center rounded-lg transition-all",
          "hover:bg-[#0EA5E9]/10 hover:text-[#0EA5E9] text-muted-foreground",
          open && "bg-[#0EA5E9]/10 text-[#0EA5E9]"
        )}
      >
        <ShieldCheck className="h-5 w-5" />
        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white shadow">
          {connectedCount}
        </span>
        <span className="pointer-events-none absolute left-11 z-50 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md opacity-0 transition-opacity group-hover:opacity-100 border border-border">
          System Integration
        </span>
      </button>

      {/* ── Modal Overlay ── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-start"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />

          <div
            className="relative z-10 ml-3 mb-20 w-80 rounded-2xl border border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#0EA5E9]" />
                <h3 className="text-sm font-bold tracking-tight text-foreground">
                  System Integration
                </h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="px-5 pb-4 text-[11px] text-muted-foreground leading-relaxed">
              Manage your connected accounts and authentication methods.
            </p>

            <div className="h-px bg-border mx-5 mb-4" />

            <div className="flex flex-col gap-2.5 px-5 pb-5">

              {/* ── Domain — always connected ── */}
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-muted">
                  <Globe className="h-4 w-4 text-[#0EA5E9]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-none text-foreground mb-0.5">
                    system.camprotec.com.kh
                  </p>
                  <p className="text-[11px] text-muted-foreground">Primary domain — always active</p>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
                  <CheckCircle2 className="h-3 w-3" />
                  Connected
                </span>
              </div>

              {/* ── Google ── */}
              <div className={cn(
                "flex flex-col gap-2 rounded-xl border px-4 py-3 transition-all",
                hasGoogle
                  ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30"
                  : "border-dashed border-muted-foreground/30 bg-muted/30 dark:bg-muted/10"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    hasGoogle ? "bg-white shadow-sm dark:bg-muted" : "bg-muted/60 grayscale opacity-60"
                  )}>
                    <GoogleIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-none text-foreground mb-0.5">Google</p>
                    <p className="text-[11px] text-muted-foreground">
                      {hasGoogle ? "Signed in with Google OAuth" : "Link your Google account"}
                    </p>
                  </div>
                  {hasGoogle ? (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
                      <CheckCircle2 className="h-3 w-3" />
                      Connected
                    </span>
                  ) : (
                    <button
                      onClick={handleGoogleLink}
                      disabled={googleLoading}
                      className={cn(
                        "flex items-center gap-1 rounded-full border border-[#0EA5E9]/50 px-2.5 py-1 text-[11px] font-medium text-[#0EA5E9] transition-all shrink-0",
                        "hover:bg-[#0EA5E9]/10 hover:border-[#0EA5E9] active:scale-95",
                        googleLoading && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {googleLoading
                        ? <span className="h-3 w-3 rounded-full border-2 border-[#0EA5E9] border-t-transparent animate-spin" />
                        : <Link2 className="h-3 w-3" />
                      }
                      {googleLoading ? "Linking…" : "Connect"}
                    </button>
                  )}
                </div>
              </div>

              {/* ── Telegram ── */}
              <div className={cn(
                "flex flex-col gap-2 rounded-xl border px-4 py-3 transition-all",
                hasTelegram
                  ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30"
                  : "border-dashed border-muted-foreground/30 bg-muted/30 dark:bg-muted/10"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    hasTelegram ? "bg-white shadow-sm dark:bg-muted" : "bg-muted/60 grayscale opacity-60"
                  )}>
                    <FaTelegram className={cn("h-5 w-5", hasTelegram ? "text-[#26A5E4]" : "text-muted-foreground")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-none text-foreground mb-0.5">Telegram</p>
                    <p className="text-[11px] text-muted-foreground">
                      {hasTelegram ? "Telegram account linked" : "Link via Telegram bot"}
                    </p>
                  </div>
                  {hasTelegram ? (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
                      <CheckCircle2 className="h-3 w-3" />
                      Connected
                    </span>
                  ) : !showTelegramWidget ? (
                    <button
                      onClick={() => setShowTelegramWidget(true)}
                      className="flex items-center gap-1 rounded-full border border-[#26A5E4]/50 px-2.5 py-1 text-[11px] font-medium text-[#26A5E4] transition-all shrink-0 hover:bg-[#26A5E4]/10 hover:border-[#26A5E4] active:scale-95"
                    >
                      <Link2 className="h-3 w-3" />
                      Connect
                    </button>
                  ) : null}
                </div>

                {/* Telegram widget renders inline after Connect is clicked */}
                {!hasTelegram && showTelegramWidget && (
                  <div className="pt-1">
                    {telegramError && (
                      <p className="text-[11px] text-destructive mb-2">{telegramError}</p>
                    )}
                    {telegramLoading ? (
                      <p className="text-[11px] text-muted-foreground text-center py-2">Signing in…</p>
                    ) : (
                      <div ref={telegramRef} className="flex justify-center" />
                    )}
                    <p className="text-[10px] text-muted-foreground text-center mt-1">
                      Your Telegram profile will be used to link your account
                    </p>
                  </div>
                )}
              </div>

            </div>

            {/* Footer */}
            <div className="mx-5 mb-5 flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2.5">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                Connecting more accounts lets you sign in using any linked method.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
