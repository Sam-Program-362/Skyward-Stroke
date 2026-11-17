import type { SoundProfile } from './utils/gameLogic';

let ctx: AudioContext | null = null;
let sfxGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let musicTimer: number | null = null;
let currentProfile: SoundProfile = 'crystalline';
let currentSfxVol = 0.85;
let currentMusicVol = 0.22;

const SCALE = [
  261.63, 293.66, 329.63, 392.0, 440.0,
  523.25, 587.33, 659.25, 783.99, 880.0,
  1046.5, 1174.66, 1318.51,
];

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 18;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  comp.connect(ctx.destination);

  sfxGain = ctx.createGain();
  sfxGain.gain.value = currentSfxVol;
  sfxGain.connect(comp);

  // Shimmer delay network for psychological reward bloom
  const delay = ctx.createDelay(0.5);
  delay.delayTime.value = 0.14;
  const fb = ctx.createGain();
  fb.gain.value = 0.22;
  const wet = ctx.createGain();
  wet.gain.value = 0.18;
  sfxGain.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(comp);

  musicGain = ctx.createGain();
  musicGain.gain.value = currentMusicVol;
  musicGain.connect(comp);
}

export function setSoundProfile(p: SoundProfile) {
  currentProfile = p;
}

export function setSfxVolume(v: number) {
  currentSfxVol = Math.max(0, Math.min(1, v));
  if (sfxGain && ctx) {
    sfxGain.gain.setTargetAtTime(currentSfxVol, ctx.currentTime, 0.02);
  }
}

export function setMusicVolume(v: number) {
  currentMusicVol = Math.max(0, Math.min(1, v));
  if (musicGain && ctx) {
    musicGain.gain.setTargetAtTime(currentMusicVol, ctx.currentTime, 0.05);
  }
}

export function playKey(combo = 0, profile: SoundProfile = currentProfile) {
  if (!ctx || !sfxGain || currentSfxVol <= 0.001) return;
  const t = ctx.currentTime;
  const note = SCALE[combo % SCALE.length];

  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const g = ctx.createGain();

  if (profile === 'thocky') {
    o1.type = 'triangle';
    o1.frequency.setValueAtTime(160 + (combo % 8) * 12, t);
    o1.frequency.exponentialRampToValueAtTime(68, t + 0.055);
    o2.type = 'sine';
    o2.frequency.setValueAtTime(note * 0.5, t);
    g.gain.setValueAtTime(0.24, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
  } else if (profile === 'marimba') {
    o1.type = 'sine';
    o1.frequency.setValueAtTime(note, t);
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(note * 2, t);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  } else if (profile === 'synthwave') {
    o1.type = 'sawtooth';
    o1.frequency.setValueAtTime(note * 0.5, t);
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(note, t);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  } else {
    // crystalline
    o1.type = 'sine';
    o1.frequency.setValueAtTime(note, t);
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(note * 1.5, t);
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
  }

  o1.connect(g);
  o2.connect(g);
  g.connect(sfxGain);
  o1.start(t);
  o2.start(t);
  o1.stop(t + 0.15);
  o2.stop(t + 0.15);
}

export function playWordComplete(combo = 1) {
  if (!ctx || !sfxGain || currentSfxVol <= 0.001) return;
  const t = ctx.currentTime;
  const baseIdx = Math.min(SCALE.length - 3, Math.floor(combo / 3) % (SCALE.length - 3));
  const triad = [SCALE[baseIdx], SCALE[baseIdx + 1], SCALE[baseIdx + 2]];

  triad.forEach((freq, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t + i * 0.025);
    g.gain.setValueAtTime(0.09, t + i * 0.025);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.025 + 0.22);
    o.connect(g);
    g.connect(sfxGain!);
    o.start(t + i * 0.025);
    o.stop(t + i * 0.025 + 0.24);
  });
}

export function playMiss() {
  if (!ctx || !sfxGain || currentSfxVol <= 0.001) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(145, t);
  o.frequency.linearRampToValueAtTime(92, t + 0.14);
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  o.connect(g);
  g.connect(sfxGain);
  o.start(t);
  o.stop(t + 0.17);
}

export function playStep() {
  if (!ctx || !sfxGain || currentSfxVol <= 0.001) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(190, t);
  o.frequency.exponentialRampToValueAtTime(85, t + 0.045);
  g.gain.setValueAtTime(0.09, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  o.connect(g);
  g.connect(sfxGain);
  o.start(t);
  o.stop(t + 0.055);
}

export function playChime(combo = 10) {
  if (!ctx || !sfxGain || currentSfxVol <= 0.001) return;
  const t = ctx.currentTime;
  const tier = Math.min(3, Math.floor(combo / 10));
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51].slice(0, 3 + tier);
  notes.forEach((f, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t + i * 0.055);
    g.gain.setValueAtTime(0.14, t + i * 0.055);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.055 + 0.36);
    o.connect(g);
    g.connect(sfxGain!);
    o.start(t + i * 0.055);
    o.stop(t + i * 0.055 + 0.38);
  });
}

export function playVictory(newBest = false) {
  if (!ctx || !sfxGain || currentSfxVol <= 0.001) return;
  const t = ctx.currentTime;
  const arp = newBest
    ? [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98]
    : [440.0, 554.37, 659.25, 880.0];
  arp.forEach((f, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t + i * 0.08);
    g.gain.setValueAtTime(0.16, t + i * 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.48);
    o.connect(g);
    g.connect(sfxGain!);
    o.start(t + i * 0.08);
    o.stop(t + i * 0.08 + 0.5);
  });
}

export function startMusic() {
  if (!ctx || !musicGain || musicTimer !== null) return;
  const chords = [
    [261.63, 329.63, 392.0],
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
    [196.0, 246.94, 293.66],
  ];
  let step = 0;
  const tick = () => {
    if (!ctx || !musicGain || currentMusicVol <= 0.001) return;
    const t = ctx.currentTime;
    const chord = chords[step % chords.length];
    step++;
    chord.forEach(freq => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.001, t + 2.3);
      o.connect(g);
      g.connect(musicGain!);
      o.start(t);
      o.stop(t + 2.4);
    });
  };
  tick();
  musicTimer = window.setInterval(tick, 2400);
}

export function stopMusic() {
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}
