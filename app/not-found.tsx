import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h2 className="text-2xl font-semibold">Page Not Found</h2>
      <p className="text-gray-500">The page you are looking for does not exist.</p>
      <Link
        href="/dashboard"
        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}