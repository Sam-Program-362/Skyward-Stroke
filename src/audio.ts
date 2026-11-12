let ctx: AudioContext | null = null;
let master: GainNode;
let musicGain: GainNode;
let noiseBuf: AudioBuffer;
let musicTimer: number | null = null;

function wake() { if (ctx && ctx.state !== 'running' && !document.hidden) ctx.resume().catch(() => {}); }

export function initAudio() {
  if (ctx) { wake(); return; }
  ctx = new AudioContext();
  // Go quiet while the page is in the background. Phones and tablets may then only let sound
  // start again from a tap or a key press, so those wake it too.
  document.addEventListener('visibilitychange', () => { if (document.hidden) ctx?.suspend().catch(() => {}); else wake(); });
  for (const ev of ['pointerup', 'touchend', 'keydown']) window.addEventListener(ev, wake, { passive: true });
  master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.18; musicGain.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function noise(t: number, dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = 'bandpass') {
  if (!ctx) return;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
}
function tone(t: number, freq: number, dur: number, vol: number, type: OscillatorType = 'sine', dest?: AudioNode, endFreq?: number) {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + dur + 0.02);
}

const PENTA = [0, 2, 4, 7, 9];
export function playKey(combo: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const p = 1 + Math.min(combo, 60) * 0.006 + (Math.random() - 0.5) * 0.04;
  // thocky body
  tone(t, 150 * p, 0.07, 0.45, 'sine', undefined, 70 * p);
  noise(t, 0.035, 1800 * p, 1.2, 0.5);
  noise(t + 0.002, 0.06, 400 * p, 2, 0.4, 'lowpass');
  // musical chime that climbs with combo
  if (combo > 0) {
    const step = combo % 10;
    const oct = Math.min(Math.floor(combo / 10), 3);
    const semi = PENTA[step % 5] + 12 * Math.floor(step / 5) + oct * 2;
    tone(t, 523.25 * Math.pow(2, semi / 12), 0.35, 0.05, 'triangle');
  }
}
export function playMiss() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, 110, 0.18, 0.4, 'sine', undefined, 60);
  noise(t, 0.1, 200, 1, 0.3, 'lowpass');
}
export function playStep() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, 0.05, 700 + Math.random() * 200, 3, 0.12);
  tone(t, 240, 0.05, 0.05, 'sine', undefined, 160);
}
export function playChime() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.09, f, 0.6, 0.08, 'triangle'));
}

const CHORDS = [[174.6, 220, 261.6, 329.6], [164.8, 196, 246.9, 293.7], [146.8, 174.6, 220, 261.6], [130.8, 164.8, 196, 246.9]];
export function startMusic() {
  if (!ctx || musicTimer !== null) return;
  const beat = 60 / 78;
  let next = ctx.currentTime + 0.1; let n = 0;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(musicGain);
  const tick = () => {
    if (!ctx) return;
    // if the timer was held back (tab in the background), skip ahead rather than play every missed beat at once
    if (next < ctx.currentTime) next = ctx.currentTime + 0.05;
    while (next < ctx.currentTime + 0.3) {
      const bar = Math.floor(n / 4) % 4; const b = n % 4;
      if (b === 0) CHORDS[bar].forEach(f => tone(next, f, beat * 4, 0.12, 'triangle', lp));
      if (b === 0 || b === 2.5) tone(next, 60, 0.3, 0.7, 'sine', musicGain, 40);
      if (b === 2) noise(next, 0.15, 1500, 0.8, 0.25);
      noise(next + beat / 2, 0.04, 8000, 1, 0.15, 'highpass');
      noise(next, 0.03, 8000, 1, 0.1, 'highpass');
      if (Math.random() < 0.35) tone(next + beat / 2, CHORDS[bar][Math.floor(Math.random() * 4)] * 2, beat, 0.05, 'sine', lp);
      next += beat; n++;
    }
  };
  musicTimer = window.setInterval(tick, 100);
}
export function stopMusic() { if (musicTimer !== null) clearInterval(musicTimer); musicTimer = null; }
export function setMusicVolume(v: number) { if (musicGain) musicGain.gain.value = v; }
