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
        initData: string;
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

    // Only treat as Telegram if initData exists (real Mini App session)
    const isRealTelegram = !!tg && !!tg.initData && tg.initData.length > 0;

    if (isRealTelegram && tg) {
      tg.ready();
      tg.expand();
      setIsTelegram(true);

      if (typeof tg.checkHomeScreenStatus === 'function') {
        tg.checkHomeScreenStatus((status) => {
          if (status === 'added') {
            setAlreadyAdded(true);
            setShow(false);
          } else if (status === 'missed' || status === 'unknown') {
            setShow(true);
          } else if (status === 'unsupported') {
            setShow(false);
          }
        });
      } else {
        setShow(true);
      }
    } else {
      // Normal browser — use PWA install prompt
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
    const isRealTelegram = !!tg && !!tg.initData && tg.initData.length > 0;

    if (isTelegram && isRealTelegram && tg) {
      tg.addToHomeScreen();
      setTimeout(() => {
        tg.checkHomeScreenStatus?.((status) => {
          if (status === 'added') {
            setAlreadyAdded(true);
            setShow(false);
          }
        });
      }, 2000);
    } else {
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