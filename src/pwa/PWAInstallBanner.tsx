import { useEffect, useState } from 'react';
import { usePWAInstall } from './usePWAInstall';

/**
 * In-app PWA Install button & guide modal + Offline connectivity indicator.
 * Automatically hides when already installed in standalone/fullscreen mode or during active gameplay.
 */
export function PWAInstallBanner() {
  const { isInstallable, isInstalled, isIOS, isOnline, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const syncState = () => {
      setIsPlaying(document.body.dataset.state === 'playing');
    };
    syncState();
    const obs = new MutationObserver(syncState);
    obs.observe(document.body, { attributes: true, attributeFilter: ['data-state'] });
    return () => obs.disconnect();
  }, []);

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowGuide(true);
  };

  return (
    <>
      {/* Non-intrusive Offline Mode Indicator */}
      {!isOnline && (
        <div
          role="status"
          className="fixed bottom-3 left-3 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg"
        >
          <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
          Offline Mode — Ready to play from device cache
        </div>
      )}

      {/* Prominent Install App Button (hidden when already installed or during active 3D track run) */}
      {!isInstalled && !isPlaying && (
        <div
          className="fixed z-40"
          style={{
            top: 'max(12px, env(safe-area-inset-top))',
            right: 'max(12px, env(safe-area-inset-right))',
          }}
        >
          <button
            type="button"
            onClick={handleInstallClick}
            data-testid="pwa-install-btn"
            aria-label="Install Skyward Stroke App to Device"
            className="flex items-center gap-2 rounded-2xl bg-slate-900/90 hover:bg-slate-950 text-white px-3.5 py-2 text-xs font-black shadow-lg border border-white/25 transition cursor-pointer"
          >
            <svg
              className="w-4 h-4 text-sky-300 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.4"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            <span>{isIOS ? 'Install on iOS' : 'Install App'}</span>
          </button>
        </div>
      )}

      {/* Standalone Installation Guide Modal (for iOS Safari, Android Emulators, or Preview Windows) */}
      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-indigo-100 text-slate-800">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <img
                  src="/pwa-192x192.png"
                  alt="Skyward Stroke App Icon"
                  className="w-12 h-12 rounded-2xl shadow-md"
                />
                <div>
                  <h3 id="pwa-install-title" className="text-lg font-black text-indigo-700">
                    Install Skyward Stroke
                  </h3>
                  <p className="text-xs font-semibold text-slate-500">
                    Full-screen native app experience · No browser bar
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close install dialog"
                onClick={() => setShowGuide(false)}
                className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {isInstallable && (
              <button
                type="button"
                onClick={async () => {
                  const ok = await install();
                  if (ok) setShowGuide(false);
                }}
                className="w-full mb-4 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm shadow-md cursor-pointer"
              >
                📲 Install Directly Now
              </button>
            )}

            <div className="space-y-2.5 text-xs text-slate-700 mb-5">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="font-black text-slate-900 mb-1">
                  📱 Android / Mobile Emulator (Chrome)
                </div>
                <p className="leading-relaxed">
                  Open this URL in a top-level browser tab, tap the browser menu{' '}
                  <strong>⋮</strong> (top right), and tap{' '}
                  <strong>Install app</strong> or <strong>Add to Home screen</strong>. It launches
                  full-screen without any browser address bar.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="font-black text-slate-900 mb-1">🍏 iPhone / iPad (Safari)</div>
                <p className="leading-relaxed">
                  1. Tap the <strong>Share</strong> button in the Safari toolbar.
                  <br />
                  2. Scroll down and tap <strong>Add to Home Screen</strong>.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="font-black text-slate-900 mb-1">
                  🖥️ Desktop (Chrome / Edge / Brave)
                </div>
                <p className="leading-relaxed">
                  Click the <strong>Install Skyward Stroke</strong> icon on the right side of the
                  address bar to install as a standalone desktop window.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}
