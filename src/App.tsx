import { useState, useCallback } from 'react';
import Game, { type Mode, type Result } from './Game';
import { WORLDS, OUTFITS, HATS, TRAILS, loadStats, saveStats, level, type Stats } from './data';
import { initAudio, playKey } from './audio';
import { APP_NAME_WORDS, APP_CODE_NAME, APP_TAGLINE } from './config';

type Screen = 'menu' | 'game' | 'result' | 'closet' | 'stats';

export default function App() {
  const [stats, setStats] = useState<Stats>(loadStats);
  const [screen, setScreen] = useState<Screen>('menu');
  const [mode, setMode] = useState<Mode>('journey');
  const [world, setWorld] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [runId, setRunId] = useState(0);

  const update = (s: Stats) => { setStats(s); saveStats(s); };
  const click = () => { initAudio(); playKey(0); };

  const play = (m: Mode, w: number) => { click(); setMode(m); setWorld(w); setRunId(r => r + 1); setScreen('game'); };

  const onExit = useCallback((words: number, maxCombo: number) => {
    setStats(prev => { const s = { ...prev, totalWords: prev.totalWords + words, highestCombo: Math.max(prev.highestCombo, maxCombo) }; saveStats(s); return s; });
    setScreen('menu');
  }, []);

  const onFinish = useCallback((r: Result) => {
    setStats(prev => {
      const wid = WORLDS[world].id;
      const ghosts = { ...prev.ghosts };
      if (r.newBest) ghosts[wid] = { times: r.times, wpm: r.wpm, text: r.text };
      const s: Stats = {
        ...prev, ghosts, lastWpm: r.wpm, bestWpm: Math.max(prev.bestWpm, r.wpm), bestAcc: Math.max(prev.bestAcc, r.acc),
        highestCombo: Math.max(prev.highestCombo, r.maxCombo), totalWords: prev.totalWords + r.words, tracks: prev.tracks + 1,
        unlocked: mode === 'journey' ? Math.max(prev.unlocked, Math.min(WORLDS.length, world + 2)) : prev.unlocked,
      };
      saveStats(s); return s;
    });
    setResult(r); setScreen('result');
  }, [world, mode]);

  if (screen === 'game') return <Game key={runId} mode={mode} worldIdx={world} stats={stats} onExit={onExit} onFinish={onFinish} />;

  const lvl = level(stats);
  return (
    <div className="menu-root w-full bg-gradient-to-b from-sky-300 via-indigo-200 to-pink-200 text-slate-800 flex flex-col items-center overflow-y-auto">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="absolute rounded-xl shadow-lg float-block text-white font-black flex items-center justify-center"
            style={{ left: `${(i * 73) % 100}%`, top: `${(i * 37) % 100}%`, width: 44, height: 44, background: ['#5b8cff', '#ff6fa8', '#3fd67a', '#ffc53d'][i % 4], opacity: 0.35, animationDelay: `${i * 0.7}s` }}>
            {APP_CODE_NAME[i % APP_CODE_NAME.length]}
          </div>
        ))}
      </div>

      <div className="relative w-full max-w-4xl">
        <header className="menu-header text-center">
          <h1 className="menu-title font-black tracking-tight text-white drop-shadow-[0_6px_0_rgba(80,90,200,0.5)] flex flex-wrap justify-center gap-x-3">
            {APP_NAME_WORDS.map((word, w) => (
              <span key={w} className="inline-flex">
                {word.split('').map((c, i) => (
                  <span key={i} className="inline-block float-letter" style={{ animationDelay: `${(w * 6 + i) * 0.12}s` }}>{c}</span>
                ))}
              </span>
            ))}
          </h1>
          <p className="menu-tag mt-3 text-indigo-900/70 font-semibold">{APP_TAGLINE}</p>
          <p className="mt-1 text-xs text-indigo-900/60 font-bold">Level {lvl} · {stats.tracks} tracks completed</p>
        </header>

        {screen === 'menu' && (
          <>
            <nav className="menu-nav flex flex-wrap justify-center gap-2">
              {(['journey', 'zen', 'ghost'] as Mode[]).map(m => (
                <button key={m} onClick={() => { click(); setMode(m); }}
                  className={`px-4 sm:px-5 py-2.5 rounded-2xl font-bold capitalize transition shadow ${mode === m ? 'bg-white text-indigo-600 scale-105' : 'bg-white/40 text-white hover:bg-white/60'}`}>
                  {m === 'journey' ? '🗺️ Journey' : m === 'zen' ? '🍃 Zen' : '👻 Ghost'}
                </button>
              ))}
            </nav>
            <p className="menu-desc text-center text-sm text-indigo-900/70 font-medium">
              {mode === 'journey' ? 'Complete each floating world to unlock the next.' : mode === 'zen' ? 'No timers. No numbers. Endless words, endless sky.' : 'Race a translucent ghost of your personal best.'}
            </p>
            <div className="world-grid">
              {WORLDS.map((w, i) => {
                const locked = mode === 'journey' && i >= stats.unlocked;
                const g = stats.ghosts[w.id];
                return (
                  <button key={w.id} disabled={locked} onClick={() => play(mode, i)}
                    className={`world-card group relative rounded-3xl overflow-hidden text-left shadow-xl transition ${locked ? 'opacity-60 grayscale cursor-not-allowed' : 'hover:-translate-y-1 hover:shadow-2xl'}`}
                    style={{ background: `linear-gradient(135deg, ${w.sky[0]}, ${w.sky[1]})` }}>
                    <div className="world-tiles absolute flex gap-1 rotate-[-8deg] group-hover:rotate-0 transition">
                      {w.name.slice(0, 4).toUpperCase().split('').map((c, k) => (
                        <div key={k} className="world-tile rounded-lg flex items-center justify-center text-white font-black shadow-[0_4px_0_rgba(0,0,0,0.25)]" style={{ background: w.block, transform: `translateY(${k * -4}px)` }}>{c}</div>
                      ))}
                    </div>
                    <div className="world-name relative font-black text-white drop-shadow">{w.name}</div>
                    <div className="world-note relative text-white/80 font-semibold mt-1">{locked ? '🔒 Complete the previous world' : g ? `Best: ${g.wpm} WPM` : 'Not yet traveled'}</div>
                  </button>
                );
              })}
            </div>
            <div className="menu-actions flex justify-center gap-3">
              <button onClick={() => { click(); setScreen('closet'); }} className="px-5 py-3 rounded-2xl bg-white/70 font-bold shadow hover:bg-white">👕 Closet</button>
              <button onClick={() => { click(); setScreen('stats'); }} className="px-5 py-3 rounded-2xl bg-white/70 font-bold shadow hover:bg-white">📊 Profile</button>
            </div>
          </>
        )}

        {screen === 'result' && result && (
          <div className="max-w-md mx-auto bg-white/80 backdrop-blur rounded-3xl p-6 sm:p-8 shadow-2xl text-center">
            <div className="text-5xl mb-2">🏁</div>
            <h2 className="text-3xl font-black text-indigo-600">Track Complete!</h2>
            {result.newBest && <p className="mt-1 font-bold text-pink-500">✨ New personal best — saved as your ghost</p>}
            <div className="grid grid-cols-3 gap-3 my-6">
              <Big label="WPM" v={result.wpm} /><Big label="Accuracy" v={result.acc + '%'} /><Big label="Top Combo" v={result.maxCombo} />
            </div>
            <div className="flex gap-2 justify-center flex-wrap">
              <button onClick={() => play(mode, world)} className="px-5 py-3 rounded-2xl bg-indigo-500 text-white font-bold shadow">Again</button>
              {mode === 'journey' && world + 1 < WORLDS.length && <button onClick={() => play('journey', world + 1)} className="px-5 py-3 rounded-2xl bg-pink-500 text-white font-bold shadow">Next World →</button>}
              <button onClick={() => setScreen('menu')} className="px-5 py-3 rounded-2xl bg-slate-200 font-bold">Menu</button>
            </div>
          </div>
        )}

        {screen === 'stats' && (
          <div className="max-w-lg mx-auto bg-white/80 backdrop-blur rounded-3xl p-6 sm:p-8 shadow-2xl">
            <h2 className="text-2xl font-black text-indigo-600 mb-5 text-center">Your Profile</h2>
            <div className="grid grid-cols-2 gap-3">
              <Big label="Best WPM" v={stats.bestWpm} /><Big label="Best Accuracy" v={stats.bestAcc + '%'} />
              <Big label="Highest Combo" v={stats.highestCombo} /><Big label="Words Typed" v={stats.totalWords} />
              <Big label="Tracks Done" v={stats.tracks} /><Big label="Worlds Unlocked" v={`${stats.unlocked}/${WORLDS.length}`} />
            </div>
            <button onClick={() => setScreen('menu')} className="mt-6 w-full py-3 rounded-2xl bg-indigo-500 text-white font-bold">Back</button>
          </div>
        )}

        {screen === 'closet' && (
          <div className="max-w-2xl mx-auto bg-white/80 backdrop-blur rounded-3xl p-6 sm:p-8 shadow-2xl">
            <h2 className="text-2xl font-black text-indigo-600 mb-1 text-center">Closet</h2>
            <p className="text-center text-sm text-slate-500 mb-5">Complete tracks to level up and unlock more. You are level {lvl}.</p>
            {([['Outfit', 'outfit', OUTFITS], ['Head', 'hat', HATS], ['Trail', 'trail', TRAILS]] as const).map(([title, key, items]) => (
              <div key={key} className="mb-5">
                <h3 className="font-bold mb-2">{title}</h3>
                <div className="flex flex-wrap gap-2">
                  {items.map(it => {
                    const locked = lvl < it.lvl; const sel = stats.look[key] === it.id;
                    return (
                      <button key={it.id} disabled={locked} onClick={() => { click(); update({ ...stats, look: { ...stats.look, [key]: it.id } }); }}
                        className={`px-4 py-2 rounded-xl font-semibold text-sm border-2 transition flex items-center gap-2 ${sel ? 'border-indigo-500 bg-indigo-50' : 'border-transparent bg-white'} ${locked ? 'opacity-40' : 'hover:border-indigo-300'}`}>
                        {'color' in it && <span className="w-4 h-4 rounded-full" style={{ background: (it as { color: string }).color }} />}
                        {it.name}{locked && ` 🔒 Lv${it.lvl}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button onClick={() => setScreen('menu')} className="w-full py-3 rounded-2xl bg-indigo-500 text-white font-bold">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Big({ label, v }: { label: string; v: string | number }) {
  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm">
      <div className="text-2xl font-black text-indigo-600">{v}</div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
    </div>
  );
}
