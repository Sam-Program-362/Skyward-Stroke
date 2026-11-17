import { useEffect, useState } from 'react';
import { usePWAInstall } from './usePWAInstall';

/**
 * In-app PWA Install button, Chrome Top-Bar Hider (Immersive Fullscreen),
 * guide modal, and Offline connectivity indicator.
 * Automatically hides when already in standalone/fullscreen mode or during active gameplay.
 */
export function PWAInstallBanner() {
  const {
    isInstallable,
    isInstalled,
    isFullscreen,
    isIOS,
    isAndroid,
    isOnline,
    autoFullscreen,
    setAutoFullscreen,
    enterFullscreen,
    toggleFullscreen,
    install,
  } = usePWAInstall();
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

      {/* Top-Right Controls: Hide Top Bar (Fullscreen) + Install App */}
      {!isInstalled && !isPlaying && (
        <div
          className="fixed z-40 flex items-center gap-2"
          style={{
            top: 'max(12px, env(safe-area-inset-top))',
            right: 'max(12px, env(safe-area-inset-right))',
          }}
        >
          {!isIOS && (
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              data-testid="pwa-fullscreen-btn"
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Hide Chrome Top Bar (Fullscreen)'}
              title="Hides the Chrome top bar and system navigation bars immediately"
              className={`flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-black shadow-lg border transition cursor-pointer ${
                isFullscreen
                  ? 'bg-emerald-600/95 hover:bg-emerald-700 text-white border-emerald-300/40'
                  : 'bg-indigo-950/90 hover:bg-slate-950 text-sky-200 border-sky-300/30'
              }`}
            >
              <span aria-hidden="true">{isFullscreen ? '🗗' : '⛶'}</span>
              <span>{isFullscreen ? 'Fullscreen Active' : 'Hide Top Bar'}</span>
            </button>
          )}

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

      {/* Standalone Installation & Chrome Top-Bar Removal Modal */}
      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-indigo-100 text-slate-800 max-h-[90vh] overflow-y-auto">
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
                    Full-screen native app experience · Zero Chrome top bar
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

            <div className="flex flex-col gap-2 mb-4">
              {isInstallable && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await install();
                    if (ok) setShowGuide(false);
                  }}
                  className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm shadow-md cursor-pointer"
                >
                  📲 Install Standalone App Now
                </button>
              )}

              {!isIOS && (
                <button
                  type="button"
                  onClick={async () => {
                    await enterFullscreen();
                    setShowGuide(false);
                  }}
                  className="w-full py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md cursor-pointer"
                >
                  ⛶ Hide Chrome Top Bar Immediately (Immersive Fullscreen)
                </button>
              )}
            </div>

            {!isIOS && (
              <div className="mb-3 p-3 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-black text-indigo-950">
                    Auto-Hide Chrome Top Bar on First Tap {isAndroid ? '(Android Default)' : ''}
                  </div>
                  <div className="text-[11px] text-indigo-800/80 font-medium">
                    Automatically enters native fullscreen & removes the Chrome URL bar on touch
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoFullscreen}
                  onClick={() => setAutoFullscreen(!autoFullscreen)}
                  className={`px-3 py-1.5 rounded-xl font-black text-xs shrink-0 transition cursor-pointer ${
                    autoFullscreen
                      ? 'bg-indigo-600 text-white shadow'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {autoFullscreen ? 'ON' : 'OFF'}
                </button>
              </div>
            )}

            <div className="space-y-2.5 text-xs text-slate-700 mb-5">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="font-black text-slate-900 mb-1">
                  📱 Android / Mobile Emulator (No Chrome Top Bar)
                </div>
                <p className="leading-relaxed">
                  1. Open the <strong>Shared App URL</strong> (or top-level tab) in Chrome, tap{' '}
                  <strong>⋮</strong> (top right), and choose <strong>Install app</strong> (if you
                  installed an older shortcut earlier, delete that icon first and re-install so
                  Android uses the updated <code>fullscreen</code> manifest with credentials).
                  <br />
                  2. Even if opened from a shortcut, <strong>Auto-Hide Chrome Top Bar</strong> is{' '}
                  <strong>ON</strong> by default on Android—your very first tap hides the Chrome
                  bar completely.
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
