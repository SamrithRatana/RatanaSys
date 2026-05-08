import type { Metadata } from "next";
import "./globals.css";
import Providers from "./Provider";
import { Toaster } from "sonner"; // ← add this import
export const metadata: Metadata = {
  title: "CAM LMS",
  description: "Leave Management System by Camprotec",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="">
        <Providers
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors position="top-right" /> {/* ← add this */}
        </Providers>
      </body>
    </html>
  );
}