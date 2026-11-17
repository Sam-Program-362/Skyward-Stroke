import { APP_NAME, APP_TAGLINE } from '../config';
import { WORLDS, OUTFITS, HATS, TRAILS, level, type Stats } from '../data';
import type { Mode, Result } from '../Game';
import {
  DEFAULT_PLAY_SETTINGS,
  getPlayerRank,
  serializeBackupData,
} from './gameLogic';

export interface MetadataCardInput {
  stats: Stats;
  worldIdx: number;
  mode: Mode;
  result?: Result | null;
}

/**
 * Renders a 1200x630 high-resolution player/run Metadata Card onto a <canvas>.
 */
export function renderMetadataCard(
  input: MetadataCardInput,
  targetCanvas?: HTMLCanvasElement
): HTMLCanvasElement {
  const canvas = targetCanvas || document.createElement('canvas');
  const W = 1200;
  const H = 630;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const { stats, worldIdx, mode, result } = input;
  const world = WORLDS[worldIdx] || WORLDS[0];
  const lvl = level(stats);
  const rank = getPlayerRank(lvl, stats.bestWpm);
  const settings = stats.settings || DEFAULT_PLAY_SETTINGS;
  const outfit = OUTFITS.find(o => o.id === stats.look.outfit) || OUTFITS[0];
  const hat = HATS.find(h => h.id === stats.look.hat) || HATS[0];
  const trail = TRAILS.find(t => t.id === stats.look.trail) || TRAILS[0];

  // Background sky gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(0.55, '#1e1b4b');
  bg.addColorStop(1, world.sky[0]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Decorative floating tiles
  const code = world.name.replace(/\s+/g, '').slice(0, 4).toUpperCase();
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.translate(880 + i * 72, 74 - i * 6);
    ctx.rotate(-0.08);
    ctx.fillStyle = world.block;
    ctx.beginPath();
    ctx.roundRect(0, 0, 56, 56, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 28px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(code[i] || 'S', 28, 30);
    ctx.restore();
  }

  // Main glass panel
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(48, 44, W - 96, H - 88, 28);
  ctx.fill();
  ctx.stroke();

  // Header brand
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 46px Nunito, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(APP_NAME.toUpperCase(), 88, 118);

  ctx.fillStyle = '#a5b4fc';
  ctx.font = '700 20px Nunito, system-ui, sans-serif';
  ctx.fillText(
    result
      ? `${world.name} · ${mode.toUpperCase()} RUN COMPLETE`
      : `${APP_TAGLINE} · PLAYER METADATA CARD`,
    88,
    152
  );

  // Rank Pill
  ctx.fillStyle = rank.tierColor;
  ctx.beginPath();
  ctx.roundRect(88, 176, 360, 44, 14);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 20px Nunito, system-ui, sans-serif';
  ctx.fillText(`${rank.badge} ${rank.title} · Level ${lvl}`, 108, 204);

  // Stat boxes
  const items = result
    ? [
        { label: 'RUN WPM', value: String(result.wpm) },
        { label: 'ACCURACY', value: `${result.acc}%` },
        { label: 'TOP COMBO', value: `×${result.maxCombo}` },
        { label: 'BEST WPM', value: String(Math.max(stats.bestWpm, result.wpm)) },
      ]
    : [
        { label: 'BEST WPM', value: String(stats.bestWpm) },
        { label: 'BEST ACCURACY', value: `${stats.bestAcc}%` },
        { label: 'HIGHEST COMBO', value: `×${stats.highestCombo}` },
        { label: 'WORDS TYPED', value: String(stats.totalWords) },
      ];

  items.forEach((it, idx) => {
    const bx = 88 + idx * 260;
    const by = 252;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.beginPath();
    ctx.roundRect(bx, by, 240, 136, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 48px Nunito, system-ui, sans-serif';
    ctx.fillText(it.value, bx + 24, by + 76);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '800 15px Nunito, system-ui, sans-serif';
    ctx.fillText(it.label, bx + 24, by + 112);
  });

  // Loadout & Active Rules Footer
  const rules: string[] = [];
  if (settings.uppercase) rules.push('Uppercase (A-Z)');
  if (settings.punctuation) rules.push(`Punctuation (${settings.enabledPunctuation.join(' ')})`);
  if (settings.numbers) rules.push('Numbers (0-9)');
  if (rules.length === 0) rules.push('Classic Lowercase Flow');

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '700 19px Nunito, system-ui, sans-serif';
  ctx.fillText(
    `Runner: ${outfit.name} · ${hat.name} · ${trail.name} Trail | Worlds: ${stats.unlocked}/${WORLDS.length}`,
    88,
    455
  );

  ctx.fillStyle = '#93c5fd';
  ctx.font = '700 18px Nunito, system-ui, sans-serif';
  ctx.fillText(
    `Rules: ${rules.join(' + ')} · Tone: ${settings.soundProfile} · Input: ${settings.deviceMode}`,
    88,
    492
  );

  ctx.fillStyle = 'rgba(255, 255, 255, 0.48)';
  ctx.font = '600 15px Nunito, system-ui, sans-serif';
  ctx.fillText(
    `Exported from ${APP_NAME} · ${new Date().toISOString().slice(0, 10)}`,
    88,
    546
  );

  return canvas;
}

export function downloadMetadataImage(
  input: MetadataCardInput,
  format: 'png' | 'jpg' = 'png'
) {
  const canvas = renderMetadataCard(input);
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const dataUrl = canvas.toDataURL(mime, 0.94);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `skyward-stroke-card.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function shareMetadataImage(input: MetadataCardInput): Promise<string> {
  const canvas = renderMetadataCard(input);
  try {
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(b => resolve(b), 'image/png')
    );
    if (blob && navigator.share) {
      const file = new File([blob], 'skyward-stroke-card.png', { type: 'image/png' });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: APP_NAME,
          text: `${APP_NAME} — Best ${input.stats.bestWpm} WPM!`,
          files: [file],
        });
        return 'Shared Metadata Card!';
      }
    }
  } catch {
    // Fallback to download
  }
  downloadMetadataImage(input, 'png');
  return 'Downloaded Metadata Card PNG (ready to share)!';
}

export function downloadBackupJson(stats: Stats) {
  const json = serializeBackupData(stats);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `skyward-stroke-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
