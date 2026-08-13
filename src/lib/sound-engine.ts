/**
 * Web Audio–generated micro-sounds. Zero files, tiny bundle.
 * Every sound is synthesized from primitive oscillators + envelopes so the
 * app ships a coherent, Apple-like sonic identity without a single .mp3.
 *
 * Volume levels: default "subtle" (-18 dB). User can pick off/subtle/full.
 * All calls are safe on server — they no-op when AudioContext is missing.
 */

export type Level = "off" | "subtle" | "full";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let level: Level = "subtle";
let unlocked = false;

/**
 * 保存された音量を読み込む。
 *
 * 以前これは `ensureCtx()` の中だけにあった。つまり**一度も音を鳴らして
 * いない間は `getLevel()` が既定値を返す** — 設定画面を直接開いた人には、
 * 「オフ」を選んで保存したはずなのに「控えめ」が選ばれて見えていた。
 * 読むほうと書くほうで違う値を見ているのは、設定として壊れている。
 */
let loaded = false;
function loadLevel() {
  if (loaded || typeof localStorage === "undefined") return;
  loaded = true;
  try {
    const saved = localStorage.getItem("cw-sound-level") as Level | null;
    if (saved === "off" || saved === "subtle" || saved === "full") level = saved;
  } catch {
    /* ignore */
  }
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  loadLevel();
  if (!ctx) {
    const Ctor = (window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as
      | typeof AudioContext
      | undefined;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = level === "full" ? 0.35 : level === "subtle" ? 0.14 : 0;
    master.connect(ctx.destination);
  }
  return ctx;
}

export function setLevel(l: Level) {
  level = l;
  try {
    localStorage.setItem("cw-sound-level", l);
  } catch {
    /* ignore */
  }
  if (master) master.gain.value = l === "full" ? 0.35 : l === "subtle" ? 0.14 : 0;
}
export function getLevel(): Level {
  loadLevel();
  return level;
}

/**
 * 音を出せる状態にする。最初の1回はユーザーの操作の中から呼ぶこと(iOS)。
 *
 * `unlocked` で早期に返してはいけない。iOS はアプリを背面に回すたびに
 * AudioContext を suspended に落とすので、**一度解錠したから以後は大丈夫、
 * にはならない**。前は CatchLanding が毎回 AudioContext を作り直して
 * いたので偶然これを免れていた。共有の1本にした以上、毎回状態を見る。
 */
export function unlockAudio() {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  unlocked = true;
}

function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; from?: number; to?: number; gain?: number; delay?: number } = {},
) {
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
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = opts.hp ?? 400;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = opts.lp ?? 6000;
  src.connect(hp).connect(lp).connect(g).connect(master);
  src.start();
  src.stop(c.currentTime + dur + 0.02);
}

/* ─────────── Sound library ─────────── */

export const Sound = {
  tap() {
    tone(900, 0.05, { type: "sine", gain: 0.22 });
  },
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
    tone(1318, 0.22, { type: "sine", gain: 0.3, delay: 0.12 });
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
    tone(2093, 0.45, { type: "sine", gain: 0.2, delay: 0.08 });
    tone(2637, 0.55, { type: "sine", gain: 0.16, delay: 0.16 });
  },
  reviewCorrect() {
    tone(659, 0.1, { type: "sine", gain: 0.3 });
    tone(988, 0.14, { type: "sine", gain: 0.28, delay: 0.05 });
  },
  reviewWrong() {
    tone(220, 0.14, { type: "triangle", from: 220, to: 170, gain: 0.24 });
  },
  pageSnap() {
    tone(500, 0.04, { type: "sine", from: 500, to: 700, gain: 0.12 });
  },
  /** Crystallization ping — a single high shimmer as characters solidify. */
  crystalize() {
    tone(2400, 0.18, { type: "sine", from: 2400, to: 3200, gain: 0.16 });
    tone(3600, 0.14, { type: "sine", gain: 0.09, delay: 0.05 });
    noise(0.1, { hp: 4000, lp: 12000, gain: 0.03 });
  },
  /**
   * キャッチの合図 — 「ポン」のあとに「キラン」。
   *
   * もとは CatchLanding.tsx が**自前の AudioContext** で鳴らしていた。
   * つまりこのアプリでいちばん大きい音が、音量の設定(オフ/控えめ/しっかり)を
   * 完全に無視して常に同じ大きさで鳴っていた — 「オフ」にしても鳴る。
   * ここへ移して master gain を通す。
   */
  catchChime() {
    // ポン: 低めのサイン波を素早くピッチダウン(水滴風)
    tone(520, 0.18, { type: "sine", from: 520, to: 300, gain: 0.15 });
    // キラン: 高い2音を薄く重ねて素早く減衰
    tone(1568, 0.3, { type: "sine", gain: 0.1, delay: 0.1 });
    tone(2349, 0.3, { type: "sine", gain: 0.06, delay: 0.15 });
  },
  /** Shelf landing — a soft wooden "clack" as a card seats into the cabinet. */
  shelfLand() {
    tone(160, 0.09, { type: "triangle", from: 220, to: 140, gain: 0.22 });
    tone(80, 0.14, { type: "sine", from: 90, to: 60, gain: 0.14, delay: 0.02 });
    noise(0.06, { hp: 800, lp: 3000, gain: 0.04 });
  },
};
