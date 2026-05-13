"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error.message, error?.digest);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4">
      <div className="flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
          <span className="text-red-600 text-xl">!</span>
        </div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          Something went wrong
        </h2>
        {process.env.NODE_ENV === "development" && (
          <pre className="text-xs bg-gray-100 dark:bg-gray-800 text-red-500 p-3 rounded max-w-sm overflow-auto">
            {error.message}
          </pre>
        )}
      </div>
      <button
        onClick={reset}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}