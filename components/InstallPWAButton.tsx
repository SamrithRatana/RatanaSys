'use client';

import { useEffect, useState } from 'react';

declare global {
  interface Window {
    __pwaInstallPrompt: any;
  }
}

export default function InstallPWAButton() {
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Already fired before component mounted
    if (window.__pwaInstallPrompt) {
      setReady(true);
    }

    const onReady = () => setReady(true);
    const onInstalled = () => {
      setInstalled(true);
      setReady(false);
    };

    window.addEventListener('pwaInstallReady', onReady);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('pwaInstallReady', onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    const prompt = window.__pwaInstallPrompt;
    if (!prompt) return;

    prompt.prompt();

    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      window.__pwaInstallPrompt = null;
      setReady(false);
    }
  };

  // Don't show if already installed or prompt not ready
  if (!ready || installed) return null;

  return (
    <button
      onClick={handleInstall}
      className="fixed bottom-6 right-4 z-50 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all text-white px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold"
    >
      📲 Add to Home Screen
    </button>
  );
}