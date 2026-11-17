import { APP_NAME, APP_TAGLINE, APP_VERSION } from '../config';
import { WORLDS, OUTFITS, HATS, TRAILS, level, type Stats } from '../data';
import { getPlayerRank, serializeBackupData } from './gameLogic';
import type { Result, Mode } from '../Game';

export interface ShareCardOptions {
  stats: Stats;
  worldIdx?: number;
  mode?: Mode;
  result?: Result | null;
}

/**
 * Renders a 1200x630 shareable Metadata Card onto a provided or newly created HTMLCanvasElement.
 */
export function renderMetadataCard(
  options: ShareCardOptions,
  targetCanvas?: HTMLCanvasElement
): HTMLCanvasElement {
  const { stats, worldIdx = 0, mode = 'journey', result } = options;
  const world = WORLDS[worldIdx] || WORLDS[0];
  const lvl = level(stats);
  const rank = getPlayerRank(lvl, stats.bestWpm);

  const canvas = targetCanvas || document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d')!;

  // 1. World Sky Gradient Background
  const bg = ctx.createLinearGradient(0, 0, 1200, 630);
  bg.addColorStop(0, world.sky[0]);
  bg.addColorStop(1, world.sky[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1200, 630);

  // Dark atmospheric overlay for guaranteed WCAG AA legibility on any sky palette
  const scrim = ctx.createLinearGradient(0, 0, 0, 630);
  scrim.addColorStop(0, 'rgba(12, 16, 42, 0.58)');
  scrim.addColorStop(1, 'rgba(12, 16, 42, 0.84)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, 1200, 630);

  // Subtle decorative grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  for (let x = 60; x < 1200; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 630);
    ctx.stroke();
  }
  for (let y = 60; y < 630; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1200, y);
    ctx.stroke();
  }

  // Outer Frame Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(28, 28, 1144, 574, 28);
  ctx.stroke();

  // 2. Top Header: Brand + Rank Badge
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 44px "Nunito", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(APP_NAME.toUpperCase(), 64, 56);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.font = '600 18px "Nunito", system-ui, sans-serif';
  ctx.fillText(`${APP_TAGLINE}  ·  ${world.name} (${mode.toUpperCase()})`, 64, 108);

  // Decorative 3D Key Tiles in top-right
  const tileWord = world.name.replace(/\s+/g, '').slice(0, 4).toUpperCase();
  for (let i = 0; i < tileWord.length; i++) {
    const tx = 940 + i * 52;
    const ty = 56 + (i % 2 === 0 ? 0 : -6);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.roundRect(tx, ty + 5, 44, 44, 10);
    ctx.fill();

    ctx.fillStyle = world.block;
    ctx.beginPath();
    ctx.roundRect(tx, ty, 44, 44, 10);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 24px "Nunito", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tileWord[i], tx + 22, ty + 23);
  }

  // Rank & Level Summary Line
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = rank.tierColor;
  ctx.font = '800 20px "Nunito", system-ui, sans-serif';
  ctx.fillText(`${rank.badge} ${rank.title}  ·  Level ${lvl}`, 64, 146);

  // 3. Main Stat Cards (Either Run Result + Career or Full Career Profile)
  const primaryMetrics = result
    ? [
        { label: 'RUN SPEED', value: `${result.wpm} WPM`, highlight: true },
        { label: 'RUN ACCURACY', value: `${result.acc}%`, highlight: false },
        { label: 'MAX COMBO', value: `×${result.maxCombo}`, highlight: false },
        { label: 'PERSONAL BEST', value: `${ Math.max(stats.bestWpm, result.wpm)} WPM`, highlight: result.newBest },
        { label: 'CAREER WORDS', value: stats.totalWords.toLocaleString(), highlight: false },
        { label: 'WORLDS UNLOCKED', value: `${stats.unlocked} / ${WORLDS.length}`, highlight: false },
      ]
    : [
        { label: 'BEST SPEED', value: `${stats.bestWpm} WPM`, highlight: true },
        { label: 'BEST ACCURACY', value: `${stats.bestAcc}%`, highlight: false },
        { label: 'HIGHEST COMBO', value: `×${stats.highestCombo}`, highlight: true },
        { label: 'WORDS TYPED', value: stats.totalWords.toLocaleString(), highlight: false },
        { label: 'TRACKS COMPLETED', value: stats.tracks.toLocaleString(), highlight: false },
        { label: 'WORLDS UNLOCKED', value: `${stats.unlocked} / ${WORLDS.length}`, highlight: false },
      ];

  const cardW = 342;
  const cardH = 132;
  const startX = 64;
  const startY = 198;
  const gapX = 24;
  const gapY = 20;

  primaryMetrics.forEach((m, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const x = startX + col * (cardW + gapX);
    const y = startY + row * (cardH + gapY);

    ctx.fillStyle = m.highlight ? 'rgba(91, 140, 255, 0.24)' : 'rgba(255, 255, 255, 0.1)';
    ctx.strokeStyle = m.highlight ? world.block : 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = m.highlight ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.68)';
    ctx.font = '700 14px "Nunito", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(m.label, x + 24, y + 22);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 44px "Nunito", system-ui, sans-serif';
    ctx.fillText(String(m.value), x + 24, y + 54);
  });

  // 4. Bottom Metadata Strip: Character Loadout + Active Play Settings + Timestamp
  const outfitName = OUTFITS.find(o => o.id === stats.look.outfit)?.name || 'Sky Hoodie';
  const hatName = HATS.find(h => h.id === stats.look.hat)?.name || 'Windy Hair';
  const trailName = TRAILS.find(t => t.id === stats.look.trail)?.name || 'Starlight';

  const activeModifiers: string[] = [];
  if (stats.settings?.uppercase) activeModifiers.push('Uppercase (A-Z)');
  if (stats.settings?.punctuation) {
    activeModifiers.push(`Punctuation (${stats.settings.enabledPunctuation.join(' ')})`);
  }
  if (stats.settings?.numbers) activeModifiers.push('Numbers (0-9)');
  if (activeModifiers.length === 0) activeModifiers.push('Standard Lowercase Flow');

  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = '700 16px "Nunito", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(
    `Runner Loadout: ${outfitName}  ·  ${hatName}  ·  ${trailName} Trail`,
    64,
    512
  );

  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.font = '600 15px "Nunito", system-ui, sans-serif';
  ctx.fillText(
    `Play Rules: ${activeModifiers.join('  ·  ')}  ·  Sound: ${stats.settings?.soundProfile || 'crystalline'}`,
    64,
    542
  );

  const dateStr = new Date().toISOString().slice(0, 10);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = '600 14px "Nunito", system-ui, sans-serif';
  ctx.fillText(`${APP_NAME} v${APP_VERSION}  ·  ${dateStr}`, 1136, 542);

  return canvas;
}

