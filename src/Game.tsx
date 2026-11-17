import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Engine } from './Engine';
import Keyboard, { type KeyMetrics } from './Keyboard';
import { WORLDS, trackText, legacyTrackText, zenChunk, type Stats, type World } from './data';
import {
  initAudio,
  playKey,
  playWordComplete,
  playMiss,
  playStep,
  playChime,
  playVictory,
  startMusic,
  stopMusic,
  setSoundProfile,
  setSfxVolume,
  setMusicVolume,
} from './audio';
import {
  DEFAULT_PLAY_SETTINGS,
  extractNativeInputChars,
  type DeviceMode,
  type PlaySettings,
} from './utils/gameLogic';

export type Mode = 'journey' | 'zen' | 'ghost';
export interface Result {
  wpm: number;
  acc: number;
  maxCombo: number;
  words: number;
  times: number[];
  text: string;
  newBest: boolean;
}

const TIERS = ['#ffffff', '#3fd67a', '#ffc53d', '#ff5fd2'];
/** Zen mode always keeps at least this many characters queued up ahead of the caret. */
const ZEN_BUFFER = 110;
const NATIVE_SENTINEL = '\u200B';
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Kind = 'compact' | 'narrow' | 'regular';
interface Layout {
  kind: Kind;
  fontSize: number;
  promptGap: number;
  keys: KeyMetrics;
}

function layoutFor(w: number, h: number, keyboard: boolean, hasNumRow: boolean): Layout {
  const kind: Kind = h < 500 && w > h * 1.15 ? 'compact' : w < 640 ? 'narrow' : 'regular';
  // Virtual keyboard now always has 5 rows (Punctuation + 3 QWERTY + Bottom), or 6 when Numbers row is open
  const rows = hasNumRow ? 6 : 5;
  const keys: KeyMetrics =
    kind === 'compact'
      ? { gap: 4, padTop: 3, keyMaxW: 74, keyH: Math.round(clamp((h * 0.48 - 9) / rows - 4, 22, 40)) }
      : kind === 'narrow'
        ? { gap: 5, padTop: 5, keyMaxW: 54, keyH: Math.round(clamp(h * 0.052, 32, 48)) }
        : { gap: 7, padTop: 7, keyMaxW: 80, keyH: Math.round(clamp(h * 0.048, 38, 54)) };
  const keyboardH = keyboard ? rows * (keys.keyH + keys.gap) + keys.padTop + 6 : 0;
  const fontSize = Math.round(
    kind === 'compact'
      ? clamp(h * 0.05, 15, 20)
      : kind === 'narrow'
        ? clamp(w * 0.056, 18, 26)
        : clamp(w * 0.034, 24, 36)
  );
  const promptGap = kind === 'regular' ? Math.round(clamp((h - keyboardH) * 0.12 - 44, 6, 86)) : 6;
  return { kind, fontSize, promptGap, keys };
}

function zenText(world: World, settings: PlaySettings) {
  let text = zenChunk(world, settings);
  while (text.length < ZEN_BUFFER) text += ' ' + zenChunk(world, settings);
  return text;
}

