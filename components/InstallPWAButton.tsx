'use client';

import { useEffect, useState } from 'react';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        addToHomeScreen: () => void;
        checkHomeScreenStatus: (
          callback: (status: 'unsupported' | 'unknown' | 'added' | 'missed') => void
        ) => void;
        platform: string;
        version: string;
      };
    };
    __pwaInstallPrompt: any;
  }
}

export default function InstallPWAButton() {
  const [show, setShow] = useState(false);
  const [isTelegram, setIsTelegram] = useState(false);
  const [alreadyAdded, setAlreadyAdded] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (tg) {
      // Running inside Telegram Mini App
      tg.ready();
      setIsTelegram(true);

      // Check if already added to home screen
      if (typeof tg.checkHomeScreenStatus === 'function') {
        tg.checkHomeScreenStatus((status) => {
          if (status === 'added') {
            setAlreadyAdded(true);
            setShow(false);
          } else if (status === 'missed' || status === 'unknown') {
            setShow(true);
          } else if (status === 'unsupported') {
            // Device doesn't support it, hide button
            setShow(false);
          }
        });
      } else {
        // Older Telegram version — show button anyway
        setShow(true);
      }
    } else {
      // Not Telegram — fallback to browser PWA install
      if (window.__pwaInstallPrompt) {
        setShow(true);
      }
      const onReady = () => setShow(true);
      window.addEventListener('pwaInstallReady', onReady);
      return () => window.removeEventListener('pwaInstallReady', onReady);
    }
  }, []);

  const handleInstall = async () => {
    const tg = window.Telegram?.WebApp;

    if (isTelegram && tg) {
      // Use Telegram's native add to home screen
      tg.addToHomeScreen();

      // Re-check status after attempt
      setTimeout(() => {
        tg.checkHomeScreenStatus?.((status) => {
          if (status === 'added') {
            setAlreadyAdded(true);
            setShow(false);
          }
        });
      }, 2000);
    } else {
      // Browser PWA fallback
      const prompt = window.__pwaInstallPrompt;
      if (!prompt) return;
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') {
        window.__pwaInstallPrompt = null;
        setShow(false);
      }
    }
  };

  if (!show || alreadyAdded) return null;

  return (
    <button
      onClick={handleInstall}
      className="fixed bottom-6 right-4 z-50 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all text-white px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold"
    >
      📲 Add to Home Screen
    </button>
  );
}