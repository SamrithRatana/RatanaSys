"use client";

import { useEffect } from "react";

// Server components can read the session but can't refresh its cookie, so
// without this the login cookie hard-expires N days after sign-in no matter
// how often the app is used. Hitting /api/auth/session re-issues the cookie
// with a fresh expiry (next-auth does this at most once per `updateAge`).
const EVERY_MS = 6 * 60 * 60 * 1000;

export default function SessionKeepAlive() {
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" }).catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, EVERY_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return null;
}
