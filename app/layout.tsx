import type { Metadata } from "next";
import Script from "next/script"; // Import this
import "./globals.css";
import Providers from "./Provider";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "CAM LMS",
  description: "Leave Management System by Camprotec",
  // --- PWA SETTINGS ---
  manifest: "/manifest.json", 
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CAM LMS",
  },
  // --------------------
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Load Telegram SDK */}
        <Script 
          src="https://telegram.org/js/telegram-web-app.js" 
          strategy="beforeInteractive" 
        />
      </head>
      <body className="">
        <Providers
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  );
}