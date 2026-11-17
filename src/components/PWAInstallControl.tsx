import { useEffect, useState } from 'react';
import { getInstallPlatformInfo } from '../utils/pwa';
import { useServiceWorkerStatus } from '../register-sw';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const swStatus = useServiceWorkerStatus();

  useEffect(() => {
    const mq = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayChange = () => {
      setIsStandalone(
        Boolean(mq?.matches) ||
          (window.navigator as unknown as { standalone?: boolean }).standalone === true
      );
    };
    mq?.addEventListener?.('change', onDisplayChange);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mq?.removeEventListener?.('change', onDisplayChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsStandalone(true);
      setDeferredPrompt(null);
    }
    return outcome;
  };

  const platformInfo = getInstallPlatformInfo(
    typeof navigator !== 'undefined' ? navigator.userAgent : '',
    isStandalone,
    Boolean(deferredPrompt)
  );

  return {
    isStandalone,
    isOnline,
    swStatus,
    canPromptDirectly: Boolean(deferredPrompt),
    platformInfo,
    promptInstall,
  };
}

export function PWAInstallControl({ onActionSound }: { onActionSound?: () => void }) {
  const { isStandalone, isOnline, swStatus, canPromptDirectly, platformInfo, promptInstall } =
    usePWAInstall();
  const [openModal, setOpenModal] = useState(false);

  const handlePrimaryClick = async () => {
    onActionSound?.();
    if (canPromptDirectly) {
      const res = await promptInstall();
      if (res === 'unavailable') setOpenModal(true);
    } else {
      setOpenModal(true);
    }
  };

  return (
    <>
      {!isOnline && (
        <div
          role="status"
          className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg"
        >
          <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
          Offline — Pass-through Service Worker requires network for new requests
        </div>
      )}

      <button
        type="button"
        data-testid="pwa-install-btn"
        onClick={handlePrimaryClick}
        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
          isStandalone
            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
            : canPromptDirectly
              ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
              : 'bg-white text-indigo-800 hover:bg-indigo-50 shadow-sm'
        }`}
      >
        <img
          src="/icon.svg"
          alt=""
          aria-hidden="true"
          className="w-4 h-4 rounded-[4px] shrink-0"
        />
        <span>{platformInfo.label}</span>
      </button>

      {openModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-indigo-100 text-left">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <img
                  src="/icon.svg"
                  alt="Skyward Stroke App Icon"
                  className="w-14 h-14 rounded-2xl shadow-md shrink-0"
                />
                <div>
                  <h2 id="pwa-modal-title" className="text-xl font-black text-indigo-700">
                    Install Skyward Stroke (PWA)
                  </h2>
                  <p className="text-xs text-slate-600">
                    Standalone Android WebAPK, iOS Home Screen & Desktop App
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close install dialog"
                onClick={() => setOpenModal(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Live PWA System Telemetry Badges */}
            <div className="grid grid-cols-3 gap-2 mb-4 text-center">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Manifest
                </div>
                <div className="text-xs font-black text-emerald-700 mt-0.5">
                  ✓ Standalone
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Service Worker
                </div>
                <div className="text-xs font-black text-indigo-700 mt-0.5">
                  {swStatus === 'registered' ? '✓ Active (/sw.js)' : swStatus}
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Display Mode
                </div>
                <div className="text-xs font-black text-slate-800 mt-0.5">
                  {isStandalone ? 'Standalone' : 'Browser Tab'}
                </div>
              </div>
            </div>

            {canPromptDirectly && (
              <button
                type="button"
                onClick={async () => {
                  await promptInstall();
                  setOpenModal(false);
                }}
                className="w-full mb-4 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-md cursor-pointer"
              >
                📲 Install App Now
              </button>
            )}

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 mb-4 space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-indigo-900">
                Installation Instructions
              </div>
              {platformInfo.steps.map((step, i) => (
                <p key={i} className="text-xs text-slate-700 leading-relaxed">
                  {step}
                </p>
              ))}
              <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/80">
                {platformInfo.note}
              </p>
            </div>

            {/* Icon Set Preview (Vector SVG + 192px/512px/Maskable PNGs) */}
            <div className="flex items-center justify-between gap-3 bg-indigo-950/95 text-white rounded-2xl p-3.5 mb-5">
              <div className="flex items-center gap-2.5">
                <img
                  src="/icon.svg"
                  alt="Vector Logo"
                  className="w-10 h-10 rounded-xl border border-white/20"
                />
                <img
                  src="/icon-maskable-512.png"
                  alt="Maskable Android Icon"
                  className="w-10 h-10 rounded-full border border-white/20"
                />
                <div>
                  <div className="text-xs font-bold">Configured PWA Assets</div>
                  <div className="text-[11px] text-indigo-200">
                    /manifest.webmanifest · /icon.svg · 192px & 512px Maskable
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpenModal(false)}
              className="w-full py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
