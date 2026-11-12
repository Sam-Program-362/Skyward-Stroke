import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Engine } from './Engine';
import Keyboard, { type KeyMetrics } from './Keyboard';
import { WORLDS, trackText, legacyTrackText, zenChunk, type Stats, type World } from './data';
import { initAudio, playKey, playMiss, playStep, playChime, startMusic, stopMusic } from './audio';

export type Mode = 'journey' | 'zen' | 'ghost';
export interface Result { wpm: number; acc: number; maxCombo: number; words: number; times: number[]; text: string; newBest: boolean }

const TIERS = ['#ffffff', '#3fd67a', '#ffc53d', '#ff5fd2'];
/** Zen mode always keeps at least this many characters queued up ahead of the caret. */
const ZEN_BUFFER = 110;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/*
 * Three arrangements, chosen from the size of the window rather than the kind of device:
 *   compact  short and wide (a phone held sideways): back button, prompt and stats share one row
 *   narrow   a phone held upright: stats row, then a full-width prompt
 *   regular  tablets and desktops: stats in the corners, prompt centred below them
 */
type Kind = 'compact' | 'narrow' | 'regular';
interface Layout { kind: Kind; fontSize: number; promptGap: number; keys: KeyMetrics }

function layoutFor(w: number, h: number, keyboard: boolean): Layout {
  const kind: Kind = h < 500 && w > h * 1.15 ? 'compact' : w < 640 ? 'narrow' : 'regular';
  const keys: KeyMetrics =
    kind === 'compact' ? { gap: 4, padTop: 3, keyMaxW: 76, keyH: Math.round(clamp((h * 0.46 - 9) / 4 - 4, 24, 44)) }
    : kind === 'narrow' ? { gap: 5, padTop: 5, keyMaxW: 56, keyH: Math.round(clamp(h * 0.062, 38, 56)) }
    : { gap: 8, padTop: 8, keyMaxW: 84, keyH: Math.round(clamp(h * 0.058, 46, 64)) };
  const keyboardH = keyboard ? 4 * (keys.keyH + keys.gap) + keys.padTop + 6 : 0;
  const fontSize = Math.round(kind === 'compact' ? clamp(h * 0.05, 15, 20) : kind === 'narrow' ? clamp(w * 0.056, 18, 26) : clamp(w * 0.034, 24, 36));
  // on big screens the prompt hangs a little way down; on short ones it tucks up under the stats
  const promptGap = kind === 'regular' ? Math.round(clamp((h - keyboardH) * 0.16 - 60, 6, 120)) : 6;
  return { kind, fontSize, promptGap, keys };
}

function zenText(world: World) {
  let text = zenChunk(world);
  while (text.length < ZEN_BUFFER) text += ' ' + zenChunk(world);
  return text;
}

