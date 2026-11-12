# Skyward Stroke

**Type the path. Find your flow.**

Skyward Stroke is a browser typing game set across floating low-poly worlds. Each world is a track
of text you type your way through letter by letter, and every keystroke moves your runner one step
further along the path. Keep a clean streak and the screen shifts through the flow tiers — green,
gold, then pink.

Built with React 19, TypeScript, Vite, Tailwind CSS 4 and three.js.

## Getting started

```bash
npm install     # install dependencies
npm run dev     # start the dev server (http://localhost:5173)
```

Other scripts:

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run build`     | Type-check, then build a single self-contained `dist/index.html` |
| `npm run preview`   | Serve the production build locally                         |
| `npm run typecheck` | Type-check only, no output                                 |

The production build inlines all JS and CSS into one HTML file (`vite-plugin-singlefile`), so
`dist/index.html` can be opened or hosted on its own.

## How it plays

- **Journey** — clear each world to unlock the next.
- **Zen** — no timers, no numbers, an endless stream of lines.
- **Ghost** — race a translucent replay of your own personal best.

Each personal best is saved as a *ghost*: the exact text you typed and the moment each letter
landed. That is also why the first three lines of every world are fixed — ghosts recorded before
tracks were shuffled were typed on those lines.

Progress (stats, ghosts, unlocked worlds, and your outfit/hat/trail look) lives in `localStorage`
under the key `skyward-stroke-v1`. Clearing site data resets it.

On touch devices an on-screen keyboard appears and can be hidden with the `⌨` key; a physical
keyboard hides it automatically. `Esc` leaves a run back to the menu.

## Naming and configuration

The application's name and identity are defined in one place, [`src/config.ts`](src/config.ts):

```ts
export const APP_NAME = 'Skyward Stroke';
export const APP_CODE_NAME = 'SKYWARDSTROKE';
```

`APP_NAME_WORDS` (the title, split per word for wrapping), `APP_TAGLINE`, `APP_DESCRIPTION`,
`APP_VERSION` and `STORAGE_KEY` live there too. The menu title, the background letter tiles, the
tagline and the saved-progress namespace all read from it, so renaming the product is a one-file
change. `index.html` carries the browser title and icon; the package name is `skyward-stroke` in
`package.json`.

## Project layout

```
index.html            entry HTML: browser title, meta tags, icon
vite.config.ts        Vite + React + Tailwind + single-file build config
src/
  config.ts           application name, code name, tagline, storage key
  main.tsx            React root
  App.tsx             menu, world select, results, profile, closet
  Game.tsx            a single run: prompt tape, HUD, input handling, layout
  Engine.ts           three.js scene: floating islands, runner, particles
  framing.ts          camera framing that keeps the scene clear of the UI
  Keyboard.tsx        on-screen keyboard for touch screens
  audio.ts            Web Audio: key clicks, chimes, ambient music
  data.ts             worlds, tracks, cosmetics, saved stats and ghosts
  index.css           Tailwind import plus the game and menu styles
  utils/cn.ts         className helper
```

## Deployment

`npm run build` produces a single `dist/index.html` with no external asset requests, so it can be
dropped onto any static host — or opened straight from disk.
