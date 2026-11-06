// Procedurally synthesized sound effects (WebAudio oscillators; no audio files — F-180).
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.6;
let muted = false;
/** Count of sounds scheduled on the audio graph (used by tests). */
let playedCount = 0;
export const sfxPlayed = (): number => playedCount;

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}

export function setVolume(v: number, m: boolean): void {
  volume = v; muted = m;
  if (master) master.gain.value = m ? 0 : v;
}

function tone(freq: number, dur: number, type: OscillatorType, when = 0, gain = 0.25): void {
  if (muted || volume <= 0) return;
  const c = ensure();
  if (!c || !master) return;
  if (c.state === 'suspended') void c.resume();
  const t = c.currentTime + when;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
  playedCount++;
}

export const sfx = {
  click: (): void => tone(660, 0.06, 'square', 0, 0.08),
  order: (): void => tone(520, 0.08, 'triangle', 0, 0.15),
  built: (): void => { tone(523, 0.15, 'triangle'); tone(659, 0.15, 'triangle', 0.1); tone(784, 0.25, 'triangle', 0.2); },
  trained: (): void => { tone(440, 0.1, 'sine'); tone(660, 0.15, 'sine', 0.08); },
  discovery: (): void => { tone(880, 0.12, 'sine'); tone(1175, 0.2, 'sine', 0.1); },
  warning: (): void => { tone(220, 0.2, 'sawtooth', 0, 0.12); tone(196, 0.3, 'sawtooth', 0.18, 0.12); },
  victory: (): void => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 'triangle', i * 0.15)); },
};
