/**
 * **録った音（効果音・短い曲）を鳴らす**（オーナー指示 2026-09-28「BGMや効果音はチープな
 * AIの音声ではなく、本物の映画の効果音のクオリティを使いたい。必要であれば…外部のAIを
 * 繋いで」）。
 *
 * これまでの音は全部その場で合成していた（`sound-engine.ts`、ファイル0個）。軽いが、
 * 「ピッ」「ポン」の電子音の域を出ない。ここでは ElevenLabs（Sound Effects v2 / Music v2）
 * で作った音を `public/sfx/el-*.mp3` に置き、**先に読み解いておいて**（Web Audio の
 * `AudioBuffer`）鳴らす瞬間に待たない。音量・オフの設定は合成の音と同じ出口
 * （`audioOut()` = 設定の「オフ／控えめ／しっかり」）を通るので、そのまま効く。
 *
 * 読めない・オフのときは何もしない（呼ぶ側の合成の音がそのまま鳴る — `playSfx` は
 * 鳴らせたかどうかを返す）。
 *
 * 素材（2026-09-28 生成。ElevenLabs の flow 5rchjRsJpHv1UwiX4cbk）:
 *   analyze-loop    AI 分析中の静かなきらめき（4秒・繰り返し）
 *   catch-impact    捕まえた瞬間の「シュッ→ドン」（頭 0.25 秒が山）
 *   book-open       硬い表紙のきしみ→紙を1枚めくる（0.65 秒から鳴る）
 *   gallery-slide   写真の札が滑る短い「スッ」
 *   celebrate-sting 5秒の祝福の弦とハープ（1秒で山）
 */
import { audioOut } from "./sound-engine";

export type SfxName =
  "analyze-loop" | "catch-impact" | "book-open" | "gallery-slide" | "celebrate-sting";

/** 素材ごとの音量（素材の大きさの違いを揃える）と、鳴らし始める位置。 */
const TRIM: Record<SfxName, { gain: number; offset: number }> = {
  "analyze-loop": { gain: 0.9, offset: 0 },
  "catch-impact": { gain: 1.4, offset: 0 },
  "book-open": { gain: 1.6, offset: 0.6 },
  "gallery-slide": { gain: 1.2, offset: 0.05 },
  "celebrate-sting": { gain: 1.1, offset: 0 },
};

const buffers = new Map<SfxName, AudioBuffer>();
const loading = new Map<SfxName, Promise<AudioBuffer | null>>();

export function sfxUrl(name: SfxName): string {
  return `/sfx/el-${name}.mp3`;
}

/** 先に取りに行って読み解いておく（画面を開いた時に呼ぶ）。 */
export function preloadSfx(names: readonly SfxName[]): Promise<void> {
  return Promise.all(names.map(load)).then(() => undefined);
}

function load(name: SfxName): Promise<AudioBuffer | null> {
  const have = buffers.get(name);
  if (have) return Promise.resolve(have);
  const running = loading.get(name);
  if (running) return running;
  const o = audioOut();
  if (!o || typeof fetch === "undefined") return Promise.resolve(null);
  const job = fetch(sfxUrl(name))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then(
      (bytes) =>
        new Promise<AudioBuffer | null>((resolve) => {
          const p = o.c.decodeAudioData(bytes, resolve, () => resolve(null));
          if (p && typeof (p as Promise<AudioBuffer>).then === "function") {
            (p as Promise<AudioBuffer>).then(resolve, () => resolve(null));
          }
        }),
    )
    .then((buf) => {
      if (buf) buffers.set(name, buf);
      return buf;
    })
    .catch(() => null)
    .finally(() => loading.delete(name));
  loading.set(name, job);
  return job;
}

/**
 * 鳴らす。読み解き済みでなければ（初回・圏外）鳴らさずに `false` を返し、裏で読み解く
 * — 次からは鳴る。呼ぶ側は `false` のとき合成の音で代わりに鳴らせる。
 */
export function playSfx(name: SfxName, opts: { gain?: number } = {}): boolean {
  const o = audioOut();
  const buf = buffers.get(name);
  if (!o || !buf) {
    void load(name);
    return false;
  }
  try {
    const src = o.c.createBufferSource();
    src.buffer = buf;
    const g = o.c.createGain();
    g.gain.value = TRIM[name].gain * (opts.gain ?? 1);
    src.connect(g).connect(o.out);
    src.start(0, TRIM[name].offset);
    return true;
  } catch {
    return false;
  }
}

/**
 * 繰り返し鳴らす（分析中など）。止める関数を返す。止める時は 0.25 秒で消す（ぶつ切りに
 * しない）。まだ読み解けていなければ読み解き終わった時に鳴らし始める（その前に止めれば
 * 鳴らない）。鳴らせない端末では何もしない。
 */
export function loopSfx(name: SfxName, opts: { gain?: number } = {}): () => void {
  let stopped = false;
  let stopNow: (() => void) | null = null;
  const begin = (buf: AudioBuffer | null) => {
    const o = audioOut();
    if (stopped || !o || !buf) return;
    try {
      const src = o.c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = o.c.createGain();
      const target = TRIM[name].gain * (opts.gain ?? 1);
      const now = o.c.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(target, now + 0.4);
      src.connect(g).connect(o.out);
      src.start();
      stopNow = () => {
        const t = o.c.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        src.stop(t + 0.3);
      };
    } catch {
      /* 鳴らせない */
    }
  };
  const have = buffers.get(name);
  if (have) begin(have);
  else void load(name).then(begin);
  return () => {
    if (stopped) return;
    stopped = true;
    try {
      stopNow?.();
    } catch {
      /* 既に止まっている */
    }
  };
}

/** 試験用。 */
export function resetSfxForTest(): void {
  buffers.clear();
  loading.clear();
}
