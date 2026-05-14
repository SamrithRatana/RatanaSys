"use client";

import { useEffect, useState, useCallback } from "react";

const RETRY_KEY = "app_error_retry_count";
const maxRetries = 2;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [retryCount, setRetryCount] = useState<number>(() => {
    // Read persisted count so remounts don't reset it
    const stored = sessionStorage.getItem(RETRY_KEY);
    return stored ? parseInt(stored, 10) : 0;
  });

  const stableReset = useCallback(() => reset(), [reset]);

  const isConnectionError =
    error.message?.includes("Connection closed") ||
    error.message?.includes("fetch") ||
    error.message?.includes("network") ||
    error.message?.includes("Failed to load");

  useEffect(() => {
    console.error("App error:", error.message, error?.digest);

    if (isConnectionError) {
      if (retryCount < maxRetries) {
        const nextCount = retryCount + 1;
        const delay = 2000 * nextCount;

        const timer = setTimeout(() => {
          sessionStorage.setItem(RETRY_KEY, String(nextCount));
          setRetryCount(nextCount);
          stableReset();
        }, delay);

        return () => clearTimeout(timer);
      } else {
        // Exhausted retries — hard reload and clear counter
        const timer = setTimeout(() => {
          sessionStorage.removeItem(RETRY_KEY);
          window.location.reload();
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [error, retryCount, stableReset, isConnectionError]);

  const isRetrying = isConnectionError && retryCount < maxRetries;

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
        onClick={() => {
          sessionStorage.removeItem(RETRY_KEY);
          setRetryCount(0);
          stableReset();
        }}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
      >
        Try again
      </button>
      <button
        onClick={() => {
          sessionStorage.removeItem(RETRY_KEY);
          window.location.reload();
        }}
        className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
      >
        Reload page
      </button>
    </div>
  );
}