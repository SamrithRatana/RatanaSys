"use client";

import { useEffect, useState, useCallback } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 2; // ✅ reduced — no infinite loop

  const stableReset = useCallback(() => reset(), [reset]);

  useEffect(() => {
    console.error("App error:", error.message, error?.digest);

    // ✅ Only retry if it's a connection error
    const isConnectionError =
      error.message?.includes("Connection closed") ||
      error.message?.includes("fetch") ||
      error.message?.includes("network") ||
      error.message?.includes("Failed to load");

    if (isConnectionError && retryCount < maxRetries) {
      const timer = setTimeout(() => {
        setRetryCount((prev) => prev + 1);
        stableReset();
      }, 2000 * (retryCount + 1)); // 2s, 4s

      return () => clearTimeout(timer);
    } else if (isConnectionError && retryCount >= maxRetries) {
      // ✅ After retries — ONE hard reload, then stop
      const timer = setTimeout(() => {
        window.location.reload();
      }, 1000);
      return () => clearTimeout(timer);
    }
    // ✅ Non-connection errors — just show error immediately, no retry loop
  }, [error, retryCount, stableReset]);

  const isRetrying =
    (error.message?.includes("Connection closed") ||
      error.message?.includes("fetch")) &&
    retryCount < maxRetries;

  if (isRetrying) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <p className="text-sm text-gray-500">
          {retryCount === 0 ? "Connecting..." : `Retrying... (${retryCount}/${maxRetries})`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4">
      <div className="flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
          <span className="text-red-600 text-xl">!</span>
        </div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          Something went wrong
        </h2>
        <p className="text-xs text-gray-400">{error.message}</p>
      </div>
      <button
        onClick={() => { setRetryCount(0); stableReset(); }}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
      >
        Try again
      </button>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
      >
        Reload page
      </button>
    </div>
  );
}