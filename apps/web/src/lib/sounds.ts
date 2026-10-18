export type SoundId =
  | 'mic-on'
  | 'mic-off'
  | 'prompt'
  | 'submit'
  | 'tick'
  | 'progress'
  | 'done'
  | 'error'
  | 'toast'
  | 'click'
  | 'import';

type Tone = { f: number; t: number; d: number; type?: OscillatorType; g?: number };

const PATCHES: Record<SoundId, Tone[]> = {
  'mic-on': [
    { f: 520, t: 0, d: 0.05, type: 'sine', g: 0.55 },
    { f: 780, t: 0.04, d: 0.07, type: 'triangle', g: 0.4 },
  ],
  'mic-off': [
    { f: 640, t: 0, d: 0.05, type: 'sine', g: 0.4 },
    { f: 360, t: 0.05, d: 0.08, type: 'triangle', g: 0.35 },
  ],
  prompt: [
    { f: 660, t: 0, d: 0.04, type: 'sine', g: 0.4 },
    { f: 880, t: 0.05, d: 0.06, type: 'sine', g: 0.35 },
  ],
  submit: [
    { f: 420, t: 0, d: 0.05, type: 'triangle', g: 0.45 },
    { f: 620, t: 0.05, d: 0.07, type: 'sine', g: 0.4 },
    { f: 840, t: 0.11, d: 0.08, type: 'sine', g: 0.3 },
  ],
  tick: [{ f: 760, t: 0, d: 0.035, type: 'square', g: 0.18 }],
  progress: [
    { f: 280, t: 0, d: 0.06, type: 'sine', g: 0.22 },
    { f: 420, t: 0.08, d: 0.07, type: 'sine', g: 0.18 },
  ],
  done: [
    { f: 523, t: 0, d: 0.07, type: 'sine', g: 0.45 },
    { f: 659, t: 0.07, d: 0.08, type: 'sine', g: 0.4 },
    { f: 784, t: 0.15, d: 0.12, type: 'triangle', g: 0.35 },
  ],
  error: [
    { f: 220, t: 0, d: 0.08, type: 'sawtooth', g: 0.22 },
    { f: 180, t: 0.08, d: 0.1, type: 'triangle', g: 0.2 },
  ],
  toast: [
    { f: 700, t: 0, d: 0.04, type: 'sine', g: 0.28 },
    { f: 980, t: 0.04, d: 0.05, type: 'sine', g: 0.22 },
  ],
  click: [{ f: 900, t: 0, d: 0.03, type: 'triangle', g: 0.2 }],
  import: [
    { f: 480, t: 0, d: 0.05, type: 'sine', g: 0.35 },
    { f: 720, t: 0.06, d: 0.07, type: 'triangle', g: 0.3 },
  ],
};

let ctx: AudioContext | null = null;
let lastPlayed: Partial<Record<SoundId, number>> = {};

function context() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

export function unlockAudio() {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
}

export function playSound(
  id: SoundId,
  options: { enabled?: boolean; volume?: number; throttleMs?: number } = {},
) {
  if (options.enabled === false) return;
  const volume = Math.min(1, Math.max(0, options.volume ?? 0.55));
  if (volume <= 0.01) return;
  const nowMs = Date.now();
  const throttle = options.throttleMs ?? (id === 'progress' || id === 'tick' ? 900 : 80);
  if (lastPlayed[id] && nowMs - lastPlayed[id]! < throttle) return;
  lastPlayed[id] = nowMs;

  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();

  const now = audio.currentTime;
  const master = audio.createGain();
  master.gain.value = volume * 0.55;
  master.connect(audio.destination);

  for (const tone of PATCHES[id]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = tone.type ?? 'sine';
    osc.frequency.setValueAtTime(tone.f, now + tone.t);
    const peak = (tone.g ?? 0.35) * volume;
    gain.gain.setValueAtTime(0.0001, now + tone.t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), now + tone.t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.t + tone.d);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now + tone.t);
    osc.stop(now + tone.t + tone.d + 0.02);
  }
}
