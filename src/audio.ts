import type { SoundProfile } from './utils/gameLogic';

let ctx: AudioContext | null = null;
let master!: GainNode;
let sfxGain!: GainNode;
let musicGain!: GainNode;
let shimmerSend!: GainNode;
let noiseBuf!: AudioBuffer;
let musicTimer: number | null = null;
let currentProfile: SoundProfile = 'crystalline';

function wake() {
  if (ctx && ctx.state !== 'running' && !document.hidden) {
    ctx.resume().catch(() => {});
  }
}

/** Audio is a nicety: if the browser has no Web Audio, or refuses to start it, the game plays on in silence. */
export function initAudio() {
  if (ctx) {
    wake();
    return;
  }
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    const c = new AC();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) c.suspend().catch(() => {});
      else wake();
    });
    for (const ev of ['pointerup', 'touchend', 'keydown']) {
      window.addEventListener(ev, wake, { passive: true });
    }

    // Master compressor keeps rapid typing bursts and rich reward chords warm and punchy without clipping
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    comp.connect(c.destination);

    const m = c.createGain();
    m.gain.value = 0.9;
    m.connect(comp);

    const sg = c.createGain();
    sg.gain.value = 0.85;
    sg.connect(m);

    const mg = c.createGain();
    mg.gain.value = 0.22;
    mg.connect(m);

    // Stereo shimmer/echo network for addictive reward bells & chords
    const send = c.createGain();
    send.gain.value = 0.28;
    const delay1 = c.createDelay(0.5);
    delay1.delayTime.value = 0.11;
    const delay2 = c.createDelay(0.5);
    delay2.delayTime.value = 0.23;
    const fb = c.createGain();
    fb.gain.value = 0.34;
    const damp = c.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2600;

    send.connect(delay1);
    delay1.connect(delay2);
    delay2.connect(damp);
    damp.connect(fb);
    fb.connect(delay1);
    delay1.connect(sg);
    damp.connect(sg);

    const nb = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    ctx = c;
    master = m;
    sfxGain = sg;
    musicGain = mg;
    shimmerSend = send;
    noiseBuf = nb;
  } catch {
    ctx = null;
  }
}

export function setSoundProfile(profile: SoundProfile) {
  currentProfile = profile;
}

export function setSfxVolume(v: number) {
  if (sfxGain && ctx) {
    sfxGain.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ctx.currentTime, 0.02);
  }
}

export function setMusicVolume(v: number) {
  if (musicGain && ctx) {
    musicGain.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ctx.currentTime, 0.03);
  }
}

function noise(
  t: number,
  dur: number,
  freq: number,
  q: number,
  vol: number,
  type: BiquadFilterType = 'bandpass',
  dest?: AudioNode
) {
  if (!ctx) return;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(Math.max(40, Math.min(16000, freq)), t);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(0.0001, vol), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(dest || sfxGain || master);
  s.start(t);
  s.stop(t + dur + 0.02);
}

function tone(
  t: number,
  freq: number,
  dur: number,
  vol: number,
  type: OscillatorType = 'sine',
  dest?: AudioNode,
  endFreq?: number,
  attack = 0.004
) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, freq), t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(dest || sfxGain || master);
  o.start(t);
  o.stop(t + dur + 0.025);
}

// Lush major pentatonic + 9th/Lydian intervals in semitones for euphoric ascending progression
const REWARD_SCALE = [0, 2, 4, 7, 9, 11, 12, 14, 16, 19, 21, 24];

function comboPitchHz(combo: number): number {
  const idx = Math.max(0, combo - 1) % REWARD_SCALE.length;
  const cycleShift = Math.min(Math.floor(Math.max(0, combo - 1) / REWARD_SCALE.length), 2) * 2;
  const semi = REWARD_SCALE[idx] + cycleShift;
  return 440 * Math.pow(2, (semi - 9) / 12); // Anchored around C4 (261.63Hz) climbing upward
}

/**
 * Psychologically rewarding keystroke synthesizer.
 * Blends a physical tactile switch body with a harmonic overtone bell that climbs in pitch and
 * harmonic richness as the player's combo grows.
 */
export function playKey(combo: number, profileOverride?: SoundProfile) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const prof = profileOverride || currentProfile;
  const jitter = 1 + (Math.random() - 0.5) * 0.028;
  const pitchFactor = 1 + Math.min(combo, 50) * 0.004;
  const p = pitchFactor * jitter;

  if (prof === 'thocky') {
    // Deep PBT mechanical keycap thock + warm electric piano tine
    tone(t, 142 * p, 0.065, 0.48, 'sine', sfxGain, 54 * p, 0.002);
    tone(t, 285 * p, 0.035, 0.22, 'triangle', sfxGain, 110 * p, 0.002);
    noise(t, 0.028, 1350 * p, 1.6, 0.38, 'bandpass');
    noise(t + 0.002, 0.055, 360 * p, 2.2, 0.36, 'lowpass');
  } else if (prof === 'marimba') {
    // Warm wooden rosewood bar + 4th harmonic overtone pop
    const mFreq = (220 + (combo % 12) * 14) * jitter;
    tone(t, mFreq, 0.085, 0.36, 'sine', sfxGain, mFreq * 0.96, 0.002);
    tone(t, mFreq * 4, 0.025, 0.12, 'sine', sfxGain, undefined, 0.001);
    noise(t, 0.018, 2200 * p, 2.5, 0.22, 'bandpass');
  } else if (prof === 'synthwave') {
    // Crisp cyber pluck + sub pulse
    tone(t, 165 * p, 0.055, 0.36, 'sawtooth', sfxGain, 75 * p, 0.002);
    noise(t, 0.024, 2800 * p, 1.8, 0.28, 'bandpass');
  } else {
    // 'crystalline': tactile switch click + warm body + crystal shimmer
    tone(t, 158 * p, 0.06, 0.42, 'sine', sfxGain, 68 * p, 0.002);
    noise(t, 0.026, 2200 * p, 1.4, 0.4, 'bandpass');
    noise(t + 0.002, 0.05, 440 * p, 2.0, 0.32, 'lowpass');
  }

  // Addictive harmonic reward tone that climbs with combo
  if (combo > 0) {
    const noteHz = comboPitchHz(combo);
    const wave: OscillatorType = prof === 'synthwave' ? 'sawtooth' : prof === 'thocky' ? 'sine' : 'triangle';
    const baseVol = prof === 'synthwave' ? 0.045 : 0.075;

    // Fundamental melodic note
    tone(t, noteHz, 0.32, baseVol, wave, sfxGain, undefined, 0.005);
    // Warm fifth or octave overtone into shimmer reverb as combo builds
    if (combo >= 5) {
      tone(t + 0.008, noteHz * 2, 0.38, 0.035, 'sine', shimmerSend, undefined, 0.008);
    }
    if (combo >= 20) {
      // Sparkling major third/fifth harmonic halo in high flow state
      tone(t + 0.015, noteHz * 1.5, 0.42, 0.028, 'sine', shimmerSend, undefined, 0.01);
    }
  }
}

