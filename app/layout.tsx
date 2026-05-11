import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import Providers from "./Provider";
import { Toaster } from "sonner";
import InstallPWAButton from "@/components/InstallPWAButton";

export const metadata: Metadata = {
  title: "LMS App",
  description: "Leave Management System by Camprotec",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LMS App",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#0088cc" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="LMS App" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <meta name="msapplication-TileColor" content="#0088cc" />
        <meta name="msapplication-TileImage" content="/icon-192x192.png" />

        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />

        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function () {
                navigator.serviceWorker
                  .register('/sw.js')
                  .then(function (reg) {
                    console.log('SW registered:', reg.scope);
                  })
                  .catch(function (err) {
                    console.error('SW registration failed:', err);
                  });
              });
            }
          `}
        </Script>

        <Script id="pwa-install-prompt" strategy="afterInteractive">
          {`
            window.addEventListener('beforeinstallprompt', function (e) {
              e.preventDefault();
              window.__pwaInstallPrompt = e;
              window.dispatchEvent(new Event('pwaInstallReady'));
            });
            window.addEventListener('appinstalled', function () {
              window.__pwaInstallPrompt = null;
            });
          `}
        </Script>
      </head>
      <body>
        <Providers
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <InstallPWAButton />
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  );
}