export default function Game({
  mode,
  worldIdx,
  stats,
  onExit,
  onFinish,
  onChangeDeviceMode,
}: {
  mode: Mode;
  worldIdx: number;
  stats: Stats;
  onExit: (words: number, maxCombo: number) => void;
  onFinish: (r: Result) => void;
  onChangeDeviceMode?: (deviceMode: DeviceMode) => void;
}) {
  const world = WORLDS[worldIdx] || WORLDS[0];
  const playSettings = stats.settings || DEFAULT_PLAY_SETTINGS;
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const freeRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nativeInputRef = useRef<HTMLInputElement>(null);
  const engRef = useRef<Engine | null>(null);

  // What this run is typed on. A ghost is always raced on the exact text it was recorded on.
  const [run] = useState(() => {
    if (mode === 'zen') return { text: zenText(world, playSettings), ghost: null };
    const g = mode === 'ghost' ? stats.ghosts[world.id] : undefined;
    if (g) {
      const text = g.text ?? legacyTrackText(world);
      if (g.times.length === text.length) return { text, ghost: g };
    }
    return { text: trackText(world, playSettings), ghost: null };
  });

  const s = useRef({
    text: run.text,
    typed: 0,
    combo: 0,
    maxCombo: 0,
    correct: 0,
    errors: 0,
    start: 0,
    times: [] as number[],
    done: false,
    words: 0,
  });
  const [, setTick] = useState(0);
  const [err, setErr] = useState(false);
  const [muted, setMuted] = useState(false);
  const [now, setNow] = useState(0);
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [deviceMode, setDeviceMode] = useState<DeviceMode>(() => playSettings.deviceMode || 'desktop');
  const [nativeFocused, setNativeFocused] = useState(false);
  const [nativeVal, setNativeVal] = useState(NATIVE_SENTINEL);
  const rerender = () => setTick(t => t + 1);

  const showKb = deviceMode === 'touch-virtual';
  const isMobileNative = deviceMode === 'mobile-native';

  const switchDeviceMode = useCallback(
    (nextMode: DeviceMode) => {
      setDeviceMode(nextMode);
      onChangeDeviceMode?.(nextMode);
      if (nextMode === 'mobile-native') {
        setTimeout(() => nativeInputRef.current?.focus(), 30);
      } else {
        nativeInputRef.current?.blur();
      }
    },
    [onChangeDeviceMode]
  );

  useEffect(() => {
    document.body.dataset.state = 'playing';
    document.body.dataset.deviceMode = deviceMode;
    setSoundProfile(playSettings.soundProfile);
    setSfxVolume(playSettings.sfxVolume);
    setMusicVolume(playSettings.musicVolume);
  }, [playSettings, deviceMode]);

  // Auto-focus native input when starting in mobile-native mode
  useEffect(() => {
    if (deviceMode === 'mobile-native') {
      const t = setTimeout(() => nativeInputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [deviceMode]);

  useEffect(() => {
    const e = new Engine(canvasRef.current!, world, stats.look);
    e.showFinish = mode !== 'zen';
    e.onStep = playStep;
    e.setText(s.current.text, s.current.typed);
    if (run.ghost) e.setGhost(run.ghost.times);
    engRef.current = e;

    const measure = () => {
      const root = rootRef.current,
        stage = stageRef.current,
        free = freeRef.current;
      if (!root || !stage || !free) return;
      const a = stage.getBoundingClientRect(),
        b = free.getBoundingClientRect();
      e.setViewport(a.width, a.height, {
        top: b.top - a.top,
        right: a.right - b.right,
        bottom: a.bottom - b.bottom,
        left: b.left - a.left,
      });
      const w = root.clientWidth,
        h = window.visualViewport ? Math.round(window.visualViewport.height) : root.clientHeight;
      setSize(p => (p.w === w && p.h === h ? p : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [rootRef.current, stageRef.current, freeRef.current]) {
      if (el) ro.observe(el);
    }
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    const iv = setInterval(() => setNow(performance.now()), 250);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      clearInterval(iv);
      e.dispose();
      engRef.current = null;
      stopMusic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(m => {
      const next = !m;
      setSfxVolume(next ? 0 : playSettings.sfxVolume);
      setMusicVolume(next ? 0 : playSettings.musicVolume);
      return next;
    });
  }, [playSettings.sfxVolume, playSettings.musicVolume]);

  const press = useCallback(
    (rawKey: string) => {
      const st = s.current;
      const e = engRef.current;
      if (!e || st.done) return;
      initAudio();
      setSoundProfile(playSettings.soundProfile);
      if (!muted) {
        setSfxVolume(playSettings.sfxVolume);
        setMusicVolume(playSettings.musicVolume);
        startMusic();
      }
      if (!st.start) {
        st.start = performance.now();
        e.start();
      }
      const expected = st.text[st.typed];
      // When uppercase setting is off, normalize input to match expected lowercase text
      const key = playSettings.uppercase ? rawKey : rawKey.toLowerCase();

      if (key === expected) {
        st.typed++;
        st.combo++;
        st.correct++;
        st.maxCombo = Math.max(st.maxCombo, st.combo);
        st.times.push(Math.round(performance.now() - st.start));
        if (key === ' ') {
          st.words++;
          playWordComplete(st.combo);
        }
        playKey(st.combo, playSettings.soundProfile);
        e.correct(st.typed, st.combo);
        setErr(false);
        if (st.combo > 0 && st.combo % 10 === 0) playChime(st.combo);

        if (mode === 'zen' && st.text.length - st.typed < ZEN_BUFFER) {
          const more = ' ' + zenChunk(world, playSettings);
          st.text += more;
          e.appendText(more);
        }
        if (mode !== 'zen' && st.typed >= st.text.length) {
          st.done = true;
          st.words++;
          const mins = Math.max(0.01, (performance.now() - st.start) / 60000);
          const wpm = Math.round(st.text.length / 5 / mins);
          const acc = Math.round((st.correct / (st.correct + st.errors)) * 100);
          const prev = stats.ghosts[world.id];
          const newBest = !prev || wpm > prev.wpm;
          playVictory(newBest);
          setTimeout(
            () =>
              onFinish({
                wpm,
                acc,
                maxCombo: st.maxCombo,
                words: st.words,
                times: st.times,
                text: st.text,
                newBest,
              }),
            1250
          );
        }
      } else {
        st.errors++;
        st.combo = 0;
        playMiss();
        e.miss();
        setErr(true);
      }
      rerender();
    },
    [mode, muted, onFinish, playSettings, stats.ghosts, world]
  );

  // Handle input from the Mobile Native OS Keyboard <input> element
  const handleNativeChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const chars = extractNativeInputChars(e.target.value, NATIVE_SENTINEL);
      setNativeVal(NATIVE_SENTINEL);
      for (const ch of chars) {
        press(ch);
      }
    },
    [press]
  );

  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        onExit(s.current.words, s.current.maxCombo);
        return;
      }
      // If event originated inside the Mobile Native OS <input>, let handleNativeChange process printable input
      if (ev.target === nativeInputRef.current && ev.key !== 'Unidentified') {
        return;
      }
      if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.key.length !== 1) return;
      ev.preventDefault();
      press(ev.key);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [press, onExit]);

  const st = s.current;
  const expectedChar = st.text[st.typed];
  const tierCol = TIERS[Math.min(3, Math.floor(st.combo / 10))];
  const elapsed = st.start ? (now || performance.now()) - st.start : 0;
  const wpm = st.start && elapsed > 1000 ? Math.round(st.correct / 5 / (elapsed / 60000)) : 0;
  const acc = st.correct + st.errors ? Math.round((st.correct / (st.correct + st.errors)) * 100) : 100;
  const hasNumRow = Boolean(playSettings.numbers || (expectedChar && /^[0-9]$/.test(expectedChar)));
  const L = layoutFor(size.w, size.h, showKb, hasNumRow);
  const compact = L.kind === 'compact',
    narrow = L.kind === 'narrow';
  const pill = compact || narrow ? 'sm' : 'lg';

  const focusNativeKeyboard = () => {
    nativeInputRef.current?.focus();
  };

  const back = (
    <div className="flex items-center gap-1.5 pointer-events-auto shrink-0">
      <button
        type="button"
        aria-label="Back to menu"
        onClick={() => onExit(st.words, st.maxCombo)}
        className={`glass glass-btn rounded-xl text-white font-bold shadow cursor-pointer ${
          compact || narrow ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
        }`}
      >
        {compact || narrow ? '← Menu' : '← Menu'}
      </button>
      <button
        type="button"
        aria-label={muted ? 'Unmute audio' : 'Mute audio'}
        title={muted ? 'Unmute audio' : 'Mute audio'}
        onClick={e => {
          e.currentTarget.blur();
          toggleMute();
        }}
        className={`glass glass-btn rounded-xl text-white font-bold shadow cursor-pointer ${
          compact || narrow ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'
        }`}
      >
        {muted ? '🔇' : '🔊'}
      </button>

      {/* Live In-Game Device / Keyboard System Switcher */}
      <div
        role="group"
        aria-label="Input Device Mode"
        className="glass rounded-xl p-0.5 sm:p-1 flex items-center gap-0.5 sm:gap-1"
      >
        {(
          [
            ['desktop', '🖥️', 'Physical KB'],
            ['mobile-native', '📱', 'Device KB'],
            ['touch-virtual', '⌨️', 'Virtual KB'],
          ] as const
        ).map(([m, icon, label]) => {
          const active = deviceMode === m;
          return (
            <button
              key={m}
              type="button"
              aria-label={`Switch to ${label}`}
              aria-pressed={active}
              onClick={e => {
                e.currentTarget.blur();
                switchDeviceMode(m);
              }}
              className={`px-1.5 sm:px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-indigo-500 text-white shadow'
                  : 'text-white/75 hover:text-white hover:bg-white/10'
              }`}
            >
              {compact || narrow ? icon : `${icon} ${label}`}
            </button>
          );
        })}
      </div>
    </div>
  );

  const pills = mode !== 'zen' && (
    <div className={`flex shrink-0 text-white font-bold ${compact || narrow ? 'gap-1' : 'gap-2'}`}>
      <Stat label="WPM" value={wpm} size={pill} />
      <Stat label="ACC" value={acc + '%'} size={pill} />
      <Stat label="COMBO" value={'×' + st.combo} color={tierCol} size={pill} />
    </div>
  );

  const prompt = (className: string, maxCols?: number, style?: CSSProperties) => (
    <Prompt
      text={st.text}
      typed={st.typed}
      err={err}
      color={tierCol}
      fontSize={L.fontSize}
      progress={mode === 'zen' ? null : st.typed / Math.max(1, st.text.length)}
      maxCols={maxCols}
      className={`${className} ${isMobileNative ? 'pointer-events-auto cursor-text' : ''}`}
      style={style}
      onClick={isMobileNative ? focusNativeKeyboard : undefined}
    />
  );

  const flow =
    st.combo >= 30
      ? '✦ TRANSCENDENT FLOW ✦'
      : st.combo >= 20
        ? '★ GOLDEN FLOW ★'
        : st.combo >= 10
          ? '◆ IN THE FLOW ◆'
          : null;
  let note: ReactNode = null;
  if (flow) {
    note = (
      <span className="font-black tracking-wide" style={{ color: tierCol }}>
        {flow}
      </span>
    );
  } else if (!st.start) {
    const activeRules: string[] = [];
    if (playSettings.uppercase) activeRules.push('Aa');
    if (playSettings.punctuation) activeRules.push('Punct');
    if (playSettings.numbers) activeRules.push('0-9');
    const ruleSuffix = activeRules.length ? ` · [${activeRules.join(' + ')}]` : '';
    note =
      mode === 'ghost'
        ? run.ghost
          ? `👻 Racing your best · ${run.ghost.wpm} WPM${ruleSuffix}`
          : `👻 No ghost yet · set your first record${ruleSuffix}`
        : isMobileNative
          ? `📱 Tap dock or prompt to type with your Device Keyboard · ${world.name}${ruleSuffix}`
          : showKb
            ? `⌨️ Tap highlighted keys to begin · ${world.name}${ruleSuffix}`
            : `🖥️ Start typing to begin · ${world.name}${ruleSuffix} · Esc to exit`;
  }

  return (
    <div
      ref={rootRef}
      className="game-root fixed inset-0 flex flex-col overflow-hidden"
      style={{ background: `linear-gradient(180deg, ${world.sky[0]}, ${world.sky[1]})` }}
    >
      <div ref={stageRef} className="relative flex-1 min-h-0">
        <div
          className={`absolute inset-0 transition-[filter] duration-300 ${
            err ? 'saturate-[0.25] brightness-95' : ''
          }`}
        >
          <canvas
            ref={canvasRef}
            data-testid="game-canvas"
            className="absolute inset-0 block w-full h-full"
          />
        </div>

        {/* HUD overlay */}
        <div
          className={`hud absolute inset-0 flex flex-col pointer-events-none ${
            compact ? 'hud-compact' : ''
          } ${showKb || isMobileNative ? 'hud-kb' : ''}`}
        >
          {compact ? (
            <div className="flex items-center gap-2">
              {back}
              {prompt('flex-1 min-w-0')}
              {pills}
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                {back}
                {pills}
              </div>
              {prompt(narrow ? 'shrink-0' : 'shrink-0 self-center', narrow ? undefined : 42, {
                marginTop: L.promptGap,
              })}
              <div
                className="note shrink-0"
                style={
                  narrow
                    ? { height: 26, lineHeight: '26px', fontSize: 13 }
                    : { height: 36, lineHeight: '36px', fontSize: 16 }
                }
              >
                {note}
              </div>
            </>
          )}
          <div ref={freeRef} className="relative flex-1 min-h-0">
            {compact && note && <div className="note absolute right-0 top-1 text-xs">{note}</div>}
          </div>
        </div>

        {deviceMode === 'desktop' && (
          <button
            type="button"
            aria-label="Show the on-screen keyboard"
            title="Show the on-screen keyboard"
            onClick={() => switchDeviceMode('touch-virtual')}
            className={`glass glass-btn absolute z-20 rounded-full text-white shadow cursor-pointer ${
              compact ? 'w-8 h-8 text-sm' : 'w-10 h-10'
            }`}
            style={{
              right: 'max(8px, env(safe-area-inset-right))',
              bottom: 'max(8px, env(safe-area-inset-bottom))',
            }}
          >
            ⌨
          </button>
        )}
      </div>

      {/* MOBILE NATIVE OS KEYBOARD DOCK */}
      {isMobileNative && (
        <div
          data-testid="native-keyboard-dock"
          onClick={focusNativeKeyboard}
          className="relative z-20 bg-slate-950/92 border-t border-white/25 px-3 py-2.5 flex items-center justify-between gap-2 text-white cursor-text"
          style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                nativeFocused ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400'
              }`}
            />
            <label
              htmlFor="native-os-input"
              className="text-xs sm:text-sm font-bold whitespace-nowrap cursor-text"
            >
              {narrow
                ? nativeFocused
                  ? '📱 OS Keyboard Ready'
                  : '📱 Tap for OS KB'
                : nativeFocused
                  ? '📱 Device OS Keyboard Ready — Type on your mobile keyboard'
                  : '📱 Tap here to open your Mobile Device Keyboard'}
            </label>
            <input
              id="native-os-input"
              ref={nativeInputRef}
              data-testid="native-keyboard-input"
              type="text"
              inputMode="text"
              autoCapitalize={playSettings.uppercase ? 'sentences' : 'none'}
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              value={nativeVal}
              onFocus={() => setNativeFocused(true)}
              onBlur={() => setNativeFocused(false)}
              onChange={handleNativeChange}
              aria-label="Mobile Device OS Keyboard Input"
              className="w-10 sm:w-20 px-1.5 py-1 rounded-lg bg-white/15 border border-white/30 text-white text-center font-mono text-xs focus:outline-none focus:border-emerald-400 focus:bg-white/20"
            />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {expectedChar && (
              <div className="px-2 py-1 rounded-lg bg-indigo-600/90 border border-indigo-300/40 text-xs font-mono font-bold whitespace-nowrap">
                Next:{' '}
                <span className="text-amber-300 font-black">
                  {expectedChar === ' ' ? '␣' : expectedChar}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                switchDeviceMode('touch-virtual');
              }}
              className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              {narrow ? '⌨️ Virtual' : '⌨️ Use Virtual KB'}
            </button>
          </div>
        </div>
      )}

      {/* BUILT-IN VIRTUAL KEYBOARD */}
      {showKb && (
        <Keyboard
          onKey={press}
          onHide={() => switchDeviceMode('desktop')}
          onSwitchToNative={() => switchDeviceMode('mobile-native')}
          metrics={L.keys}
          settings={playSettings}
          expectedChar={expectedChar}
        />
      )}
    </div>
  );
}

function Prompt({
  text,
  typed,
  err,
  color,
  fontSize,
  progress,
  maxCols,
  className = '',
  style,
  onClick,
}: {
  text: string;
  typed: number;
  err: boolean;
  color: string;
  fontSize: number;
  progress: number | null;
  maxCols?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current!;
    const read = () => setWidth(el.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cw = Math.round(fontSize * 0.62);
  const cols = Math.max(10, Math.floor((width || 320) / cw));
  const lead = clamp(Math.round(cols * 0.3), 4, 14);
  const from = Math.max(0, typed - lead - 1),
    to = Math.min(text.length, typed + cols - lead + 1);
  const cells: ReactNode[] = [];
  for (let i = from; i < to; i++) {
    const done = i < typed;
    const ch = text[i];
    const isPunct = !/[a-zA-Z0-9 ]/.test(ch);
    cells.push(
      <span
        key={i}
        className="tape-ch"
        style={{
          left: i * cw,
          color: done
            ? color
            : i === typed
              ? err
                ? '#ffb1b1'
                : '#ffffff'
              : isPunct
                ? 'rgba(255, 232, 158, 0.92)'
                : 'rgba(255, 255, 255, 0.78)',
          textShadow: done ? `0 0 .45em ${color}` : undefined,
        }}
      >
        {ch}
      </span>
    );
  }
  return (
    <div
      ref={ref}
      onClick={onClick}
      data-testid="typing-prompt"
      className={`prompt glass glass-deep font-mono font-medium ${err ? 'prompt-err' : ''} ${className}`}
      style={
        {
          fontSize,
          width: maxCols ? `min(100%, ${maxCols * cw}px)` : undefined,
          '--cw': `${cw}px`,
          '--lead': lead,
          ...style,
        } as CSSProperties
      }
    >
      <div className="prompt-window">
        <div className="tape" style={{ transform: `translateX(${-typed * cw}px)` }}>
          {cells}
        </div>
        <div className="caret" />
      </div>
      {progress !== null && (
        <div className="prompt-progress" style={{ width: `${progress * 100}%` }} />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  size,
}: {
  label: string;
  value: string | number;
  color?: string;
  size: 'sm' | 'md' | 'lg';
}) {
  const box =
    size === 'sm'
      ? 'w-[46px] py-0.5 rounded-lg'
      : size === 'md'
        ? 'min-w-[60px] px-2 py-1.5 rounded-xl'
        : 'min-w-[74px] px-3 py-1.5 rounded-xl';
  return (
    <div className={`glass text-center tabular-nums ${box}`}>
      <div className={`opacity-75 tracking-widest ${size === 'sm' ? 'text-[8px] leading-3' : 'text-[10px]'}`}>
        {label}
      </div>
      <div className={`leading-tight ${size === 'sm' ? 'text-sm' : 'text-lg'}`} style={{ color }}>
        {value}
      </div>
    </div>
  );
}
