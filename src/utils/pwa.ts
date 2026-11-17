export interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

export interface WebAppManifest {
  id?: string;
  name: string;
  short_name: string;
  description?: string;
  start_url: string;
  scope?: string;
  display: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
  background_color: string;
  theme_color: string;
  orientation?: string;
  prefer_related_applications?: boolean;
  icons: ManifestIcon[];
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  has192: boolean;
  has512: boolean;
  hasMaskable512: boolean;
}

/**
 * Validates a Web App Manifest object against Android / Chromium PWA installability criteria.
 */
export function validateWebAppManifest(raw: unknown): ManifestValidationResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return {
      valid: false,
      errors: ['Manifest must be a valid JSON object.'],
      has192: false,
      has512: false,
      hasMaskable512: false,
    };
  }

  const m = raw as Partial<WebAppManifest>;

  if (!m.name || typeof m.name !== 'string' || !m.name.trim()) {
    errors.push('Manifest requires a non-empty "name".');
  }
  if (!m.short_name || typeof m.short_name !== 'string' || !m.short_name.trim()) {
    errors.push('Manifest requires a non-empty "short_name".');
  }
  if (m.start_url !== '/') {
    errors.push('Manifest "start_url" must be "/".');
  }
  if (m.display !== 'standalone' && m.display !== 'fullscreen' && m.display !== 'minimal-ui') {
    errors.push('Manifest "display" must be a standalone/app display mode.');
  }
  if (m.prefer_related_applications === true) {
    errors.push('Manifest "prefer_related_applications" must not be true.');
  }

  const icons = Array.isArray(m.icons) ? m.icons : [];
  const has192 = icons.some(
    ic => ic && ic.sizes === '192x192' && ic.type === 'image/png' && Boolean(ic.src)
  );
  const has512 = icons.some(
    ic =>
      ic &&
      ic.sizes === '512x512' &&
      ic.type === 'image/png' &&
      (!ic.purpose || ic.purpose === 'any') &&
      Boolean(ic.src)
  );
  const hasMaskable512 = icons.some(
    ic =>
      ic &&
      ic.sizes === '512x512' &&
      ic.type === 'image/png' &&
      ic.purpose === 'maskable' &&
      Boolean(ic.src)
  );

  if (!has192) errors.push('Manifest requires a 192x192 PNG icon.');
  if (!has512) errors.push('Manifest requires a 512x512 PNG icon.');
  if (!hasMaskable512) errors.push('Manifest requires a 512x512 maskable PNG icon.');

  return {
    valid: errors.length === 0,
    errors,
    has192,
    has512,
    hasMaskable512,
  };
}

/**
 * Pure predicate matching the pass-through Service Worker fetch filter in `/sw.js`.
 * Ignores non-GET requests, cross-origin requests, `/api/*`, and `/login`.
 */
export function shouldPassThroughFetch(
  method: string,
  requestUrl: string,
  selfOrigin: string
): boolean {
  if (method.toUpperCase() !== 'GET') return false;
  try {
    const url = new URL(requestUrl);
    if (url.origin !== selfOrigin) return false;
    if (url.pathname.startsWith('/api/') || url.pathname === '/login') return false;
    return true;
  } catch {
    return false;
  }
}

export type InstallPlatformKind =
  | 'installed-standalone'
  | 'prompt-ready'
  | 'android-browser'
  | 'ios-safari'
  | 'desktop-browser';

export interface InstallPlatformInfo {
  kind: InstallPlatformKind;
  label: string;
  canPromptDirectly: boolean;
  steps: string[];
  note: string;
}

/**
 * Determines the current PWA installation state and platform-specific guidance.
 */
export function getInstallPlatformInfo(
  userAgent: string,
  isStandalone: boolean,
  hasDeferredPrompt: boolean
): InstallPlatformInfo {
  if (isStandalone) {
    return {
      kind: 'installed-standalone',
      label: 'Installed App (Standalone)',
      canPromptDirectly: false,
      steps: ['Skyward Stroke is currently running in standalone app mode without browser chrome.'],
      note: 'Standalone display mode active.',
    };
  }

  const ua = (userAgent || '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);

  if (hasDeferredPrompt) {
    return {
      kind: 'prompt-ready',
      label: isAndroid ? 'Install Android App' : 'Install App',
      canPromptDirectly: true,
      steps: [
        'Tap "Install App Now" to trigger your browser’s native installation prompt.',
        isAndroid
          ? 'On supported Android browsers (Chrome with Google Play Services / Samsung Internet), this packages Skyward Stroke as a standalone WebAPK in your app drawer.'
          : 'The app will launch in its own standalone window without an address bar.',
      ],
      note: 'Native browser install prompt is ready.',
    };
  }

  if (isIOS) {
    return {
      kind: 'ios-safari',
      label: 'Install on iOS',
      canPromptDirectly: false,
      steps: [
        '1. Tap the Share button in the Safari toolbar.',
        '2. Scroll down and select "Add to Home Screen".',
        '3. Launch Skyward Stroke from your Home Screen for full standalone mode.',
      ],
      note: 'iOS Safari uses Add to Home Screen with /apple-touch-icon.png (180×180).',
    };
  }

  if (isAndroid) {
    return {
      kind: 'android-browser',
      label: 'Install on Android',
      canPromptDirectly: false,
      steps: [
        '1. Open the browser menu (⋮ in Chrome or menu in Samsung Internet).',
        '2. Tap "Install app" (or "Add to Home screen").',
        '3. On supported Chrome/Android devices, Android packages Skyward Stroke as a standalone WebAPK.',
      ],
      note: 'Chrome on Android (with GMS) and Samsung Internet support full WebAPK installation; other Android browsers may create a home-screen shortcut.',
    };
  }

  return {
    kind: 'desktop-browser',
    label: 'Install App (PWA)',
    canPromptDirectly: false,
    steps: [
      '1. In Chrome, Edge, or Brave, click the Install icon in the right side of the address bar (or open Menu ⋮ → "Install Skyward Stroke").',
      '2. On Android Chrome, open Menu ⋮ → "Install app" to install as a standalone Android WebAPK.',
      '3. On iOS Safari, tap Share → "Add to Home Screen".',
    ],
    note: 'Configured with /manifest.webmanifest (display: standalone), 192px/512px/maskable icons, and pass-through /sw.js.',
  };
}
