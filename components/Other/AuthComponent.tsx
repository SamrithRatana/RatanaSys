import Link from "next/link";
import { AuthForm } from "./AuthForm";
import { Suspense } from "react";
import Image from "next/image";

const AuthComponent = () => {
  return (
    <div className="h-screen flex overflow-hidden bg-[#EBF8FF]">  {/* ← h-screen + overflow-hidden */}

      {/* LEFT — Decorative side */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden flex-col justify-between p-10">
        <div className="absolute inset-0 bg-[#EBF8FF]" />
        <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] rounded-full bg-[#BAE6FD] opacity-60" />
        <div className="absolute bottom-[-80px] right-[-80px] w-96 h-96 rounded-full bg-[#7DD3FC] opacity-40" />

        {/* Top — LMS Logo + grid tiles */}
        <div className="relative z-10">
          <div className="relative w-52 h-16 mb-6">
            <Image
              src="/LMS.png"
              alt="LMS System logo"
              fill
              className="object-contain object-left"
            />
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { icon: "📅", bg: "bg-[#BAE6FD]" },
              { icon: "🌴", bg: "bg-white" },
              { icon: "🌍", bg: "bg-white" },
              { icon: "💻", bg: "bg-[#BAE6FD]" },
            ].map((item, i) => (
              <div key={i} className={`${item.bg} rounded-2xl p-3 flex items-center justify-center text-xl aspect-square shadow-sm`}>
                {item.icon}
              </div>
            ))}
          </div>
        </div>

        {/* Center hero */}
        <div className="relative z-10 flex flex-col justify-center">
          <div className="bg-[#BAE6FD] rounded-2xl w-12 h-12 flex items-center justify-center text-2xl mb-4 shadow-sm">
            📅
          </div>
          <h2 className="text-3xl font-extrabold text-[#0E7490] leading-tight mb-3">
            Effortless Leave.<br />
            <span className="text-[#0284C7]">Happy Teams.</span>
          </h2>
          <p className="text-[#0E7490] text-sm leading-relaxed max-w-xs opacity-80">
            Streamline your employee time-off requests, approvals, and tracking with ease.
          </p>
          <div className="mt-6 flex items-end gap-4">
            <div className="relative">
              <div className="w-36 h-36 rounded-full bg-[#FCA5A5] opacity-70 absolute bottom-0 left-4" />
              <div className="relative z-10 text-7xl select-none">🧑‍💻</div>
            </div>
            <div className="text-5xl select-none mb-2">🌴</div>
          </div>
        </div>

        {/* Bottom grid tiles */}
        <div className="relative z-10 grid grid-cols-4 gap-3">
          {[
            { icon: "🌍", bg: "bg-white" },
            { icon: "😌", bg: "bg-[#BAE6FD]" },
            { icon: "", bg: "bg-white" },
            { icon: "", bg: "bg-[#BAE6FD]" },
          ].map((item, i) => (
            <div key={i} className={`${item.bg} rounded-2xl p-3 flex items-center justify-center text-xl aspect-square shadow-sm`}>
              {item.icon}
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT — Form card */}
      <div className="flex flex-1 items-center justify-center px-8 py-8">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-[#E0F2FE] p-10">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                LOGIN
              </h1>
              <p className="text-xs text-gray-500 mt-1 whitespace-nowrap">
                Access your Leave Management System
              </p>
            </div>
            <div className="relative w-48 h-20">
              <Image
                src="/Cam-Logo-1.png"
                alt="Cam. logo"
                fill
                className="object-contain"
              />
            </div>
          </div>

          <div className="border-t border-[#E0F2FE] mb-6" />

          <Suspense fallback={null}>
            <AuthForm />
          </Suspense>

          <p className="mt-6 text-xs text-center text-gray-400">
            By continuing, you agree to the{" "}
            <Link href="/terms" className="underline hover:text-[#0EA5E9] transition-colors">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-[#0EA5E9] transition-colors">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>

    </div>
  );
};

export default AuthComponent;