export default function Game({ mode, worldIdx, stats, onExit, onFinish }: {
  mode: Mode; worldIdx: number; stats: Stats; onExit: (words: number, maxCombo: number) => void; onFinish: (r: Result) => void;
}) {
  const world = WORLDS[worldIdx];
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const freeRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engRef = useRef<Engine | null>(null);

  // What this run is typed on. A ghost is always raced on the exact text it was recorded on.
  const [run] = useState(() => {
    if (mode === 'zen') return { text: zenText(world), ghost: null };
    const g = mode === 'ghost' ? stats.ghosts[world.id] : undefined;
    if (g) {
      const text = g.text ?? legacyTrackText(world);
      if (g.times.length === text.length) return { text, ghost: g };
    }
    return { text: trackText(world), ghost: null };
  });
  const s = useRef({ text: run.text, typed: 0, combo: 0, maxCombo: 0, correct: 0, errors: 0, start: 0, times: [] as number[], done: false, words: 0 });
  const [, setTick] = useState(0);
  const [err, setErr] = useState(false);
  const [now, setNow] = useState(0);
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [showKb, setShowKb] = useState(() => matchMedia('(pointer: coarse)').matches);
  const kbChosen = useRef(false); // true once the player has shown or hidden the on-screen keyboard themselves
  const rerender = () => setTick(t => t + 1);

  useEffect(() => {
    const e = new Engine(canvasRef.current!, world, stats.look);
    e.showFinish = mode !== 'zen';
    e.onStep = playStep;
    e.setText(s.current.text, s.current.typed);
    if (run.ghost) e.setGhost(run.ghost.times);
    engRef.current = e;

    // Keep the engine told how big the canvas is and which part of it is free of UI. This runs
    // whenever anything changes size: window resized, device rotated, keyboard shown or hidden.
    const measure = () => {
      const root = rootRef.current, stage = stageRef.current, free = freeRef.current;
      if (!root || !stage || !free) return;
      const a = stage.getBoundingClientRect(), b = free.getBoundingClientRect();
      e.setViewport(a.width, a.height, { top: b.top - a.top, right: a.right - b.right, bottom: a.bottom - b.bottom, left: b.left - a.left });
      const w = root.clientWidth, h = root.clientHeight;
      setSize(p => (p.w === w && p.h === h ? p : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [rootRef.current, stageRef.current, freeRef.current]) if (el) ro.observe(el);
    window.addEventListener('resize', measure);
    const iv = setInterval(() => setNow(performance.now()), 250);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); clearInterval(iv); e.dispose(); engRef.current = null; stopMusic(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const press = useCallback((key: string) => {
    const st = s.current; const e = engRef.current;
    if (!e || st.done) return;
    initAudio(); startMusic();
    if (!st.start) { st.start = performance.now(); e.start(); }
    const expected = st.text[st.typed];
    if (key === expected) {
      st.typed++; st.combo++; st.correct++; st.maxCombo = Math.max(st.maxCombo, st.combo);
      st.times.push(Math.round(performance.now() - st.start));
      if (key === ' ') st.words++;
      playKey(st.combo); e.correct(st.typed, st.combo); setErr(false);
      if (st.combo > 0 && st.combo % 10 === 0) playChime();
      if (mode === 'zen' && st.text.length - st.typed < ZEN_BUFFER) { const more = ' ' + zenChunk(world); st.text += more; e.appendText(more); }
      if (mode !== 'zen' && st.typed >= st.text.length) {
        st.done = true; st.words++;
        const mins = (performance.now() - st.start) / 60000;
        const wpm = Math.round(st.text.length / 5 / mins);
        const acc = Math.round((st.correct / (st.correct + st.errors)) * 100);
        const prev = stats.ghosts[world.id];
        playChime(); setTimeout(playChime, 300);
        setTimeout(() => onFinish({ wpm, acc, maxCombo: st.maxCombo, words: st.words, times: st.times, text: st.text, newBest: !prev || wpm > prev.wpm }), 1400);
      }
    } else {
      st.errors++; st.combo = 0; playMiss(); e.miss(); setErr(true);
    }
    rerender();
  }, [mode, onFinish, stats, world]);

  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { onExit(s.current.words, s.current.maxCombo); return; }
      if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.key.length !== 1) return;
      ev.preventDefault();
      if (!kbChosen.current) setShowKb(false); // a real keyboard is in use: give its space back to the scene
      press(ev.key.toLowerCase());
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [press, onExit]);

  const st = s.current;
  const tierCol = TIERS[Math.min(3, Math.floor(st.combo / 10))];
  const elapsed = st.start ? (now || performance.now()) - st.start : 0;
  const wpm = st.start && elapsed > 1000 ? Math.round(st.correct / 5 / (elapsed / 60000)) : 0;
  const acc = st.correct + st.errors ? Math.round((st.correct / (st.correct + st.errors)) * 100) : 100;
  const L = layoutFor(size.w, size.h, showKb);
  const compact = L.kind === 'compact', narrow = L.kind === 'narrow';
  const pill = compact ? 'sm' : narrow ? 'md' : 'lg';

  const back = (
    <button type="button" aria-label="Back to menu" onClick={() => onExit(st.words, st.maxCombo)}
      className={`glass glass-btn pointer-events-auto shrink-0 rounded-xl text-white font-bold shadow ${compact ? 'w-9 h-9 text-base' : 'px-3 py-2 text-sm'}`}>
      {compact ? '←' : '← Menu'}
    </button>
  );
  const pills = mode !== 'zen' && (
    <div className={`flex shrink-0 text-white font-bold ${compact ? 'gap-1' : 'gap-2'}`}>
      <Stat label="WPM" value={wpm} size={pill} />
      <Stat label="ACC" value={acc + '%'} size={pill} />
      <Stat label="COMBO" value={'×' + st.combo} color={tierCol} size={pill} />
    </div>
  );
  const prompt = (className: string, maxCols?: number, style?: CSSProperties) => (
    <Prompt text={st.text} typed={st.typed} err={err} color={tierCol} fontSize={L.fontSize}
      progress={mode === 'zen' ? null : st.typed / Math.max(1, st.text.length)} maxCols={maxCols} className={className} style={style} />
  );

  // one line under the prompt: how to begin, then the flow banner once a combo is running
  const flow = st.combo >= 30 ? '✦ TRANSCENDENT FLOW ✦' : st.combo >= 20 ? '★ GOLDEN FLOW ★' : st.combo >= 10 ? '◆ IN THE FLOW ◆' : null;
  let note: ReactNode = null;
  if (flow) note = <span className="font-black" style={{ color: tierCol }}>{flow}</span>;
  else if (!st.start) {
    note = mode === 'ghost'
      ? (run.ghost ? `👻 Racing your best · ${run.ghost.wpm} WPM` : '👻 No ghost yet · set your first record')
      : showKb ? 'Tap the keys to begin' : 'Start typing to begin · Esc to exit';
  }

  return (
    <div ref={rootRef} className="game-root fixed inset-0 flex flex-col overflow-hidden" style={{ background: `linear-gradient(180deg, ${world.sky[0]}, ${world.sky[1]})` }}>
      <div ref={stageRef} className="relative flex-1 min-h-0">
        <div className={`absolute inset-0 transition-[filter] duration-300 ${err ? 'saturate-[0.25] brightness-95' : ''}`}>
          <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />
        </div>

        {/* Everything drawn over the scene. The empty box at the end is the space left for the runner. */}
        <div className={`hud absolute inset-0 flex flex-col pointer-events-none ${compact ? 'hud-compact' : ''} ${showKb ? 'hud-kb' : ''}`}>
          {compact ? (
            <div className="flex items-center gap-2">
              {back}
              {prompt('flex-1 min-w-0')}
              {pills}
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">{back}{pills}</div>
              {prompt(narrow ? 'shrink-0' : 'shrink-0 self-center', narrow ? undefined : 40, { marginTop: L.promptGap })}
              <div className="note shrink-0" style={narrow ? { height: 26, lineHeight: '26px', fontSize: 14 } : { height: 36, lineHeight: '36px', fontSize: 17 }}>{note}</div>
            </>
          )}
          <div ref={freeRef} className="relative flex-1 min-h-0">
            {compact && note && <div className="note absolute right-0 top-1 text-xs">{note}</div>}
          </div>
        </div>

        {/* while the keyboard is up, its own corner key hides it; this brings it back */}
        {!showKb && (
          <button type="button" aria-label="Show the on-screen keyboard" title="Show the on-screen keyboard"
            onClick={() => { kbChosen.current = true; setShowKb(true); }}
            className={`glass glass-btn absolute z-20 rounded-full text-white shadow ${compact ? 'w-8 h-8 text-sm' : 'w-10 h-10'}`}
            style={{ right: 'max(8px, env(safe-area-inset-right))', bottom: 'max(8px, env(safe-area-inset-bottom))' }}>⌨</button>
        )}
      </div>

      {showKb && <Keyboard onKey={press} onHide={() => { kbChosen.current = true; setShowKb(false); }} metrics={L.keys} />}
    </div>
  );
}

/**
 * The text to type, as a single line that slides under a caret that stays put. Each character
 * sits in its own fixed-width cell, so the line fits a box of any width and never wraps or
 * spills out of it.
 */
function Prompt({ text, typed, err, color, fontSize, progress, maxCols, className = '', style }: {
  text: string; typed: number; err: boolean; color: string; fontSize: number; progress: number | null;
  maxCols?: number; className?: string; style?: CSSProperties;
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

  const cw = Math.round(fontSize * 0.62);                 // one cell; whole pixels keep the letters crisp
  const cols = Math.max(10, Math.floor((width || 320) / cw));
  const lead = clamp(Math.round(cols * 0.3), 4, 14);      // cells of already-typed text kept behind the caret
  const from = Math.max(0, typed - lead - 1), to = Math.min(text.length, typed + cols - lead + 1);
  const cells: ReactNode[] = [];
  for (let i = from; i < to; i++) {
    const done = i < typed;
    cells.push(
      <span key={i} className="tape-ch" style={{ left: i * cw, color: done ? color : i === typed ? (err ? '#ffb1b1' : '#fff') : 'rgba(255,255,255,.74)', textShadow: done ? `0 0 .45em ${color}` : undefined }}>
        {text[i]}
      </span>,
    );
  }
  return (
    <div ref={ref} className={`prompt glass glass-deep font-mono font-medium ${err ? 'prompt-err' : ''} ${className}`}
      style={{ fontSize, width: maxCols ? `min(100%, ${maxCols * cw}px)` : undefined, '--cw': `${cw}px`, '--lead': lead, ...style } as CSSProperties}>
      <div className="prompt-window">
        <div className="tape" style={{ transform: `translateX(${-typed * cw}px)` }}>{cells}</div>
        <div className="caret" />
      </div>
      {progress !== null && <div className="prompt-progress" style={{ width: `${progress * 100}%` }} />}
    </div>
  );
}

function Stat({ label, value, color, size }: { label: string; value: string | number; color?: string; size: 'sm' | 'md' | 'lg' }) {
  const box = size === 'sm' ? 'w-[46px] py-0.5 rounded-lg' : size === 'md' ? 'min-w-[60px] px-2 py-1.5 rounded-xl' : 'min-w-[72px] px-3 py-1.5 rounded-xl';
  return (
    <div className={`glass text-center tabular-nums ${box}`}>
      <div className={`opacity-75 tracking-widest ${size === 'sm' ? 'text-[8px] leading-3' : 'text-[10px]'}`}>{label}</div>
      <div className={`leading-tight ${size === 'sm' ? 'text-sm' : 'text-lg'}`} style={{ color }}>{value}</div>
    </div>
  );
}
