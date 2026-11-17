# Technical Report: Android-Installable PWA Implementation in Advance Roleplay Studio

**Purpose:** Document the existing PWA implementation in `Sam-Program-362/Advance-Roleplay-Studio-` so another coding agent can reproduce the relevant capability in a different project without blindly copying unrelated code.

**Repository reviewed:** `https://github.com/Sam-Program-362/Advance-Roleplay-Studio-`

**Branch / revision reviewed:** `main` — `db45deabdfbc2080bfc56751def58180c7c4f328`

**Review date:** 17 November 2026

**Review type:** Static source review of the repository tree and relevant source files. This report does not claim that a fresh Android installation was executed or independently verified during this review.

---

## 1. Executive summary

Advance Roleplay Studio is configured as a **Progressive Web App (PWA)**. Its Android-installable behaviour is primarily enabled by a valid Web App Manifest, application icons, HTTPS delivery, and a non-browser display mode (`standalone`). The repository also registers a service worker, but its worker deliberately does not cache application content and does not provide offline operation.

The key distinction is:

- A **plain home-screen shortcut** is essentially a saved website link and commonly opens with browser UI or a browser badge.
- An **installed PWA** has app-oriented metadata and can launch in a standalone window without the usual browser address bar and tab controls.
- On supported Android browser/device combinations, Chrome can package a qualifying PWA as a **WebAPK**, giving it a more complete Android application entry. Website code cannot force every browser or Android device to create a WebAPK.

The receiving project should implement the PWA manifest and icon requirements first, then make sure its hosting and authentication layers do not block those assets. A service worker is optional for modern Chrome installation and should only be added when there is a deliberate reason to register one.

## 2. Repository and framework context

The reviewed repository is a public GitHub repository on its `main` branch. The root `package.json` identifies the application as a Next.js project using Next.js `16.2.6`, React `19.2.6`, and the Next.js App Router structure under `src/app/`.

Relevant repository files:

