/**
 * Web Audio–generated micro-sounds. Zero files, tiny bundle.
 * Every sound is synthesized from primitive oscillators + envelopes so the
 * app ships a coherent, Apple-like sonic identity without a single .mp3.
 *
 * Volume levels: default "subtle" (-18 dB). User can pick off/subtle/full.
 * All calls are safe on server — they no-op when AudioContext is missing.
 */

type Level = "off" | "subtle" | "full";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let level: Level = "subtle";
let unlocked = false;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = level === "full" ? 0.35 : level === "subtle" ? 0.14 : 0;
    master.connect(ctx.destination);
    try {
      const saved = localStorage.getItem("cw-sound-level") as Level | null;
      if (saved === "off" || saved === "subtle" || saved === "full") setLevel(saved);
    } catch { /* ignore */ }
  }
  return ctx;
}

export function setLevel(l: Level) {
  level = l;
  try { localStorage.setItem("cw-sound-level", l); } catch { /* ignore */ }
  if (master) master.gain.value = l === "full" ? 0.35 : l === "subtle" ? 0.14 : 0;
}
export function getLevel(): Level { return level; }

/** Must be called inside a user gesture the first time (iOS requirement). */
export function unlockAudio() {
  const c = ensureCtx();
  if (!c || unlocked) return;
  if (c.state === "suspended") void c.resume();
  unlocked = true;
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; from?: number; to?: number; gain?: number; delay?: number } = {}) {
  const c = ensureCtx();
  if (!c || !master || level === "off") return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? "sine";
  const from = opts.from ?? freq;
  const to = opts.to ?? freq;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  const peak = opts.gain ?? 0.5;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, opts: { hp?: number; lp?: number; gain?: number } = {}) {
  const c = ensureCtx();
  if (!c || !master || level === "off") return;
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.7;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = opts.gain ?? 0.2;
  const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = opts.hp ?? 400;
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = opts.lp ?? 6000;
  src.connect(hp).connect(lp).connect(g).connect(master);
  src.start();
  src.stop(c.currentTime + dur + 0.02);
}

/* ─────────── Sound library ─────────── */

export const Sound = {
  tap() { tone(900, 0.05, { type: "sine", gain: 0.22 }); },
  scanStart() {
    tone(700, 0.18, { type: "sine", from: 700, to: 260, gain: 0.4 });
    tone(60, 0.6, { type: "sine", from: 80, to: 40, gain: 0.18 });
    noise(0.18, { hp: 500, lp: 2400, gain: 0.05 });
  },
  scanReading() {
    // Low sub-bass texture during the "AI is analyzing" act.
    tone(55, 0.9, { type: "sine", from: 55, to: 70, gain: 0.14 });
    noise(0.9, { hp: 200, lp: 900, gain: 0.03 });
  },
  scanPulse() {
    tone(220, 0.12, { type: "triangle", from: 220, to: 340, gain: 0.18 });
  },
  scanSuccess() {
    // three-note arpeggio, Apple notification-like
    tone(880, 0.14, { type: "sine", gain: 0.35 });
    tone(1108, 0.14, { type: "sine", gain: 0.32, delay: 0.06 });
    tone(1318, 0.22, { type: "sine", gain: 0.30, delay: 0.12 });
  },
  cardEnter() {
    // Scroll-snap landing chirp with slight random pitch → variable reward.
    const base = 480 + Math.floor(Math.random() * 200);
    tone(base, 0.045, { type: "sine", from: base, to: base + 220, gain: 0.11 });
  },
  capture() {
    noise(0.06, { hp: 2000, lp: 8000, gain: 0.35 });
    tone(1400, 0.08, { type: "square", from: 1400, to: 500, gain: 0.15 });
  },
  reunion() {
    tone(1568, 0.35, { type: "sine", gain: 0.24 });
    tone(2093, 0.45, { type: "sine", gain: 0.20, delay: 0.08 });
    tone(2637, 0.55, { type: "sine", gain: 0.16, delay: 0.16 });
  },
  reviewCorrect() {
    tone(659, 0.10, { type: "sine", gain: 0.30 });
    tone(988, 0.14, { type: "sine", gain: 0.28, delay: 0.05 });
  },
  reviewWrong() {
    tone(220, 0.14, { type: "triangle", from: 220, to: 170, gain: 0.24 });
  },
  pageSnap() {
    tone(500, 0.04, { type: "sine", from: 500, to: 700, gain: 0.12 });
  },
};
