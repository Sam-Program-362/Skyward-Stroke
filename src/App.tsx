import { useState, useCallback, useEffect, useRef, type ChangeEvent } from 'react';
import Game, { type Mode, type Result } from './Game';
import {
  WORLDS,
  OUTFITS,
  HATS,
  TRAILS,
  loadStats,
  saveStats,
  defaultStats,
  level,
  type Stats,
} from './data';
import {
  initAudio,
  playKey,
  playChime,
  playWordComplete,
  setSoundProfile,
  setSfxVolume,
  setMusicVolume,
} from './audio';
import { APP_NAME, APP_NAME_WORDS, APP_CODE_NAME, APP_TAGLINE } from './config';
import {
  PUNCTUATION_CHARS,
  DEFAULT_PLAY_SETTINGS,
  applyPlaySettingsToLine,
  getPlayerRank,
  serializeBackupData,
  parseBackupData,
  type PlaySettings,
  type PunctuationChar,
  type SoundProfile,
  type DeviceMode,
} from './utils/gameLogic';
import {
  renderMetadataCard,
  downloadMetadataImage,
  shareMetadataImage,
  downloadBackupJson,
} from './utils/shareCard';

type Screen = 'menu' | 'game' | 'result' | 'closet' | 'stats' | 'settings';

export default function App() {
  const [stats, setStats] = useState<Stats>(loadStats);
  const [screen, setScreen] = useState<Screen>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1' ? 'game' : 'menu';
  });
  const [mode, setMode] = useState<Mode>('journey');
  const [world, setWorld] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [runId, setRunId] = useState(0);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [pasteJson, setPasteJson] = useState('');
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);

  const cardCanvasRef = useRef<HTMLCanvasElement>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const playSettings: PlaySettings = stats.settings || DEFAULT_PLAY_SETTINGS;

  useEffect(() => {
    if (screen === 'game') {
      document.body.dataset.state = 'playing';
    } else if (screen === 'result') {
      document.body.dataset.state = 'gameover';
    } else {
      document.body.dataset.state = 'title';
    }
  }, [screen]);

  useEffect(() => {
    if (screen === 'stats' && cardCanvasRef.current) {
      renderMetadataCard({ stats, worldIdx: world, mode }, cardCanvasRef.current);
    }
    if (screen === 'result' && result && resultCanvasRef.current) {
      renderMetadataCard({ stats, worldIdx: world, mode, result }, resultCanvasRef.current);
    }
  }, [screen, stats, world, mode, result]);

  const showNotice = (type: 'ok' | 'err', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(prev => (prev?.msg === msg ? null : prev)), 4000);
  };

  const update = useCallback((s: Stats) => {
    setStats(s);
    saveStats(s);
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<PlaySettings>) => {
      setStats(prev => {
        const cur = prev.settings || DEFAULT_PLAY_SETTINGS;
        const nextSettings: PlaySettings = { ...cur, ...patch };
        setSoundProfile(nextSettings.soundProfile);
        setSfxVolume(nextSettings.sfxVolume);
        setMusicVolume(nextSettings.musicVolume);
        const next: Stats = { ...prev, settings: nextSettings };
        saveStats(next);
        return next;
      });
    },
    []
  );

  const click = (comboTone = 1) => {
    initAudio();
    setSoundProfile(playSettings.soundProfile);
    setSfxVolume(playSettings.sfxVolume);
    setMusicVolume(playSettings.musicVolume);
    playKey(comboTone, playSettings.soundProfile);
  };

  const play = useCallback(
    (m: Mode, w: number) => {
      initAudio();
      setSoundProfile(playSettings.soundProfile);
      playKey(2, playSettings.soundProfile);
      setMode(m);
      setWorld(w);
      setRunId(r => r + 1);
      setScreen('game');
    },
    [playSettings.soundProfile]
  );

  const onExit = useCallback((words: number, maxCombo: number) => {
    setStats(prev => {
      const s: Stats = {
        ...prev,
        totalWords: prev.totalWords + words,
        highestCombo: Math.max(prev.highestCombo, maxCombo),
      };
      saveStats(s);
      return s;
    });
    setScreen('menu');
  }, []);

  const onFinish = useCallback(
    (r: Result) => {
      setStats(prev => {
        const wid = WORLDS[world].id;
        const ghosts = { ...prev.ghosts };
        if (r.newBest) ghosts[wid] = { times: r.times, wpm: r.wpm, text: r.text };
        const s: Stats = {
          ...prev,
          ghosts,
          lastWpm: r.wpm,
          bestWpm: Math.max(prev.bestWpm, r.wpm),
          bestAcc: Math.max(prev.bestAcc, r.acc),
          highestCombo: Math.max(prev.highestCombo, r.maxCombo),
          totalWords: prev.totalWords + r.words,
          tracks: prev.tracks + 1,
          unlocked:
            mode === 'journey'
              ? Math.max(prev.unlocked, Math.min(WORLDS.length, world + 2))
              : prev.unlocked,
        };
        saveStats(s);
        return s;
      });
      setResult(r);
      setScreen('result');
    },
    [world, mode]
  );

  const togglePunctChar = (ch: PunctuationChar) => {
    click(3);
    const cur = playSettings.enabledPunctuation || [...PUNCTUATION_CHARS];
    const exists = cur.includes(ch);
    const next = exists ? cur.filter(c => c !== ch) : [...cur, ch];
    if (next.length === 0) {
      updateSettings({ punctuation: false, enabledPunctuation: [...PUNCTUATION_CHARS] });
    } else {
      updateSettings({ punctuation: true, enabledPunctuation: next });
    }
  };

  const handleFileImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = parseBackupData(text, defaultStats());
      if (parsed.ok) {
        update(parsed.stats);
        playChime(20);
        showNotice('ok', `Restored save data! (Level ${level(parsed.stats)} · Best ${parsed.stats.bestWpm} WPM)`);
      } else {
        showNotice('err', parsed.error);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const handlePasteRestore = () => {
    if (!pasteJson.trim()) {
      showNotice('err', 'Please paste your backup JSON first.');
      return;
    }
    const parsed = parseBackupData(pasteJson, defaultStats());
    if (parsed.ok) {
      update(parsed.stats);
      setPasteJson('');
      setShowPasteBox(false);
      playChime(20);
      showNotice('ok', `Restored save data! (Level ${level(parsed.stats)} · Best ${parsed.stats.bestWpm} WPM)`);
    } else {
      showNotice('err', parsed.error);
    }
  };

  if (screen === 'game') {
    return (
      <Game
        key={runId}
        mode={mode}
        worldIdx={world}
        stats={stats}
        onExit={onExit}
        onFinish={onFinish}
        onChangeDeviceMode={dm => updateSettings({ deviceMode: dm, deviceSelected: true })}
      />
    );
  }

  const lvl = level(stats);
  const rank = getPlayerRank(lvl, stats.bestWpm);
  const samplePreview = applyPlaySettingsToLine(
    'soft clouds drift and every word you type becomes a bridge in the sky garden',
    playSettings,
    0
  );
  const activeWorldIdx = Math.min(WORLDS.length - 1, Math.max(0, stats.unlocked - 1));
  const currentDeviceMode: DeviceMode = playSettings.deviceMode || 'desktop';

  return (
    <div className="menu-root w-full bg-gradient-to-b from-sky-300 via-indigo-200 to-pink-200 text-slate-800 flex flex-col items-center overflow-y-auto">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {Array.from({ length: 14 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-xl shadow-lg float-block text-white font-black flex items-center justify-center"
            style={{
              left: `${(i * 73) % 100}%`,
              top: `${(i * 37) % 100}%`,
              width: 44,
              height: 44,
              background: ['#5b8cff', '#ff6fa8', '#3fd67a', '#ffc53d'][i % 4],
              opacity: 0.32,
              animationDelay: `${i * 0.7}s`,
            }}
          >
            {APP_CODE_NAME[i % APP_CODE_NAME.length]}
          </div>
        ))}
      </div>

      {showDeviceModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="device-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-indigo-100">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 id="device-modal-title" className="text-2xl font-black text-indigo-700">
                  Choose Your Device & Input Style
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                  Select your device so the interface, HUD layout, and keyboard system match how you play.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close device selector"
                onClick={() => setShowDeviceModal(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 mb-5">
              {(
                [
                  [
                    'desktop',
                    '🖥️ Desktop / Physical Keyboard',
                    'Best for PC, Mac & hardware keyboards',
                    'Full widescreen 3D horizon view with clean floating HUD. Types directly from your physical keyboard with zero on-screen clutter.',
                  ],
                  [
                    'mobile-native',
                    '📱 Mobile / Native Device Keyboard',
                    'Best for iOS & Android phones',
                    'Tailored mobile HUD with a dedicated Native OS Keyboard dock. Tap once to summon your phone’s real built-in keyboard (Gboard / iOS) with smooth native uppercase & punctuation.',
                  ],
                  [
                    'touch-virtual',
                    '⌨️ Touch / Built-in Virtual Keyboard',
                    'Best for tablets, touch screens & emulators',
                    'Includes our upgraded on-screen keyboard with an always-visible (, . \' & - ? !) punctuation bar, 123 numbers, Smart Auto-Shift for A–Z uppercase, and golden next-key target highlights.',
                  ],
                ] as const
              ).map(([id, title, badge, desc]) => {
                const active = currentDeviceMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      click(5);
                      updateSettings({ deviceMode: id, deviceSelected: true });
                      setShowDeviceModal(false);
                      showNotice('ok', `Switched interface to ${title}`);
                    }}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition cursor-pointer flex flex-col gap-1 ${
                      active
                        ? 'border-indigo-600 bg-indigo-50/90 shadow-md'
                        : 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-black text-base text-slate-900">{title}</span>
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg ${
                          active ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {active ? '✓ Active Profile' : badge}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{desc}</p>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowDeviceModal(false)}
              className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow cursor-pointer"
            >
              Continue with Selected Style
            </button>
          </div>
        </div>
      )}

      <main className="relative w-full max-w-6xl">
        <header className="menu-header text-center">
          <h1 className="menu-title font-black tracking-tight text-white drop-shadow-[0_6px_0_rgba(80,90,200,0.5)] flex flex-wrap justify-center gap-x-3">
            <span className="sr-only">{APP_NAME}</span>
            <span aria-hidden="true" className="flex flex-wrap justify-center gap-x-3">
              {APP_NAME_WORDS.map((wordStr, w) => (
                <span key={w} className="inline-flex">
                  {wordStr.split('').map((c, i) => (
                    <span
                      key={i}
                      className="inline-block float-letter"
                      style={{ animationDelay: `${(w * 6 + i) * 0.12}s` }}
                    >
                      {c}
                    </span>
                  ))}
                </span>
              ))}
            </span>
          </h1>
          <p className="menu-tag mt-2 text-indigo-950/80 font-bold text-base sm:text-lg">
            {APP_TAGLINE}
          </p>
          <p className="mt-1 text-xs sm:text-sm text-indigo-950/70 font-bold tabular-nums">
            {rank.badge} {rank.title} · Level {lvl} · {stats.tracks} tracks completed · Best{' '}
            {stats.bestWpm} WPM
          </p>
        </header>

        {feedback && (
          <div
            role="status"
            className={`max-w-xl mx-auto mb-4 px-4 py-2.5 rounded-2xl text-center text-sm font-bold shadow-md ${
              feedback.type === 'ok'
                ? 'bg-emerald-600 text-white'
                : 'bg-rose-600 text-white'
            }`}
          >
            {feedback.msg}
          </div>
        )}

        {screen === 'menu' && (
          <>
            <div className="menu-nav flex flex-wrap items-center justify-center gap-2.5">
              {(['journey', 'zen', 'ghost'] as Mode[]).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    click(m === 'journey' ? 1 : m === 'zen' ? 3 : 5);
                    setMode(m);
                  }}
                  className={`px-4 sm:px-5 py-2.5 rounded-2xl font-bold capitalize transition shadow cursor-pointer whitespace-nowrap shrink-0 ${
                    mode === m
                      ? 'bg-white text-indigo-600 scale-105 shadow-md'
                      : 'bg-white/50 text-indigo-950 hover:bg-white/75'
                  }`}
                >
                  {m === 'journey' ? '🗺️ Journey' : m === 'zen' ? '🍃 Zen' : '👻 Ghost'}
                </button>
              ))}
              <button
                type="button"
                data-start="true"
                onClick={() => play(mode, activeWorldIdx)}
                className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-lg transition cursor-pointer whitespace-nowrap shrink-0"
              >
                ▶ Quick Play ({WORLDS[activeWorldIdx].name})
              </button>
            </div>

            <p className="menu-desc text-center text-sm text-indigo-950/75 font-semibold">
              {mode === 'journey'
                ? `Complete each floating world to unlock the next (${stats.unlocked}/${WORLDS.length} unlocked).`
                : mode === 'zen'
                  ? 'No timers. No numbers. Endless words across all 8 floating worlds.'
                  : 'Race a translucent ghost of your personal best on any world.'}
            </p>

            <section
              aria-label="Quick Play Settings"
              className="max-w-4xl mx-auto mb-5 bg-white/75 rounded-2xl p-3 sm:px-5 sm:py-3.5 shadow-md border border-white/60 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-indigo-900/10">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-indigo-950/70 mr-1">
                    Device & Input:
                  </span>
                  {(
                    [
                      ['desktop', '🖥️ Desktop (Physical KB)'],
                      ['mobile-native', '📱 Mobile (Device OS KB)'],
                      ['touch-virtual', '⌨️ Touch (Virtual KB)'],
                    ] as const
                  ).map(([id, label]) => {
                    const active = currentDeviceMode === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          click(5);
                          updateSettings({ deviceMode: id, deviceSelected: true });
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'bg-white text-slate-700 hover:bg-indigo-50'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    click(3);
                    setShowDeviceModal(true);
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  📱/🖥️ Device Guide
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-indigo-950/70 mr-1">
                    Play Rules:
                  </span>
                  <button
                    type="button"
                    aria-pressed={playSettings.uppercase}
                    onClick={() => {
                      click(4);
                      updateSettings({ uppercase: !playSettings.uppercase });
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                      playSettings.uppercase
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white text-slate-700 hover:bg-indigo-50'
                    }`}
                  >
                    Aa Uppercase {playSettings.uppercase ? 'On' : 'Off'}
                  </button>
                  <button
                    type="button"
                    aria-pressed={playSettings.punctuation}
                    onClick={() => {
                      click(6);
                      updateSettings({ punctuation: !playSettings.punctuation });
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                      playSettings.punctuation
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white text-slate-700 hover:bg-indigo-50'
                    }`}
                  >
                    {`Punctuation (, . ' & - ? !) ${playSettings.punctuation ? 'On' : 'Off'}`}
                  </button>
                  <button
                    type="button"
                    aria-pressed={playSettings.numbers}
                    onClick={() => {
                      click(8);
                      updateSettings({ numbers: !playSettings.numbers });
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                      playSettings.numbers
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white text-slate-700 hover:bg-indigo-50'
                    }`}
                  >
                    123 Numbers {playSettings.numbers ? 'On' : 'Off'}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const order: SoundProfile[] = ['crystalline', 'thocky', 'marimba', 'synthwave'];
                      const next = order[(order.indexOf(playSettings.soundProfile) + 1) % order.length];
                      initAudio();
                      setSoundProfile(next);
                      playKey(7, next);
                      playWordComplete(7);
                      updateSettings({ soundProfile: next });
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-indigo-700 hover:bg-indigo-50 transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    🎵 Tone: {playSettings.soundProfile}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      click(5);
                      setScreen('settings');
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-100 text-indigo-800 hover:bg-indigo-200 transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    ⚙️ Customize Rules
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-indigo-900/10 flex items-center justify-between gap-3 text-xs text-slate-600 font-mono truncate">
                <span className="truncate" data-testid="prompt-preview">
                  Preview: <strong className="text-indigo-950">{samplePreview}</strong>
                </span>
                <span className="shrink-0 font-sans text-[11px] font-bold text-indigo-900/60">
                  {playSettings.linesPerTrack} lines/track
                </span>
              </div>
            </section>

            <div className="world-grid">
              {WORLDS.map((w, i) => {
                const locked = mode === 'journey' && i >= stats.unlocked;
                const g = stats.ghosts[w.id];
                return (
                  <button
                    key={w.id}
                    type="button"
                    disabled={locked}
                    onClick={() => play(mode, i)}
                    className={`world-card group relative rounded-3xl overflow-hidden text-left shadow-xl transition cursor-pointer ${
                      locked
                        ? 'opacity-65 grayscale cursor-not-allowed'
                        : 'hover:-translate-y-1 hover:shadow-2xl'
                    }`}
                    style={{ background: `linear-gradient(135deg, ${w.sky[0]}, ${w.sky[1]})` }}
                  >
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          'linear-gradient(180deg, rgba(12,16,42,0.18) 0%, rgba(12,16,42,0.52) 100%)',
                      }}
                    />
                    <div className="world-tiles absolute flex gap-1 rotate-[-6deg] group-hover:rotate-0 transition">
                      {w.name
                        .replace(/\s+/g, '')
                        .slice(0, 4)
                        .toUpperCase()
                        .split('')
                        .map((c, k) => (
                          <div
                            key={k}
                            className="world-tile rounded-md flex items-center justify-center text-white text-xs font-black shadow-[0_3px_0_rgba(0,0,0,0.28)]"
                            style={{ background: w.block, transform: `translateY(${k * -2}px)` }}
                          >
                            {c}
                          </div>
                        ))}
                    </div>
                    <div className="relative z-10 flex flex-col h-full justify-between">
                      <div>
                        <div className="text-[11px] font-bold text-white/80 tracking-wide pr-24">
                          0{i + 1} · {w.gravity}g · {w.particles}
                        </div>
                        <div className="world-name font-black text-white drop-shadow mt-0.5">
                          {w.name}
                        </div>
                        <div className="text-xs text-white/85 font-medium line-clamp-1 mt-0.5">
                          {w.subtitle}
                        </div>
                      </div>
                      <div className="world-note text-white font-bold mt-2.5 tabular-nums">
                        {locked
                          ? `🔒 Beat ${WORLDS[i - 1]?.name || 'previous'}`
                          : g
                            ? `★ Best: ${g.wpm} WPM`
                            : 'Ready to travel →'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="menu-actions flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  click(2);
                  setScreen('closet');
                }}
                className="px-5 py-3 rounded-2xl bg-white/85 font-bold shadow hover:bg-white transition cursor-pointer whitespace-nowrap shrink-0"
              >
                👕 Closet & Character
              </button>
              <button
                type="button"
                onClick={() => {
                  click(4);
                  setScreen('settings');
                }}
                className="px-5 py-3 rounded-2xl bg-white/85 font-bold shadow hover:bg-white transition cursor-pointer whitespace-nowrap shrink-0"
              >
                ⚙️ Play & Audio Settings
              </button>
              <button
                type="button"
                onClick={() => {
                  click(6);
                  setScreen('stats');
                }}
                className="px-5 py-3 rounded-2xl bg-white/85 font-bold shadow hover:bg-white transition cursor-pointer whitespace-nowrap shrink-0"
              >
                📊 Profile, Share & Backup
              </button>
            </div>
          </>
        )}

        {screen === 'settings' && (
          <div className="max-w-2xl mx-auto bg-white/90 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-black text-indigo-700">Play & Audio Settings</h2>
                <p className="text-sm text-slate-600">
                  Customize device input style, typing challenges, and psychological reward tones.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScreen('menu')}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-sm cursor-pointer"
              >
                ← Back
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 mb-4">
              <div className="font-bold text-slate-900 mb-1">
                Device & Keyboard System
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Choose the interface and keyboard style that matches your device or emulator:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                {(
                  [
                    ['desktop', '🖥️ Physical Keyboard', 'Desktop / Laptop widescreen HUD'],
                    ['mobile-native', '📱 Native OS Keyboard', 'Uses your phone’s real iOS/Android keyboard'],
                    ['touch-virtual', '⌨️ Virtual Keyboard', 'Built-in QWERTY + Shift + (, . \' & - ? !)'],
                  ] as const
                ).map(([id, title, sub]) => {
                  const active = currentDeviceMode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        click(4);
                        updateSettings({ deviceMode: id, deviceSelected: true });
                      }}
                      className={`p-3 rounded-xl border-2 text-left transition cursor-pointer ${
                        active
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-950 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-black">{title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{sub}</div>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-200/80">
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    Smart Auto-Shift on Built-in Virtual Keyboard
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Automatically shifts virtual keycaps to Uppercase (A–Z) when the next expected letter is capitalized.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={playSettings.autoShiftVirtual !== false}
                  aria-label="Smart Auto-Shift on Virtual Keyboard"
                  onClick={() => {
                    click(3);
                    updateSettings({ autoShiftVirtual: playSettings.autoShiftVirtual === false });
                  }}
                  className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer whitespace-nowrap shrink-0 ${
                    playSettings.autoShiftVirtual !== false
                      ? 'bg-indigo-600 text-white shadow'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {playSettings.autoShiftVirtual !== false ? 'Auto-Shift On' : 'Manual Shift'}
                </button>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-bold text-slate-900">Allow Uppercase Letters (A–Z)</div>
                    <div className="text-xs text-slate-500">
                      Capitalizes sentence beginnings and poetic landmarks on both prompt and 3D blocks.
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={playSettings.uppercase}
                    aria-label="Allow Uppercase Letters"
                    onClick={() => {
                      click(3);
                      updateSettings({ uppercase: !playSettings.uppercase });
                    }}
                    className={`px-4 py-2 rounded-xl font-bold text-sm transition cursor-pointer whitespace-nowrap shrink-0 ${
                      playSettings.uppercase
                        ? 'bg-indigo-600 text-white shadow'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {playSettings.uppercase ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div>
                    <div className="font-bold text-slate-900">
                      {`Allow Punctuation Marks (, . ' & - ? !)`}
                    </div>
                    <div className="text-xs text-slate-500">
                      Weaves natural punctuation into sentences. Toggle individual symbols below:
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={playSettings.punctuation}
                    aria-label="Allow Punctuation Marks"
                    onClick={() => {
                      click(5);
                      updateSettings({
                        punctuation: !playSettings.punctuation,
                        enabledPunctuation:
                          playSettings.enabledPunctuation?.length > 0
                            ? playSettings.enabledPunctuation
                            : [...PUNCTUATION_CHARS],
                      });
                    }}
                    className={`px-4 py-2 rounded-xl font-bold text-sm transition cursor-pointer whitespace-nowrap shrink-0 ${
                      playSettings.punctuation
                        ? 'bg-indigo-600 text-white shadow'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {playSettings.punctuation ? 'Enabled' : 'Disabled'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {PUNCTUATION_CHARS.map(ch => {
                    const active =
                      playSettings.punctuation && playSettings.enabledPunctuation.includes(ch);
                    return (
                      <button
                        key={ch}
                        type="button"
                        aria-label={`Symbol ${ch}`}
                        aria-pressed={active}
                        onClick={() => togglePunctChar(ch)}
                        className={`w-11 h-11 rounded-xl font-mono text-lg font-black border-2 transition cursor-pointer flex items-center justify-center ${
                          active
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                        }`}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-bold text-slate-900">Allow Numbers (0–9)</div>
                    <div className="text-xs text-slate-500">
                      Includes numeric milestones and counts inside track phrases.
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={playSettings.numbers}
                    aria-label="Allow Numbers"
                    onClick={() => {
                      click(7);
                      updateSettings({ numbers: !playSettings.numbers });
                    }}
                    className={`px-4 py-2 rounded-xl font-bold text-sm transition cursor-pointer whitespace-nowrap shrink-0 ${
                      playSettings.numbers
                        ? 'bg-indigo-600 text-white shadow'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {playSettings.numbers ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
                <div className="font-bold text-slate-900 mb-2">Track Length (Journey & Ghost)</div>
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      [2, 'Sprint (2)'],
                      [3, 'Standard (3)'],
                      [5, 'Extended (5)'],
                      [8, 'Marathon (8)'],
                    ] as const
                  ).map(([cnt, label]) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => {
                        click(cnt);
                        updateSettings({ linesPerTrack: cnt });
                      }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border-2 transition cursor-pointer whitespace-nowrap ${
                        playSettings.linesPerTrack === cnt
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-transparent bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-indigo-950 text-white rounded-2xl p-4 font-mono text-sm shadow-inner">
                <div className="text-[11px] font-sans uppercase tracking-wider text-indigo-300 font-bold mb-1">
                  Live Track Text Preview
                </div>
                <div className="text-base leading-relaxed break-words">{samplePreview}</div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-bold text-slate-900">Reward Tone Synthesizer</h3>
                  <p className="text-xs text-slate-500">
                    Each keystroke climbs a harmonic scale; completing words blooms a triad chord.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    initAudio();
                    playChime(30);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow cursor-pointer whitespace-nowrap shrink-0"
                >
                  ✨ Test Reward Fanfare
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {(
                  [
                    ['crystalline', '💎 Crystalline'],
                    ['thocky', '⌨️ Thocky PBT'],
                    ['marimba', '🪵 Marimba'],
                    ['synthwave', '🌆 Synthwave'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      initAudio();
                      setSoundProfile(id);
                      playKey(8, id);
                      playWordComplete(8);
                      updateSettings({ soundProfile: id });
                    }}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border-2 transition cursor-pointer whitespace-nowrap ${
                      playSettings.soundProfile === id
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm'
                        : 'border-transparent bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-xs font-bold text-slate-700">
                  Keystroke & Reward Volume: {Math.round(playSettings.sfxVolume * 100)}%
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(playSettings.sfxVolume * 100)}
                    onChange={e => updateSettings({ sfxVolume: Number(e.target.value) / 100 })}
                    className="w-full mt-1 accent-indigo-600"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-700">
                  Ambient Flow Music Volume: {Math.round(playSettings.musicVolume * 100)}%
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(playSettings.musicVolume * 100)}
                    onChange={e => updateSettings({ musicVolume: Number(e.target.value) / 100 })}
                    className="w-full mt-1 accent-indigo-600"
                  />
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setScreen('menu')}
              className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow cursor-pointer"
            >
              Save & Return to Menu
            </button>
          </div>
        )}

        {screen === 'result' && result && (
          <div className="max-w-xl mx-auto bg-white/90 rounded-3xl p-6 sm:p-8 shadow-2xl text-center">
            <div className="text-4xl mb-1">🏁</div>
            <h2 className="text-3xl font-black text-indigo-600">
              {WORLDS[world].name} Complete!
            </h2>
            {result.newBest && (
              <p className="mt-1 font-bold text-pink-600">
                ✨ New personal best — saved as your Ghost!
              </p>
            )}
            <div className="grid grid-cols-3 gap-3 my-5">
              <Big label="WPM" v={result.wpm} />
              <Big label="Accuracy" v={result.acc + '%'} />
              <Big label="Top Combo" v={'×' + result.maxCombo} />
            </div>

            <div className="mb-5 bg-slate-900/5 rounded-2xl p-3 border border-slate-200">
              <canvas
                ref={resultCanvasRef}
                className="w-full h-auto rounded-xl shadow-md block"
              />
              <div className="flex flex-wrap justify-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    downloadMetadataImage({ stats, worldIdx: world, mode, result }, 'png');
                    showNotice('ok', 'Downloaded Run Metadata PNG!');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold cursor-pointer"
                >
                  ⬇ Download PNG
                </button>
                <button
                  type="button"
                  onClick={() => {
                    downloadMetadataImage({ stats, worldIdx: world, mode, result }, 'jpg');
                    showNotice('ok', 'Downloaded Run Metadata JPG!');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                >
                  ⬇ Download JPG
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const msg = await shareMetadataImage({
                      stats,
                      worldIdx: world,
                      mode,
                      result,
                    });
                    showNotice('ok', msg);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-indigo-100 hover:bg-indigo-200 text-indigo-800 text-xs font-bold cursor-pointer"
                >
                  📤 Share Card
                </button>
              </div>
            </div>

            <div className="flex gap-2.5 justify-center flex-wrap">
              <button
                type="button"
                data-start="true"
                onClick={() => play(mode, world)}
                className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow cursor-pointer"
              >
                Play Again
              </button>
              {mode === 'journey' && world + 1 < WORLDS.length && (
                <button
                  type="button"
                  onClick={() => play('journey', world + 1)}
                  className="px-5 py-3 rounded-2xl bg-pink-500 hover:bg-pink-600 text-white font-bold shadow cursor-pointer"
                >
                  Next World: {WORLDS[world + 1].name} →
                </button>
              )}
              <button
                type="button"
                onClick={() => setScreen('menu')}
                className="px-5 py-3 rounded-2xl bg-slate-200 hover:bg-slate-300 font-bold cursor-pointer"
              >
                Menu
              </button>
            </div>
          </div>
        )}

        {screen === 'stats' && (
          <div className="max-w-3xl mx-auto bg-white/90 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-2xl font-black text-indigo-700">
                  Profile, Share Card & Data Backup
                </h2>
                <p className="text-sm text-slate-600">
                  {rank.badge} {rank.title} · Level {lvl}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScreen('menu')}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-sm cursor-pointer"
              >
                ← Back
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <Big label="Best WPM" v={stats.bestWpm} />
              <Big label="Best Accuracy" v={stats.bestAcc + '%'} />
              <Big label="Highest Combo" v={'×' + stats.highestCombo} />
              <Big label="Words Typed" v={stats.totalWords} />
              <Big label="Tracks Done" v={stats.tracks} />
              <Big label="Worlds Unlocked" v={`${stats.unlocked}/${WORLDS.length}`} />
            </div>

            <section className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="font-bold text-slate-900">
                    Shareable Player Metadata Card (PNG / JPG)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Download or share a high-resolution snapshot of your stats, rank, and active rules.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      downloadMetadataImage({ stats, worldIdx: world, mode }, 'png');
                      showNotice('ok', 'Downloaded Metadata Card as PNG!');
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow cursor-pointer whitespace-nowrap"
                  >
                    ⬇ Export PNG
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      downloadMetadataImage({ stats, worldIdx: world, mode }, 'jpg');
                      showNotice('ok', 'Downloaded Metadata Card as JPG!');
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold shadow cursor-pointer whitespace-nowrap"
                  >
                    ⬇ Export JPG
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const msg = await shareMetadataImage({ stats, worldIdx: world, mode });
                      showNotice('ok', msg);
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-100 hover:bg-indigo-200 text-indigo-800 text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    📤 Share
                  </button>
                </div>
              </div>

              <canvas
                ref={cardCanvasRef}
                data-testid="metadata-card-canvas"
                className="w-full h-auto rounded-xl shadow-md border border-slate-300 block"
              />
            </section>

            <section className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200 mb-6">
              <h3 className="font-bold text-slate-900 mb-1">
                Save Data Backup (Export / Import JSON)
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Export your progress, unlocked worlds, personal best ghosts, closet outfits, and settings as JSON, or import an existing backup file.
              </p>

              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    downloadBackupJson(stats);
                    showNotice('ok', 'Exported save data JSON file!');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow cursor-pointer whitespace-nowrap"
                >
                  💾 Export Data (JSON)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const json = serializeBackupData(stats);
                    try {
                      await navigator.clipboard.writeText(json);
                      showNotice('ok', 'Copied save data JSON to clipboard!');
                    } catch {
                      setPasteJson(json);
                      setShowPasteBox(true);
                      showNotice('ok', 'Generated backup JSON in the text box below.');
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  📋 Copy JSON
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow cursor-pointer whitespace-nowrap"
                >
                  📂 Import JSON File
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileImport}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowPasteBox(v => !v)}
                  className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  {showPasteBox ? 'Hide JSON Editor' : '📝 Paste / Inspect JSON'}
                </button>
              </div>

              {showPasteBox && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Backup JSON Payload
                  </label>
                  <textarea
                    rows={5}
                    value={pasteJson}
                    onChange={e => setPasteJson(e.target.value)}
                    placeholder="Paste your exported Skyward Stroke JSON backup here..."
                    className="w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs text-slate-800"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={handlePasteRestore}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                    >
                      Restore from Pasted JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => setPasteJson(serializeBackupData(stats))}
                      className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold cursor-pointer"
                    >
                      Load Current Data into Box
                    </button>
                  </div>
                </div>
              )}
            </section>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setScreen('menu')}
                className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow cursor-pointer"
              >
                Done
              </button>
              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="px-4 py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold cursor-pointer"
                >
                  Reset Progress
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      update(defaultStats());
                      setConfirmReset(false);
                      showNotice('ok', 'Progress reset to fresh start.');
                    }}
                    className="px-4 py-3 rounded-2xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
                  >
                    Confirm Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="px-3 py-3 rounded-2xl bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {screen === 'closet' && (
          <div className="max-w-2xl mx-auto bg-white/90 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-black text-indigo-700">Runner Closet</h2>
                <p className="text-sm text-slate-600">
                  Complete tracks to level up and unlock new gear. You are{' '}
                  <strong className="text-indigo-700">Level {lvl}</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScreen('menu')}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-sm cursor-pointer"
              >
                ← Back
              </button>
            </div>

            <RunnerLoadoutPreview
              stats={stats}
              onUnlockAll={() => {
                click(10);
                update({
                  ...stats,
                  tracks: Math.max(stats.tracks, 10),
                  unlocked: WORLDS.length,
                });
                showNotice('ok', 'Unlocked all worlds & cosmetics!');
              }}
            />

            {(
              [
                ['Outfit & Scarf Trim', 'outfit', OUTFITS],
                ['Headgear', 'hat', HATS],
                ['Flow Particle Trail', 'trail', TRAILS],
              ] as const
            ).map(([title, key, items]) => (
              <div key={key} className="mb-5">
                <h3 className="font-bold text-slate-800 mb-2">{title}</h3>
                <div className="flex flex-wrap gap-2">
                  {items.map(it => {
                    const locked = lvl < it.lvl;
                    const sel = stats.look[key] === it.id;
                    return (
                      <button
                        key={it.id}
                        type="button"
                        disabled={locked}
                        onClick={() => {
                          click(it.lvl + 2);
                          update({ ...stats, look: { ...stats.look, [key]: it.id } });
                        }}
                        className={`px-4 py-2.5 rounded-xl font-bold text-sm border-2 transition flex items-center gap-2 cursor-pointer ${
                          sel
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-900 shadow-sm'
                            : 'border-transparent bg-slate-100 text-slate-700'
                        } ${locked ? 'opacity-45 cursor-not-allowed' : 'hover:border-indigo-300'}`}
                      >
                        {'color' in it && (
                          <span
                            className="w-4 h-4 rounded-full border border-black/15"
                            style={{ background: (it as { color: string }).color }}
                          />
                        )}
                        {it.name}
                        {locked && ` 🔒 Lv${it.lvl}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setScreen('menu')}
              className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow cursor-pointer"
            >
              Done
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function RunnerLoadoutPreview({
  stats,
  onUnlockAll,
}: {
  stats: Stats;
  onUnlockAll: () => void;
}) {
  const outfit = OUTFITS.find(o => o.id === stats.look.outfit) || OUTFITS[0];
  const hat = HATS.find(h => h.id === stats.look.hat) || HATS[0];
  const trail = TRAILS.find(t => t.id === stats.look.trail) || TRAILS[0];
  const lvl = level(stats);

  return (
    <div className="mb-6 rounded-2xl bg-gradient-to-r from-indigo-950 via-indigo-900 to-slate-900 text-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-lg">
      <div className="flex items-center gap-4">
        <svg
          viewBox="0 0 96 96"
          className="w-20 h-20 rounded-2xl bg-white/10 p-2 shrink-0 border border-white/15"
          aria-label="Equipped Runner Preview"
        >
          <circle cx="18" cy="58" r="4" fill="#fde047" opacity="0.85" />
          <circle cx="11" cy="46" r="3" fill="#38bdf8" opacity="0.75" />
          <circle cx="22" cy="70" r="2.5" fill="#f472b6" opacity="0.75" />
          <rect x="28" y="46" width="10" height="20" rx="3" fill="#334155" />
          <circle cx="31" cy="56" r="3.5" fill="#38bdf8" />
          <path
            d="M36 46 Q20 42 14 49 Q24 54 38 50 Z"
            fill={outfit.accent || '#ffffff'}
          />
          <rect x="36" y="44" width="26" height="28" rx="12" fill={outfit.color} />
          <rect x="38" y="43" width="22" height="5" rx="2.5" fill={outfit.accent || '#ffffff'} />
          <circle cx="49" cy="30" r="14" fill="#fff3eb" />
          <circle cx="54" cy="29" r="2" fill="#181c30" />
          <circle cx="60" cy="29" r="2" fill="#181c30" />
          <circle cx="52" cy="33" r="2.2" fill="#ff8da1" opacity="0.55" />
          {hat.id === 'hair' && (
            <path d="M35 26 Q48 10 62 24 Q55 18 45 20 Z" fill="#ff6a2b" />
          )}
          {hat.id === 'cap' && (
            <>
              <path d="M35 26 Q49 12 63 26 Z" fill="#ff3b5c" />
              <rect x="52" y="23" width="16" height="4" rx="2" fill="#ff3b5c" />
            </>
          )}
          {hat.id === 'visor' && (
            <rect x="37" y="24" width="27" height="6" rx="3" fill="#00f0ff" />
          )}
          {hat.id === 'beanie' && (
            <>
              <path d="M35 27 Q49 11 63 27 Z" fill="#ffd23d" />
              <circle cx="49" cy="14" r="4" fill="#ffffff" />
            </>
          )}
          {hat.id === 'crown' && (
            <polygon points="38,20 42,10 49,17 56,10 60,20" fill="#ffcc33" />
          )}
          {hat.id === 'halo' && (
            <ellipse
              cx="49"
              cy="12"
              rx="12"
              ry="3.5"
              fill="none"
              stroke="#fef08a"
              strokeWidth="3"
            />
          )}
        </svg>

        <div>
          <div className="text-xs uppercase tracking-wider text-indigo-300 font-bold">
            Active Runner Loadout
          </div>
          <div className="text-lg font-black">{outfit.name}</div>
          <div className="text-xs text-indigo-200 font-semibold mt-0.5">
            {hat.name} · {trail.name} Trail · Flow Jetpack Equipped
          </div>
        </div>
      </div>

      {(lvl < 8 || stats.unlocked < WORLDS.length) && (
        <button
          type="button"
          onClick={onUnlockAll}
          className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold text-white transition cursor-pointer whitespace-nowrap"
        >
          🔓 Unlock All Worlds & Gear
        </button>
      )}
    </div>
  );
}

function Big({ label, v }: { label: string; v: string | number }) {
  return (
    <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 text-center tabular-nums">
      <div className="text-2xl font-black text-indigo-600">{v}</div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mt-0.5">
        {label}
      </div>
    </div>
  );
}