/**
 * Micro-reward chord played when completing a word (spacebar or end of phrase).
 * Gives a subtle, uplifting harmonic resolution that reinforces word-by-word flow.
 */
export function playWordComplete(combo: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const root = comboPitchHz(Math.max(1, combo));
  // Gentle root + fifth + octave micro-bloom
  tone(t, root, 0.28, 0.055, 'sine', shimmerSend, undefined, 0.008);
  tone(t + 0.025, root * 1.498, 0.32, 0.045, 'triangle', shimmerSend, undefined, 0.008);
  if (combo >= 10) {
    tone(t + 0.05, root * 2, 0.38, 0.04, 'sine', shimmerSend, undefined, 0.01);
  }
}

export function playMiss() {
  if (!ctx) return;
  const t = ctx.currentTime;
  // Soft, non-punishing muted wooden thud
  tone(t, 125, 0.14, 0.34, 'sine', sfxGain, 62, 0.003);
  tone(t + 0.03, 92, 0.16, 0.26, 'triangle', sfxGain, 52, 0.003);
  noise(t, 0.08, 240, 1.2, 0.24, 'lowpass');
}

export function playStep() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, 0.04, 780 + Math.random() * 220, 3.2, 0.09);
  tone(t, 250, 0.045, 0.04, 'sine', sfxGain, 165);
}

/**
 * Celebratory combo-tier chime (10x, 20x, 30x...).
 * Plays a shimmering major-9th arpeggio that pitches up with higher tiers.
 */
export function playChime(combo = 10) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const tier = Math.min(4, Math.floor(combo / 10));
  const transpose = Math.pow(2, (tier - 1) * (2 / 12)); // Steps up a whole tone per tier
  const freqs = [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98].map(f => f * transpose);

  freqs.forEach((f, i) => {
    const start = t + i * 0.055;
    tone(start, f, 0.65, 0.075, 'triangle', sfxGain, undefined, 0.005);
    tone(start + 0.01, f * 2, 0.55, 0.035, 'sine', shimmerSend, undefined, 0.008);
  });
}

/**
 * Grand end-of-track fanfare. Plays an extra golden cascade when setting a new personal best.
 */
export function playVictory(newBest = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const chord = newBest
    ? [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093.0]
    : [523.25, 659.25, 783.99, 1046.5, 1318.5];

  chord.forEach((f, i) => {
    const onset = t + i * 0.07;
    tone(onset, f, 0.9, 0.09, 'triangle', sfxGain, undefined, 0.006);
    tone(onset + 0.015, f * 1.5, 0.75, 0.04, 'sine', shimmerSend, undefined, 0.01);
  });
}

const CHORDS = [
  [174.61, 220.0, 261.63, 329.63], // Fmaj7
  [164.81, 196.0, 246.94, 293.66], // Em7
  [146.83, 174.61, 220.0, 261.63], // Dm7
  [130.81, 164.81, 196.0, 246.94], // Cmaj7
];

export function startMusic() {
  if (!ctx || musicTimer !== null) return;
  const beat = 60 / 80;
  let next = ctx.currentTime + 0.1;
  let n = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1050;
  lp.connect(musicGain);

  const tick = () => {
    if (!ctx) return;
    if (next < ctx.currentTime) next = ctx.currentTime + 0.05;
    while (next < ctx.currentTime + 0.3) {
      const bar = Math.floor(n / 4) % 4;
      const b = n % 4;
      if (b === 0) {
        CHORDS[bar].forEach(f => tone(next, f, beat * 4, 0.11, 'triangle', lp, undefined, 0.04));
      }
      if (b === 0 || b === 2) {
        tone(next, 65.4, 0.28, 0.55, 'sine', musicGain, 42, 0.005);
      }
      if (b === 2) {
        noise(next, 0.12, 1600, 0.9, 0.18, 'bandpass', musicGain);
      }
      noise(next + beat / 2, 0.035, 8500, 1.2, 0.1, 'highpass', musicGain);
      if (Math.random() < 0.45) {
        const arpNote = CHORDS[bar][Math.floor(Math.random() * 4)] * 2;
        tone(next + beat / 2, arpNote, beat * 1.2, 0.055, 'sine', lp, undefined, 0.01);
      }
      next += beat;
      n++;
    }
  };
  musicTimer = window.setInterval(tick, 100);
}

export function stopMusic() {
  if (musicTimer !== null) clearInterval(musicTimer);
  musicTimer = null;
}