| File | Role in the PWA implementation |
|---|---|
| [`src/app/manifest.ts`](https://github.com/Sam-Program-362/Advance-Roleplay-Studio-/blob/main/src/app/manifest.ts) | Generates the Web App Manifest using the Next.js App Router metadata convention. |
| [`public/icon-192.png`](https://github.com/Sam-Program-362/Advance-Roleplay-Studio-/blob/main/public/icon-192.png) | 192×192 application icon referenced by the manifest. |
| [`public/icon-512.png`](https://github.com/Sam-Program-362/Advance-Roleplay-Studio-/blob/main/public/icon-512.png) | 512×512 application icon referenced by the manifest. |
| [`public/sw.js`](https://github.com/Sam-Program-362/Advance-Roleplay-Studio-/blob/main/public/sw.js) | Service worker; currently network pass-through only, with no caching. |
| [`src/app/register-sw.ts`](https://github.com/Sam-Program-362/Advance-Roleplay-Studio-/blob/main/src/app/register-sw.ts) | Client component that registers `/sw.js`. |
| [`src/app/layout.tsx`](https://github.com/Sam-Program-362/Advance-Roleplay-Studio-/blob/main/src/app/layout.tsx) | Root layout; sets viewport/theme metadata and renders the service-worker registration component globally. |
| [`src/lib/auth.ts`](https://github.com/Sam-Program-362/Advance-Roleplay-Studio-/blob/main/src/lib/auth.ts) | Explicitly permits unauthenticated access to PWA resources. |
| [`src/proxy.ts`](https://github.com/Sam-Program-362/Advance-Roleplay-Studio-/blob/main/src/proxy.ts) | Applies authentication checks to requests and delegates public-resource decisions to the authorization logic. |
| [`README.md`](https://github.com/Sam-Program-362/Advance-Roleplay-Studio-/blob/main/README.md) | Documents the app as installable and explains that its service worker caches nothing. |

## 3. Exact implementation found in the repository

### 3.1 Web App Manifest — the central installability declaration

**File:** `src/app/manifest.ts`

The file exports a function returning `MetadataRoute.Manifest`. Next.js recognises this filename and serves the manifest at:

`/manifest.webmanifest`

The current manifest declares:

- `name`: `Roleplay Studio — Advanced AI Character Studio`
- `short_name`: `Roleplay Studio`
- `description`: application description
- `start_url`: `/`
- `display`: `standalone`
- `background_color`: `#0b0e1b`
- `theme_color`: `#020617`
- `orientation`: `portrait`
- icon entries for 192×192 and 512×512 PNG files
- a second 512×512 icon entry marked with `purpose: "maskable"`

**Why this matters:** the manifest tells a supporting browser that the site has an application identity, which name/icon to use, which URL to launch, and which display mode to request. `display: "standalone"` is the key app-like display setting; it requests a window without the normal browser interface. It does not turn the web app into native Kotlin code.

**Important implementation note:** the current manifest points both the ordinary 512px icon and the maskable entry to the same file (`/icon-512.png`). That is valid as a declaration, but it is only visually reliable as a maskable icon if the source artwork has been designed with sufficient safe padding for Android's icon masks. For a new project, prefer a separately designed `icon-maskable-512.png` rather than assuming any ordinary icon can be safely cropped.

The current manifest does not explicitly declare `id` or `scope`. Those are not required to reproduce this implementation. For a new project, the agent may add stable values such as `id: "/"` and `scope: "/"` where they correctly match the application's URL structure. The agent must not set an incorrect scope or start URL, especially if the app is hosted under a subpath.

### 3.2 Application icons

**Files:**

- `public/icon-192.png`
- `public/icon-512.png`

Both files are referenced by the manifest. The standard Chromium PWA manifest install criteria require a suitable 192px and 512px icon. The maskable asset is a quality/integration consideration for Android launchers and should be prepared with mask-safe artwork.

The receiving project must use its own correct branding. Do not copy Roleplay Studio's icons or names into another application.

### 3.3 Root layout and viewport metadata

**File:** `src/app/layout.tsx`

The root layout exports metadata and a viewport configuration. The viewport includes:

- `width: "device-width"`
- `initialScale: 1`
- `maximumScale: 1`
- `viewportFit: "cover"`
- `themeColor: "#020617"`

The root layout also renders `<RegisterSW />` inside the `<body>`, so service-worker registration is initiated across the application rather than from only one page.

The receiving agent should adapt viewport/theme settings to the target app. Do not automatically copy `maximumScale: 1`; disabling user zoom can harm accessibility and is not a PWA installability requirement.

### 3.4 Service-worker registration

**File:** `src/app/register-sw.ts`

This is a client component. It uses a React effect and calls:

`navigator.serviceWorker.register("/sw.js")`

The registration is guarded by a feature check for `serviceWorker` in `navigator`.

This makes the worker available to the browser. The registration itself is not what gives the installed app its standalone appearance; the manifest's application metadata and display configuration are central to that.

The current registration has no explicit failure logging or catch handler. A new implementation may add safe diagnostics so a registration failure is visible during testing, but it must not break rendering when service workers are unsupported or blocked.

### 3.5 Service-worker behaviour — deliberately no offline cache

**File:** `public/sw.js`

The worker currently:

1. Calls `self.skipWaiting()` on installation.
2. Calls `self.clients.claim()` on activation.
3. Listens for fetch events.
4. Ignores non-GET requests.
5. Ignores cross-origin requests.
6. Does not intercept `/api/*` or `/login` requests.
7. For other eligible same-origin GET requests, calls `event.respondWith(fetch(request))`.

There are no Cache Storage writes, cache-first strategies, precache lists, or offline fallback pages in this service worker.

**Consequence:** the PWA is installable but this worker does not make the application work offline. The README explicitly describes this as an installability-only worker and says it caches nothing.

For another project, do not copy this file automatically. Modern Chrome PWA installation does not require a service worker. Add a worker only where the project needs its lifecycle or has a properly designed offline/cache strategy. Incorrect caching is particularly dangerous for authenticated apps because stale pages or API responses can expose wrong data or create broken login behaviour.

### 3.6 Authentication integration — particularly important

**Files:** `src/lib/auth.ts` and `src/proxy.ts`

Roleplay Studio has an application-password gate. Its `auth.ts` explicitly identifies public paths that must be reachable without a logged-in session. The list includes:

- `/login`
- `/manifest.webmanifest`
- `/icon-192.png`
- `/icon-512.png`
- `/sw.js`
- `/api/auth/login`
- `/api/auth/logout`

This is a significant compatibility detail. The browser may request the manifest, icons, and service worker before or independently of an authenticated app session. If middleware/proxy protection redirects these resource requests to a login page, the browser may be unable to retrieve the PWA resources correctly.

Roleplay Studio does **not** make its private pages or application APIs public. It allows the PWA support resources and login endpoints through, while the remaining routes continue through authorization.

For the receiving project:

- Preserve all existing authentication protections.
- Allow only the necessary manifest/icon/worker resources to be fetched as intended.
- Do not make application data, private pages, or API endpoints public as a workaround.
- Ensure the service worker does not cache login responses, authenticated content, or private API data.
- Confirm the framework's metadata route is not accidentally blocked by route middleware/proxy rules.

### 3.7 HTTPS and deployment

PWA installation and service workers require a secure context. Production must be served over HTTPS. `localhost` is treated as a secure context for local development, but an ordinary remote HTTP deployment is not sufficient.

The repository's PWA setup itself does not configure a special Vercel feature or a native Android build. HTTPS is supplied by the deployment platform/domain configuration.

## 4. What actually produces the app-like Android result?

The Android installation experience is controlled by both the website and the browser/device:

1. The website publishes a valid manifest with a name, short name, icons, start URL, and a non-browser display mode such as `standalone`.
2. The website is served over HTTPS.
3. The browser recognises the site as installable/promotable under its current criteria and policies.
4. The user chooses the browser's install action.
5. On supported Android combinations, Chrome can install the PWA as a WebAPK. Other browser/device combinations may only create a browser-badged home-screen shortcut.

**The website cannot guarantee a WebAPK on every Android phone or browser.** Current platform documentation identifies Chrome on Android devices with Google Mobile Services and Samsung Internet on Samsung devices as browsers that install PWAs as WebAPKs. Other Android browsers, and Chrome builds without GMS, may instead create browser-badged shortcuts.

Therefore, acceptance criteria must be explicit: test on the actual target browser/device, and distinguish “opens in standalone mode” from “is installed as an Android WebAPK / has a full app-launcher entry.” Do not promise the latter universally.

## 5. Things not found / not demonstrated by this source review

The following were not established by the static code review:

- No custom `beforeinstallprompt` event handler or custom in-app install button was found in the inspected application shell/settings components. The existing setup appears to rely on the browser's own install UI.
- No offline caching or offline mode is implemented by `public/sw.js`.
- No push-notification, background-sync, periodic-sync, file-handler, or share-target implementation was identified as part of this PWA setup.
- No real Android WebAPK installation was executed as part of this source review.
- The review does not prove that every browser/device will show an “Install app” menu item. Browser install heuristics and OS integration vary.

These are not necessarily defects. They are boundaries of what the repository currently implements and what was verified.

## 6. Recommended implementation plan for the receiving project

The agent implementing this in another repository should work in this order:

### Phase 1 — inspect before changing code

- Identify the framework and routing system (Next.js App Router, Next.js Pages Router, Vite, another SPA framework, etc.).
- Identify the true application entry point and root layout.
- Identify public/static asset conventions.
- Identify authentication middleware, proxy, redirects, rewrite rules, and any deployment base path.
- Check whether a manifest, service worker, icons, or PWA plugin already exists. Avoid duplicate registrations/manifests.

### Phase 2 — add the minimum installability layer

- Create a valid Web App Manifest using the framework's recommended convention.
- Set a meaningful application `name` and `short_name`.
- Set a correct `start_url` and `scope` for the deployed application path.
- Set `display: "standalone"`.
- Provide a 192×192 PNG icon and a 512×512 PNG icon.
- Provide a genuinely mask-safe 512×512 maskable icon and declare it with `purpose: "maskable"`.
- Set appropriate `theme_color` and `background_color` values.
- Set `prefer_related_applications: false` or omit it; do not redirect users toward a separate native app unless that is explicitly intended.
- Confirm the framework emits and links the manifest correctly.

### Phase 3 — decide on service-worker requirements

- Do not add a service worker just to satisfy a mistaken assumption that all installable PWAs require one.
- If one is needed, define its caching strategy and version/update behaviour deliberately.
- Do not cache authenticated documents, login/logout responses, API responses containing user data, or secrets.
- If the app has no genuine offline requirement, a no-cache worker similar to Roleplay Studio is possible but optional; a worker that only passes requests through adds maintenance surface and should have a documented reason.

### Phase 4 — integrate with authentication and routing

- Ensure the manifest and icon assets are retrievable without an authenticated application session where needed.
- If registering a worker, ensure the worker script URL is also reachable and served with a valid JavaScript MIME type.
- Keep private routes and APIs protected.
- Ensure the `start_url` leads to the expected application/login experience and does not create an authentication redirect loop.
- Check subpath deployment and reverse-proxy behaviour; root-relative paths such as `/sw.js` are only correct when the app is hosted at the domain root.

### Phase 5 — verification

At minimum, verify the following against a production-like HTTPS deployment:

- `GET /manifest.webmanifest` returns successfully with the correct manifest JSON and content type.
- Every icon URL returns successfully and the actual image dimensions match its declaration.
- The manifest contains `name` or `short_name`, `start_url`, a supported non-browser `display` mode, and 192px/512px icons.
- `display` is `standalone` and the app opens in the expected display mode after installation.
- The manifest, icons, and worker (if any) are not redirected to an HTML login page.
- A logged-out request to a private API remains unauthorized; PWA support must not weaken security.
- The app's main login, page navigation, and API flows still work after the PWA changes.
- Build, lint, type-check, and existing automated tests pass.
- Manual installation is tested in Chrome on a supported Android device; report whether the outcome was a WebAPK or a browser-badged shortcut.

## 7. Agent handoff instructions

**Implement the PWA capability in the target repository, using Advance Roleplay Studio only as a reference. Do not modify Advance Roleplay Studio itself.**

The agent must inspect the target project's actual framework, entry point, existing PWA files, authentication and deployment configuration before making changes. It must preserve existing features and security, avoid unnecessary PWA packages, and implement the minimum correct manifest/icon integration first. It must not assume that the target uses Next.js or blindly copy `manifest.ts`, `register-sw.ts`, or `sw.js` if the target architecture differs.

The agent should not introduce offline support, push notifications, or other advanced PWA capabilities unless separately required. It must not claim successful Android installation merely because the build passes. It should report changed files, manifest endpoint, icon dimensions, auth exceptions, service-worker decision, automated test results, and the outcome of manual Android installation testing.

**Expected result:** a website that qualifying Android browsers can recognise as an installable PWA and launch in standalone mode, while preserving existing authentication and application behaviour. A true WebAPK remains dependent on supported browser/device conditions.

## 8. Reference documentation

- Next.js App Router manifest convention: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
- Next.js metadata file conventions: https://nextjs.org/docs/app/api-reference/file-conventions/metadata
- MDN — Making PWAs installable and browser/platform differences: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- Chromium — Web apps and Android installation entry points: https://chromium.googlesource.com/chromium/src/+/main/docs/webapps/
- Chromium — Android WebAPK architecture: https://chromium.googlesource.com/chromium/src/+/HEAD/components/webapps/docs/android_architecture.md

---

**End of report**
