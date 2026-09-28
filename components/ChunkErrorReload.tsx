"use client";

import { useEffect } from "react";

// After every deploy, a browser tab left open still references the OLD
// build's JS chunk URLs. Clicking anything that loads code on demand
// (next/dynamic — the leave request dialog, balances table, etc.) then
// fails with a chunk-load error that is NOT a React render error, so
// app/error.tsx never sees it: nothing happens, or the click silently
// does nothing, until the user manually refreshes the page.
// This catches that class of error anywhere in the app and reloads once.
const CHUNK_ERROR = /ChunkLoadError|Loading chunk [\d]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i;
const RELOAD_GUARD_KEY = "app_chunk_reload_guard";
const GUARD_WINDOW_MS = 10_000;

function isChunkError(err: unknown): boolean {
  if (!err) return false;
  const name = (err as { name?: string })?.name ?? "";
  const message = (err as { message?: string })?.message ?? String(err);
  return name === "ChunkLoadError" || CHUNK_ERROR.test(message);
}

function reloadOnce() {
  // Guard against a reload loop if the site is genuinely offline
  const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
  if (Date.now() - last < GUARD_WINDOW_MS) return;
  sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  window.location.reload();
}

export default function ChunkErrorReload() {
  useEffect(() => {
    function onError(e: ErrorEvent) {
      if (isChunkError(e.error) || isChunkError(e.message)) reloadOnce();
    }
    function onRejection(e: PromiseRejectionEvent) {
      if (isChunkError(e.reason)) reloadOnce();
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
