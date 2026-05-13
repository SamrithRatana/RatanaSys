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
  const [showError, setShowError] = useState(false);
  const maxRetries = 3;

  // ✅ Wrap reset in useCallback to stabilize the reference
  const stableReset = useCallback(() => reset(), [reset]);

  useEffect(() => {
    console.error("App error:", error.message, error?.digest);

    if (retryCount < maxRetries) {
      const timer = setTimeout(() => {
        setRetryCount((prev) => prev + 1);
        stableReset();
      }, 1500 * (retryCount + 1));

      return () => clearTimeout(timer);
    } else {
      setShowError(true);
    }
  }, [error, retryCount, stableReset]); // ✅ no more eslint warning

  if (!showError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <p className="text-sm text-gray-500">
          {retryCount === 0
            ? "Connecting..."
            : `Retrying... (${retryCount}/${maxRetries})`}
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
        <div className="text-xs bg-red-50 text-red-600 p-3 rounded max-w-sm overflow-auto break-all border border-red-200">
          <p><strong>Error:</strong> {error.message}</p>
          {error.digest && <p><strong>Digest:</strong> {error.digest}</p>}
        </div>
      </div>
      <button
        onClick={() => {
          setRetryCount(0);
          setShowError(false);
          stableReset();
        }}
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