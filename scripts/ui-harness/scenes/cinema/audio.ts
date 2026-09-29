/**
 * 演出の音（Web Audio）。映画の音作りと同じ3つの道具だけ使う:
 *  - 残響（コンボルバー）: 小さな部屋の響きを足して「その場で鳴った」感じにする
 *  - まとめ役（コンプレッサー）: 重なっても割れない、小さい音も埋もれない
 *  - 時刻合わせ: 絵と同じ時計（AudioContext の時刻）で鳴らす
 *
 * 音そのものは ElevenLabs の効果音 v2・音楽 v2 で作った（`public/sfx/*.mp3`）。
 */
export type SfxName = "analyze" | "catch" | "celebrate" | "stinger";
const FILES: Record<SfxName, string> = {
  analyze: "/sfx/analyze-shimmer.mp3",
  catch: "/sfx/catch-snap.mp3",
  celebrate: "/sfx/celebrate-harp.mp3",
  stinger: "/sfx/stinger-taipei.mp3",
};

export class CinemaAudio {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SfxName, AudioBuffer>();
  private master: GainNode | null = null;
  private wet: GainNode | null = null;
  private loop: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  enabled = true;

  /** 押した操作の中で呼ぶ（ブラウザは人が触るまで音を出させない）。 */
  async unlock() {
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 3;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      // 残響: 作った雑音を指数で減衰させた「部屋の響き」（1.6 秒）
      const len = Math.floor(ctx.sampleRate * 1.6);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      const conv = ctx.createConvolver();
      conv.buffer = ir;
      this.wet = ctx.createGain();
      this.wet.gain.value = 0.22;
      this.wet.connect(conv).connect(comp);
      this.master.connect(comp);
      comp.connect(ctx.destination);
      await Promise.all(
        (Object.keys(FILES) as SfxName[]).map(async (k) => {
          try {
            const res = await fetch(FILES[k]);
            const buf = await ctx.decodeAudioData(await res.arrayBuffer());
            this.buffers.set(k, buf);
          } catch {
            /* 音が無くても絵は動く */
          }
        }),
      );
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  play(name: SfxName, opts: { gain?: number; delay?: number; rate?: number; pan?: number } = {}) {
    const ctx = this.ctx;
    const buf = this.buffers.get(name);
    if (!ctx || !buf || !this.enabled || !this.master || !this.wet) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = opts.gain ?? 1;
    const pan = ctx.createStereoPanner();
    pan.pan.value = opts.pan ?? 0;
    src.connect(g).connect(pan);
    pan.connect(this.master);
    pan.connect(this.wet);
    src.start(ctx.currentTime + (opts.delay ?? 0));
  }

  /** 分析中の持続音。2本を少しずらして重ね、継ぎ目を消す。 */
  startLoop() {
    const ctx = this.ctx;
    const buf = this.buffers.get("analyze");
    if (!ctx || !buf || !this.enabled || !this.master || this.loop) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 0.05;
    src.loopEnd = Math.max(0.2, buf.duration - 0.05);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.4);
    src.connect(gain).connect(this.master);
    if (this.wet) gain.connect(this.wet);
    src.start();
    this.loop = { src, gain };
  }

  stopLoop() {
    const ctx = this.ctx;
    const l = this.loop;
    if (!ctx || !l) return;
    l.gain.gain.cancelScheduledValues(ctx.currentTime);
    l.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    l.src.stop(ctx.currentTime + 0.5);
    this.loop = null;
  }
}

/** 触覚（Android の Chrome などは振動。iPhone の Safari は不可＝アプリ版は Capacitor Haptics）。 */
export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 振動できない端末 */
  }
}
