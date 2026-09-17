// Tiny synthesized SFX engine — Web Audio oscillators, zero asset files.
// The context is created/resumed lazily on the first user gesture.

let ctx: AudioContext | null = null;
let muted = false;

export function initSfx() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx?.state === "suspended") ctx.resume().catch(() => {});
}

export function setSfxMuted(m: boolean) {
  muted = m;
}

function tone(
  freq: number,
  dur = 0.08,
  type: OscillatorType = "triangle",
  gain = 0.05,
  delay = 0
) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noiseSweep(dur = 0.35, from = 400, to = 2200, gain = 0.05) {
  if (muted || !ctx) return;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(from, ctx.currentTime);
  f.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + dur);
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f);
  f.connect(g);
  g.connect(ctx.destination);
  src.start();
}

export const sfx = {
  /** soft UI click */
  click: () => tone(520, 0.05, "square", 0.03),
  /** cube turn blip — pitch varies so runs sound alive */
  tick: (i = 0) => tone(660 + (i % 3) * 120, 0.05, "triangle", 0.035),
  /** scramble whoosh */
  whoosh: () => noiseSweep(),
  /** verdict arrived sting */
  verdict: () => {
    tone(392, 0.12, "triangle", 0.06);
    tone(523, 0.18, "triangle", 0.06, 0.12);
  },
  /** solve complete — ascending arpeggio */
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "triangle", 0.07, i * 0.11)),
  /** gamble bust — descending saw */
  bust: () => [400, 300, 200].forEach((f, i) => tone(f, 0.18, "sawtooth", 0.05, i * 0.13)),
  /** XP banked — coin blips */
  coins: () => {
    tone(988, 0.09, "square", 0.05);
    tone(1319, 0.15, "square", 0.05, 0.09);
  },
  /** slot reel tick */
  spinTick: () => tone(880, 0.03, "square", 0.02),
};
