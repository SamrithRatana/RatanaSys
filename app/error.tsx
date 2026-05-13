"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Auto-retry after 2 seconds
    const timer = setTimeout(() => {
      reset();
    }, 2000);
    return () => clearTimeout(timer);
  }, [reset]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      <p className="text-sm text-gray-500">Reconnecting...</p>
    </div>
  );
}