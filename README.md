# Skyward Stroke

**Type the path. Find your flow.**

Skyward Stroke is a 3D typing adventure set across 8 floating low-poly worlds. Each world is a track of text you type your way through letter by letter, and every keystroke moves your runner one step further along the floating bridge. Keep a clean streak to climb through the harmonic flow tiers — emerald, gold, and transcendent magenta.

Built with React 19, TypeScript, Vite, Tailwind CSS 4, Web Audio API synthesis, and Three.js, and configured as a standalone **Progressive Web App (PWA)** that installs onto desktop, mobile, and emulator home screens without any browser top bar.

## Getting Started

```bash
npm install     # install dependencies
npm run dev     # start the dev server (http://localhost:3000)
```

### Available Scripts

| Script                                           | Description                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| `npm run dev`                                    | Start the Vite development server with PWA manifest & SW enabled  |
| `npm run build`                                  | Type-check and build the production app + PWA service worker      |
| `npm run preview`                                | Serve the production build locally                                |
| `npm run typecheck` / `npm run lint`             | Run TypeScript compiler verification (`tsc --noEmit`)             |
| `npx --yes tsx --test src/utils/gameLogic.test.ts` | Run the deterministic unit test suite (`node:test`)             |

## Key Features

### 1. Three Game Modes Across 8 Floating Worlds
- **Journey** — Clear each floating world to unlock the next: *Sky Gardens*, *Neon Grid*, *Icy Peaks*, *Amber Dunes*, *Jade Sanctuary*, *Obsidian Forge*, *Coral Abyss*, and *Cosmic Void*.
- **Zen** — No timers, no numbers — an endless stream of words and sky.
- **Ghost** — Race a translucent 3D replay of your personal best run.

### 2. Tailored Device & Keyboard Systems
Choose the interface and input system that matches your device or emulator (from the Main Menu, the **Device Guide** modal, **Settings**, or live inside the **Game HUD**):
- **🖥️ Desktop / Physical Keyboard (`desktop`)** — Widescreen 3D horizon layout with a clean floating HUD for hardware keyboards (`Esc` returns to menu).
- **📱 Mobile / Native Device OS Keyboard (`mobile-native`)** — Mobile-optimized HUD with a dedicated **Native OS Keyboard Dock** that summons your phone's real built-in keyboard (iOS / Gboard / Android) with native uppercase, punctuation, and dynamic `visualViewport` framing.
- **⌨️ Touch / Built-in Virtual Keyboard (`touch-virtual`)** — Universal tablet and emulator deck featuring an always-visible punctuation bar `( , . ' & - ? ! )`, `123` number layer toggle, `⇧ Shift` / `⇪ Caps`, **Smart Auto-Shift** (automatically shifts keycaps to `A–Z` when the next expected letter is uppercase), and golden next-key target highlights.

### 3. Customizable Play Rules & Harmonic Reward Audio
- **Play Modifiers**: Toggle **Allow Uppercase (`A–Z`)**, **Allow Punctuation `( , . ' & - ? ! )`** (master toggle plus individual character switches), **Allow Numbers (`0–9`)**, and **Track Length (`2 / 3 / 5 / 8` lines)** with a live track preview.
- **Reward Tone Synthesizer**: Web Audio synthesis with stereo shimmer delay, master dynamics compression, harmonic scale progression, word-completion triad chords, milestone fanfares, and 4 selectable sound profiles (*Crystalline*, *Thocky PBT*, *Marimba*, and *Synthwave*).

### 4. Runner Closet, Shareable Metadata Cards & JSON Backup
- **Runner Closet**: Equip 7 outfits (with animated fluttering scarf & collar trim), 6 hats, and 5 particle trails on your 3D runner.
- **Shareable Metadata Card (`PNG` / `JPG` / Web Share)**: Render and download a high-resolution `1200×630` card showcasing your rank, WPM, accuracy, top combo, unlocked worlds, and active rules.
- **Save Data Export / Import (`JSON`)**: Export your complete progress, ghosts, cosmetics, and settings as a `.json` file (or copy to clipboard) and restore anytime.

### 5. Installable Standalone PWA (No Browser Top Bar)
- Configured with a complete **Web App Manifest** (`display: "standalone"`, `display_override: ["fullscreen", "standalone", "minimal-ui"]`), offline **Workbox Service Worker**, iOS Safari full-screen meta tags (`apple-mobile-web-app-capable`), and `192×192`, `512×512`, maskable `512×512`, and `180×180` Apple Touch PNG icons.
- Click the **Install App** button on the top right of the menu (or use your browser's *Add to Home Screen* / *Install App* action) to launch *Skyward Stroke* as a standalone native-style app on Android, iOS, desktop, or mobile emulators with zero browser chrome.

## Project Layout

```
index.html                 entry HTML: title, PWA & iOS standalone meta tags, icons
vite.config.ts             Vite + React + Tailwind + VitePWA configuration
public/
  icon.svg                 vector brand icon
  pwa-192x192.png          192×192 standard PWA icon
  pwa-512x512.png          512×512 standard PWA icon
  pwa-maskable-512x512.png 512×512 maskable Android icon (with safe-zone padding)
  apple-touch-icon.png     180×180 iOS home screen icon
src/
  config.ts                application name, code name, tagline, version, storage key
  main.tsx                 React root + standalone PWA registration & install banner
  App.tsx                  menu, device selector, world grid, results, profile, closet, settings
  Game.tsx                 single run: prompt tape, HUD, physical/native/virtual input handling
  Engine.ts                three.js scene: 8 floating world themes, multi-part runner, particles
  framing.ts               camera framing that keeps the 3D scene clear of HUD & keyboards
  Keyboard.tsx             built-in virtual keyboard with punctuation, auto-shift & target guide
  audio.ts                 Web Audio synthesizer: 4 sound profiles, chords, fanfares, music
  data.ts                  worlds, prompt decks, cosmetics, saved stats and ghosts
  index.css                Tailwind import plus game, HUD, and virtual keyboard styles
  pwa/
    usePWAInstall.ts       hook for standalone detection, beforeinstallprompt & offline state
    PWAInstallBanner.tsx   in-app Install App button, device install guide & offline badge
  utils/
    gameLogic.ts           pure typing modifiers, virtual keyboard resolver & JSON backup parser
    gameLogic.test.ts      unit test suite (node:test)
    shareCard.ts           1200×630 canvas metadata card renderer & PNG/JPG/JSON exporter
    cn.ts                  className helper
```