/**
 * Triggers a browser download of the rendered Metadata Card as PNG or JPG.
 */
export function downloadMetadataImage(
  options: ShareCardOptions,
  format: 'png' | 'jpg' = 'png'
): string {
  const canvas = renderMetadataCard(options);
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const dataUrl = canvas.toDataURL(mime, 0.94);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `skyward-stroke-metadata-${stamp}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return dataUrl;
}

/**
 * Shares the Metadata Card via Web Share API if supported, falling back to PNG download.
 */
export async function shareMetadataImage(options: ShareCardOptions): Promise<string> {
  const canvas = renderMetadataCard(options);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (blob && typeof navigator.share === 'function') {
    const file = new File([blob], 'skyward-stroke-card.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: `${APP_NAME} — ${options.stats.bestWpm} WPM`,
          text: `My ${APP_NAME} record: ${options.stats.bestWpm} WPM · Level ${level(options.stats)}!`,
          files: [file],
        });
        return 'Shared via system share sheet!';
      } catch {
        // User cancelled or share failed; fall back to download
      }
    }
  }
  downloadMetadataImage(options, 'png');
  return 'Downloaded metadata PNG card!';
}

/**
 * Downloads the player's complete Stats & Settings as a formatted JSON file.
 */
export function downloadBackupJson(stats: Stats): string {
  const json = serializeBackupData(stats);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `skyward-stroke-save-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return json;
}
