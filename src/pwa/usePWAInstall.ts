import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const AUTO_FS_KEY = 'skyward_auto_fullscreen_v1';

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [autoFullscreen, setAutoFullscreen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(AUTO_FS_KEY);
      if (saved !== null) return saved === '1';
    } catch {
      // ignore storage errors
    }
    if (typeof window !== 'undefined') {
      const ua = window.navigator.userAgent.toLowerCase();
      const params = new URLSearchParams(window.location.search);
      return /android/.test(ua) || params.get('fullscreen') === '1';
    }
    return false;
  });
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const enterFullscreen = useCallback(async (): Promise<boolean> => {
    if (typeof document === 'undefined') return false;
    const docEl = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    try {
      if (document.fullscreenElement) {
        setIsFullscreen(true);
        return true;
      }
      if (typeof docEl.requestFullscreen === 'function') {
        await docEl.requestFullscreen({ navigationUI: 'hide' });
        setIsFullscreen(true);
        return true;
      }
      if (typeof docEl.webkitRequestFullscreen === 'function') {
        await docEl.webkitRequestFullscreen();
        setIsFullscreen(true);
        return true;
      }
    } catch {
      // Browser may block if not triggered by user gesture
    }
    return false;
  }, []);

  const exitFullscreen = useCallback(async (): Promise<void> => {
    if (typeof document === 'undefined') return;
    try {
      if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
    setIsFullscreen(false);
  }, []);

  const toggleFullscreen = useCallback(async (): Promise<boolean> => {
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      await exitFullscreen();
      return false;
    }
    return enterFullscreen();
  }, [enterFullscreen, exitFullscreen]);

  const updateAutoFullscreen = useCallback((enabled: boolean) => {
    setAutoFullscreen(enabled);
    try {
      localStorage.setItem(AUTO_FS_KEY, enabled ? '1' : '0');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const checkDisplayState = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(standalone);
      setIsFullscreen(Boolean(document.fullscreenElement) || standalone);
    };

    checkDisplayState();

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroidDevice = /android/.test(userAgent);
    setIsIOS(isIOSDevice);
    setIsAndroid(isAndroidDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      checkDisplayState();
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const mqStandalone = window.matchMedia('(display-mode: standalone)');
    const mqFullscreen = window.matchMedia('(display-mode: fullscreen)');
    mqStandalone.addEventListener?.('change', checkDisplayState);
    mqFullscreen.addEventListener?.('change', checkDisplayState);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mqStandalone.removeEventListener?.('change', checkDisplayState);
      mqFullscreen.removeEventListener?.('change', checkDisplayState);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Automatically hide Chrome top bar on first user interaction when autoFullscreen is active
  // (Default ON for Android & Home-Screen shortcut launches with ?fullscreen=1)
  useEffect(() => {
    if (!autoFullscreen || isInstalled || isFullscreen) return;

    const handleFirstGesture = () => {
      if (!document.fullscreenElement) {
        void enterFullscreen();
      }
    };

    window.addEventListener('pointerup', handleFirstGesture, { passive: true });
    window.addEventListener('touchend', handleFirstGesture, { passive: true });
    return () => {
      window.removeEventListener('pointerup', handleFirstGesture);
      window.removeEventListener('touchend', handleFirstGesture);
    };
  }, [autoFullscreen, isInstalled, isFullscreen, enterFullscreen]);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isFullscreen,
    isIOS,
    isAndroid,
    isOnline,
    autoFullscreen,
    setAutoFullscreen: updateAutoFullscreen,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
    install,
  };
}
