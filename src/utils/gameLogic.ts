import { APP_NAME, APP_VERSION } from '../config';
import type { Stats, Look, Ghost } from '../data';

export type SoundProfile = 'crystalline' | 'thocky' | 'marimba' | 'synthwave';
export type DeviceMode = 'desktop' | 'mobile-native' | 'touch-virtual';
export type ShiftMode = 'off' | 'once' | 'caps';

export const PUNCTUATION_CHARS = [',', '.', "'", '&', '-', '?', '!'] as const;
export type PunctuationChar = (typeof PUNCTUATION_CHARS)[number];

export interface PlaySettings {
  uppercase: boolean;
  punctuation: boolean;
  enabledPunctuation: PunctuationChar[];
  numbers: boolean;
  linesPerTrack: number;
  soundProfile: SoundProfile;
  sfxVolume: number;
  musicVolume: number;
  deviceMode: DeviceMode;
  deviceSelected: boolean;
  autoShiftVirtual: boolean;
}

export const DEFAULT_PLAY_SETTINGS: PlaySettings = {
  uppercase: false,
  punctuation: false,
  enabledPunctuation: [',', '.', "'", '&', '-', '?', '!'],
  numbers: false,
  linesPerTrack: 3,
  soundProfile: 'crystalline',
  sfxVolume: 0.85,
  musicVolume: 0.22,
  deviceMode: 'desktop',
  deviceSelected: false,
  autoShiftVirtual: true,
};

export interface VirtualKeyboardResolution {
  isShifted: boolean;
  needsShiftTap: boolean;
  needsNumberLayer: boolean;
  targetKey: string | null;
}

/**
 * Computes the virtual keyboard state (Shift state, layer state, and highlighted target key)
 * from the next expected character in the prompt, manual shift mode, and auto-shift setting.
 */
export function resolveVirtualKeyboardState(
  expectedChar: string | undefined,
  manualShift: ShiftMode,
  autoShift: boolean
): VirtualKeyboardResolution {
  const isExpectedUpper = Boolean(expectedChar && /^[A-Z]$/.test(expectedChar));
  const isExpectedDigit = Boolean(expectedChar && /^[0-9]$/.test(expectedChar));
  const isShifted =
    manualShift === 'once' || manualShift === 'caps' || (autoShift && isExpectedUpper);
  const needsShiftTap = !isShifted && isExpectedUpper;

  let targetKey: string | null = null;
  if (expectedChar === ' ') {
    targetKey = 'space';
  } else if (expectedChar && /^[a-zA-Z]$/.test(expectedChar)) {
    targetKey = isShifted ? expectedChar.toUpperCase() : expectedChar.toLowerCase();
  } else if (expectedChar) {
    targetKey = expectedChar;
  }

  return {
    isShifted,
    needsShiftTap,
    needsNumberLayer: isExpectedDigit,
    targetKey,
  };
}

/**
 * Extracts newly typed character(s) from a mobile native OS keyboard `<input>` value
 * that uses a leading sentinel character so mobile IMEs and Gboard/iOS keyboards emit reliably.
 */
export function extractNativeInputChars(rawValue: string, sentinel = '\u200B'): string[] {
  if (!rawValue) return [];
  const stripped = rawValue.startsWith(sentinel)
    ? rawValue.slice(sentinel.length)
    : rawValue.split(sentinel).join('');
  return Array.from(stripped);
}

/** Words that naturally take an apostrophe suffix or contraction when "'" is enabled */
const CONTRACTIONS: Record<string, string> = {
  it: "it's",
  that: "that's",
  there: "there's",
  what: "what's",
  who: "who's",
  let: "let's",
  you: "you'll",
  we: "we're",
  they: "they're",
  sky: "sky's",
  night: "night's",
  ocean: "ocean's",
  mountain: "mountain's",
  garden: "garden's",
  winter: "winter's",
  world: "world's",
  wind: "wind's",
  sun: "sun's",
  moon: "moon's",
};

