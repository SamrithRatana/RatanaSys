"use client";

/**
 * openExternalLink
 *
 * When your site runs inside a Telegram Mini App (WebView), every
 * anchor tag and window.open() call stays inside Telegram's browser.
 *
 * The official Telegram Mini App API provides:
 *   window.Telegram.WebApp.openLink(url, { try_instant_view: false })
 *
 * Passing `try_instant_view: false` tells Telegram to skip its own
 * reader view and hand the URL to the user's default phone browser.
 *
 * Usage:
 *   import { openExternalLink } from "@/lib/openExternalLink";
 *   openExternalLink("https://system.camprotec.com.kh/dashboard/...");
 */
export function openExternalLink(url: string): void {
  const tg = (window as any).Telegram?.WebApp;

  if (tg && typeof tg.openLink === "function") {
    // Official Telegram Mini App API — opens in phone's default browser
    tg.openLink(url, { try_instant_view: false });
  } else {
    // Fallback for regular browser or older Telegram versions
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * useExternalLinks
 *
 * Drop this hook into any layout or page component once.
 * It intercepts ALL anchor clicks on your domain that would otherwise
 * open inside Telegram's WebView and redirects them to the phone browser.
 *
 * Usage in your root layout or a client wrapper:
 *   import { useExternalLinks } from "@/lib/openExternalLink";
 *   export default function TelegramLayout() {
 *     useExternalLinks();
 *     return <>{children}</>;
 *   }
 */
export function useExternalLinks(): void {
  if (typeof window === "undefined") return;

  // Only activate inside a real Telegram Mini App context
  const tg = (window as any).Telegram?.WebApp;
  if (!tg || typeof tg.openLink !== "function") return;
  if (!tg.initData || tg.initData.length === 0) return;

  // Avoid adding duplicate listeners
  if ((window as any).__tgExternalLinksPatched) return;
  (window as any).__tgExternalLinksPatched = true;

  document.addEventListener("click", (e: MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    // Only intercept absolute https:// links (skip hash links, relative paths)
    if (!href.startsWith("https://") && !href.startsWith("http://")) return;

    // Skip links that are already handled as Mini App navigation (same domain)
    // Comment this out if you want ALL external links to open in phone browser
    const currentHost = window.location.hostname;
    try {
      const linkHost = new URL(href).hostname;
      if (linkHost === currentHost) return; // same-domain nav stays in WebView
    } catch {
      return;
    }

    e.preventDefault();
    tg.openLink(href, { try_instant_view: false });
  });
}