/** Proper/poetic nouns that look natural capitalized mid-sentence when uppercase is enabled */
const POETIC_NOUNS = new Set([
  'sky', 'garden', 'aurora', 'glacier', 'nebula', 'cosmos', 'milky', 'way', 'earth',
  'north', 'sunset', 'horizon', 'temple', 'oasis', 'sanctuary', 'forge', 'abyss',
  'eden', 'atlas', 'zenith', 'solstice', 'equinox', 'orion', 'nova', 'crystal',
]);

/** Pairs or words that naturally hyphenate when '-' is enabled */
const HYPHEN_PAIRS: Record<string, string> = {
  'step by step': 'step-by-step',
  'far off': 'far-off',
  'late night': 'late-night',
  'high scores': 'high-scores',
  'one small': 'one-small',
  'slow hands': 'slow-steady',
};

function deterministicHash(str: string, seed = 0): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function capitalizeWord(w: string): string {
  if (!w) return w;
  return w[0].toUpperCase() + w.slice(1);
}

/**
 * Transforms a base lowercase line according to the active PlaySettings.
 * If all modifiers (uppercase, punctuation, numbers) are false, returns the original lowercase line untouched.
 */
export function applyPlaySettingsToLine(
  rawLine: string,
  settings: PlaySettings,
  lineIdx = 0
): string {
  let line = rawLine.trim().replace(/\s+/g, ' ');
  if (!line) return '';

  const { uppercase, punctuation, enabledPunctuation = [], numbers } = settings;
  if (!uppercase && !punctuation && !numbers) {
    return line.toLowerCase();
  }

  const allowed = new Set<string>(punctuation ? enabledPunctuation : []);
  const h = deterministicHash(line, lineIdx);

  // 1. Apply hyphenation on known pairs if '-' is allowed
  if (allowed.has('-')) {
    for (const [from, to] of Object.entries(HYPHEN_PAIRS)) {
      if (line.includes(from)) {
        line = line.replace(from, to);
        break;
      }
    }
  }

  let words = line.split(' ');

  // 2. Apply '&' substitution for 'and' when '&' is enabled
  if (allowed.has('&')) {
    let replacedAnd = false;
    words = words.map((w, idx) => {
      if (w.toLowerCase() === 'and' && (!replacedAnd || (h + idx) % 2 === 0)) {
        replacedAnd = true;
        return '&';
      }
      return w;
    });
  }

  // 3. Apply apostrophe contractions/possessives if "'" is enabled
  if (allowed.has("'")) {
    let appliedApostrophe = false;
    for (let i = 0; i < words.length - 1; i++) {
      if (words[i].toLowerCase() === 'it' && words[i + 1].toLowerCase() === 'is') {
        words.splice(i, 2, "it's");
        appliedApostrophe = true;
        break;
      }
    }
    if (!appliedApostrophe) {
      words = words.map(w => {
        const lower = w.toLowerCase();
        if (!appliedApostrophe && CONTRACTIONS[lower]) {
          appliedApostrophe = true;
          return CONTRACTIONS[lower];
        }
        return w;
      });
    }
    if (!appliedApostrophe && words.length >= 4 && (lineIdx % 2 === 0 || allowed.size === 1)) {
      for (let offset = 0; offset < words.length; offset++) {
        const targetIdx = (1 + h + offset) % words.length;
        const w = words[targetIdx];
        if (
          /^[a-z]+$/i.test(w) &&
          w.length >= 4 &&
          !w.endsWith('s') &&
          !['with', 'from', 'over', 'into', 'past', 'down', 'your', 'that', 'this'].includes(w.toLowerCase())
        ) {
          words[targetIdx] = `${w}'s`;
          break;
        }
      }
    }
  }

  // 4. Apply hyphen between two descriptive words if '-' is enabled and none present yet
  if (allowed.has('-') && !words.some(w => w.includes('-')) && words.length >= 5) {
    if (lineIdx % 2 === 1 || allowed.size === 1) {
      const pairIdx = 1 + (h % (words.length - 3));
      if (/^[a-z]+$/i.test(words[pairIdx]) && /^[a-z]+$/i.test(words[pairIdx + 1])) {
        words.splice(pairIdx, 2, `${words[pairIdx]}-${words[pairIdx + 1]}`);
      }
    }
  }

  // 5. Inject numbers if enabled
  if (numbers && words.length >= 3) {
    const numVal = ((h % 90) + 10).toString();
    const insertPos = Math.min(words.length - 1, 1 + (h % 3));
    words.splice(insertPos, 0, numVal);
  }

  // 6. Apply mid-sentence comma if ',' is enabled
  if (allowed.has(',') && words.length >= 5) {
    const mid = Math.floor(words.length / 2);
    if (!/[,.?!'&-]$/.test(words[mid - 1])) {
      words[mid - 1] = `${words[mid - 1]},`;
    }
  }

  // 7. Apply Uppercase rules if enabled
  if (uppercase) {
    words = words.map((w, idx) => {
      if (idx === 0) return capitalizeWord(w);
      const clean = w.replace(/[^a-zA-Z]/g, '').toLowerCase();
      if (POETIC_NOUNS.has(clean) || (idx > 1 && (h + idx) % 5 === 0)) {
        return capitalizeWord(w);
      }
      return w;
    });
  }

  // 8. Apply terminal punctuation ('.', '!', '?') if enabled
  const endings: PunctuationChar[] = (['.', '!', '?'] as const).filter(c => allowed.has(c));
  if (endings.length > 0) {
    const endChar = endings[(h + lineIdx) % endings.length];
    const lastIdx = words.length - 1;
    const lastWord = words[lastIdx].replace(/[,.?!]+$/, '');
    words[lastIdx] = `${lastWord}${endChar}`;
  }

  return words.join(' ');
}

export function formatTrackLines(lines: string[], settings: PlaySettings): string {
  return lines
    .map((line, idx) => applyPlaySettingsToLine(line, settings, idx))
    .filter(Boolean)
    .join(' ');
}

export interface PlayerRank {
  title: string;
  badge: string;
  tierColor: string;
  nextLevelAt: number;
}

export function getPlayerRank(lvl: number, bestWpm: number): PlayerRank {
  const score = lvl * 10 + bestWpm;
  if (score >= 380 || lvl >= 25) {
    return { title: 'Celestial Architect', badge: '✦', tierColor: '#ff5fd2', nextLevelAt: lvl + 5 };
  }
  if (score >= 260 || lvl >= 15) {
    return { title: 'Astral Navigator', badge: '★', tierColor: '#ffc53d', nextLevelAt: 25 };
  }
  if (score >= 160 || lvl >= 8) {
    return { title: 'Horizon Strider', badge: '◆', tierColor: '#3fd67a', nextLevelAt: 15 };
  }
  if (score >= 80 || lvl >= 3) {
    return { title: 'Cloud Weaver', badge: '▲', tierColor: '#5b8cff', nextLevelAt: 8 };
  }
  return { title: 'Skyward Novice', badge: '●', tierColor: '#7fd3ff', nextLevelAt: 3 };
}

export interface BackupPayload {
  app: string;
  version: string;
  exportedAt: string;
  stats: Stats;
}

export function serializeBackupData(stats: Stats): string {
  const payload: BackupPayload = {
    app: APP_NAME,
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    stats,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseBackupData(
  rawJson: string,
  defaultStats: Stats
): { ok: true; stats: Stats } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Backup file must contain a valid JSON object.' };
    }

    const candidate = parsed.stats && typeof parsed.stats === 'object' ? parsed.stats : parsed;

    if (
      typeof candidate.bestWpm !== 'number' &&
      typeof candidate.tracks !== 'number' &&
      typeof candidate.totalWords !== 'number' &&
      !candidate.look
    ) {
      return {
        ok: false,
        error: 'JSON does not match Skyward Stroke save data format.',
      };
    }

    const clampNum = (v: unknown, fallback: number, min = 0, max = 1_000_000) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

    const look: Look = {
      outfit: typeof candidate.look?.outfit === 'string' ? candidate.look.outfit : defaultStats.look.outfit,
      hat: typeof candidate.look?.hat === 'string' ? candidate.look.hat : defaultStats.look.hat,
      trail: typeof candidate.look?.trail === 'string' ? candidate.look.trail : defaultStats.look.trail,
    };

    const ghosts: Record<string, Ghost> = {};
    if (candidate.ghosts && typeof candidate.ghosts === 'object') {
      for (const [k, v] of Object.entries(candidate.ghosts)) {
        const g = v as Partial<Ghost>;
        if (g && Array.isArray(g.times) && typeof g.wpm === 'number') {
          ghosts[k] = {
            times: g.times.filter((n): n is number => typeof n === 'number'),
            wpm: Math.max(0, Math.round(g.wpm)),
            text: typeof g.text === 'string' ? g.text : undefined,
          };
        }
      }
    }

    const rawSettings = (candidate.settings || {}) as Partial<PlaySettings>;
    const enabledPunct = Array.isArray(rawSettings.enabledPunctuation)
      ? rawSettings.enabledPunctuation.filter((c): c is PunctuationChar =>
          (PUNCTUATION_CHARS as readonly string[]).includes(c)
        )
      : DEFAULT_PLAY_SETTINGS.enabledPunctuation;

    const settings: PlaySettings = {
      uppercase: typeof rawSettings.uppercase === 'boolean' ? rawSettings.uppercase : DEFAULT_PLAY_SETTINGS.uppercase,
      punctuation: typeof rawSettings.punctuation === 'boolean' ? rawSettings.punctuation : DEFAULT_PLAY_SETTINGS.punctuation,
      enabledPunctuation: enabledPunct.length > 0 ? enabledPunct : [...DEFAULT_PLAY_SETTINGS.enabledPunctuation],
      numbers: typeof rawSettings.numbers === 'boolean' ? rawSettings.numbers : DEFAULT_PLAY_SETTINGS.numbers,
      linesPerTrack: clampNum(rawSettings.linesPerTrack, DEFAULT_PLAY_SETTINGS.linesPerTrack, 2, 10),
      soundProfile:
        rawSettings.soundProfile && ['crystalline', 'thocky', 'marimba', 'synthwave'].includes(rawSettings.soundProfile)
          ? rawSettings.soundProfile
          : DEFAULT_PLAY_SETTINGS.soundProfile,
      sfxVolume:
        typeof rawSettings.sfxVolume === 'number' && Number.isFinite(rawSettings.sfxVolume)
          ? Math.min(1, Math.max(0, rawSettings.sfxVolume))
          : DEFAULT_PLAY_SETTINGS.sfxVolume,
      musicVolume:
        typeof rawSettings.musicVolume === 'number' && Number.isFinite(rawSettings.musicVolume)
          ? Math.min(1, Math.max(0, rawSettings.musicVolume))
          : DEFAULT_PLAY_SETTINGS.musicVolume,
      deviceMode:
        rawSettings.deviceMode &&
        ['desktop', 'mobile-native', 'touch-virtual'].includes(rawSettings.deviceMode)
          ? rawSettings.deviceMode
          : DEFAULT_PLAY_SETTINGS.deviceMode,
      deviceSelected:
        typeof rawSettings.deviceSelected === 'boolean'
          ? rawSettings.deviceSelected
          : DEFAULT_PLAY_SETTINGS.deviceSelected,
      autoShiftVirtual:
        typeof rawSettings.autoShiftVirtual === 'boolean'
          ? rawSettings.autoShiftVirtual
          : DEFAULT_PLAY_SETTINGS.autoShiftVirtual,
    };

    const merged: Stats = {
      bestWpm: clampNum(candidate.bestWpm, defaultStats.bestWpm, 0, 500),
      lastWpm: clampNum(candidate.lastWpm, defaultStats.lastWpm, 0, 500),
      bestAcc: clampNum(candidate.bestAcc, defaultStats.bestAcc, 0, 100),
      highestCombo: clampNum(candidate.highestCombo, defaultStats.highestCombo, 0, 100000),
      totalWords: clampNum(candidate.totalWords, defaultStats.totalWords, 0, 10_000_000),
      tracks: clampNum(candidate.tracks, defaultStats.tracks, 0, 1_000_000),
      unlocked: clampNum(candidate.unlocked, defaultStats.unlocked, 1, 20),
      look,
      ghosts,
      settings,
    };

    return { ok: true, stats: merged };
  } catch {
    return { ok: false, error: 'Invalid JSON syntax. Please check your backup file or pasted text.' };
  }
}
