/**
 * **キャッチの祝福の BGM。**（オーナー指示 2026-09-23「映画やアニメでよく使われる
 * 観客の快感を刺激するような BGM・効果音を、音響の科学的に研究して挿入して」）
 *
 * 音源ファイルは使わず、その場で合成する（`sound-engine.ts` と同じ。著作権の
 * 心配が無く、読み込み待ちも無い）。音量の設定（オフ／控えめ／しっかり）に従う。
 *
 * ## 研究から決めたこと
 * 1. **期待 → 頂点の2段にする。** 音楽の快感ではドーパミンが2回出る — 山場を
 *    「待っている間」（尾状核）と「来た瞬間」（側坐核）。Salimpoor ら 2011,
 *    Nature Neuroscience。→ 浮き上がる間に**溜め**（`build`）、絵が止まる瞬間に
 *    **解放**（`hit`）。
 * 2. **溜めは加速と音量の増加で作る。** 鳥肌（chills）を呼ぶ要素として
 *    クレッシェンド・盛り上がりが繰り返し報告されている（Bannister & Eerola 2018
 *    は山場の部分を抜くと鳥肌が有意に減ることを示した）。→ 刻みの間隔を縮め、
 *    音を大きく・高くしていく。
 * 3. **頂点の直前に一瞬の間。** 喜びの大きさは直前の緊張で決まる（Huron
 *    『Sweet Anticipation』の対比価）。予告編の「溜め → 無音 → 打撃」と同じ。
 *    → 溜めは頂点の 60ms 前で切る。
 * 4. **頂点で新しい声が入る・倚音が主音へ解決する。** 鳥肌の引き金として、
 *    新しい楽器の予想外の入り（Grewe ら 2007）と、倚音（Sloboda 1991）が
 *    よく知られている。→ 打撃の瞬間に低音・和音・高い旋律が一斉に入り、
 *    旋律は主音の1つ上（レ）から主音（ド）へ降りる。
 * 5. **発音の後にもう一度、属音から主音へ。** 5度下って主音に着く進行も
 *    Sloboda の挙げた引き金。→ 語を読んだ後、ソの和音からドの和音へ膨らませる。
 * 6. **上がる音は「良い知らせ」。** 着地まで音域は上へ広げていく。
 *
 * ## 発音を邪魔しない（このアプリでいちばん大事な所）
 * 語を読む間は BGM を **20dB 下げる**。放送の研究では、音楽の上に話し声を
 * 乗せるなら少なくとも 10 LU の差が勧められ、専門家でない人はさらに約 4 LU
 * 大きい差を好む（Torcoli ら）。学ぶ人が聞き取る音なので、その倍を取る。
 * 打撃の響きが語の頭にかぶらないよう、語は打撃の 180ms 後から読む。
 */
import { audioOut } from "./sound-engine";

/** MIDI の音番号 → 周波数（A4 = 69 = 440Hz）。 */
export function midiHz(n: number): number {
  return 440 * 2 ** ((n - 69) / 12);
}

/**
 * 楽譜（純粋なデータ。試験で音楽としての約束を確かめる）。
 * 調はハ長調（これまでのファンファーレと同じ。アプリの音の顔を変えない）。
 */
export const SCORE = {
  tonic: 60, // C4
  build: {
    /** 刻みの時刻（ms）。間隔がだんだん縮む＝加速。 */
    ticksMs: [0, 120, 215, 290, 345, 385, 410],
    /** 溜めの音が切れる時刻。 */
    endMs: 420,
    /** 頂点（絵が止まる瞬間）。浮き上がる動き（480ms）の終わり。 */
    hitMs: 480,
  },
  hit: {
    /** 低音 C3 と、C のメジャー（9th 付き）。 */
    chord: [48, 60, 64, 67, 74],
    /** 倚音 D6 → 主音 C6。 */
    melody: [86, 84],
  },
  /** 語を読み始めるのは打撃から何 ms 後か。 */
  speechDelayMs: 180,
  /** 語を読む間の BGM の下げ幅（dB）。 */
  duckDb: -20,
  resolve: {
    /** 属和音 G（ソ・シ・レ・ソ）→ 主和音 C。 */
    dominant: [55, 59, 62, 67],
    tonic: [48, 60, 64, 67, 72],
    /** 上へ駆け上がるきらめき（ド・ミ・ソ・ド）。 */
    shimmer: [84, 88, 91, 96],
  },
  land: {
    timpani: 36, // C2
    chord: [60, 64, 67, 72],
    ping: 96, // C7
  },
} as const;

// ---- 音の部品 ------------------------------------------------------------

type Held = { osc: OscillatorNode; g: GainNode };
type Bus = { c: AudioContext; gain: GainNode; held: Held[] };
let bus: Bus | null = null;

/** この祝福の間だけの音の通り道（下げる・止めるをまとめて効かせる）。 */
function open(): Bus | null {
  const a = audioOut();
  if (!a) return null;
  if (bus && bus.c === a.c) return bus;
  const gain = a.c.createGain();
  gain.gain.value = 1;
  // 重なった音で割れないよう、軽く押さえる（リミッター）。
  const limit = a.c.createDynamicsCompressor();
  limit.threshold.value = -10;
  limit.knee.value = 6;
  limit.ratio.value = 8;
  limit.attack.value = 0.003;
  limit.release.value = 0.15;
  gain.connect(limit).connect(a.out);
  bus = { c: a.c, gain, held: [] };
  return bus;
}

function voice(
  b: Bus,
  hz: number,
  at: number,
  dur: number,
  o: {
    type?: OscillatorType;
    gain?: number;
    attack?: number;
    detune?: number;
    lp?: number;
    lpTo?: number;
    glideTo?: number;
    hold?: boolean;
  } = {},
): void {
  const { c } = b;
  const osc = c.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(hz, at);
  if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, at + dur);
  if (o.detune) osc.detune.value = o.detune;
  const g = c.createGain();
  const peak = o.gain ?? 0.1;
  const attack = o.attack ?? 0.008;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  if (!o.hold) g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  let node: AudioNode = osc;
  if (o.lp) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(o.lp, at);
    if (o.lpTo) f.frequency.exponentialRampToValueAtTime(o.lpTo, at + Math.min(dur, 0.25));
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(b.gain);
  osc.start(at);
  if (o.hold) {
    b.held.push({ osc, g });
    // 止め忘れても鳴り続けないよう、長くても8秒で切る。
    osc.stop(at + 8);
  } else osc.stop(at + dur + 0.05);
}

function noise(
  b: Bus,
  at: number,
  dur: number,
  o: {
    hp?: number;
    lp?: number;
    gain?: number;
    bandFrom?: number;
    bandTo?: number;
    swell?: boolean;
  },
): void {
  const { c } = b;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  let node: AudioNode = src;
  if (o.bandFrom) {
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(o.bandFrom, at);
    bp.frequency.exponentialRampToValueAtTime(o.bandTo ?? o.bandFrom, at + dur);
    node.connect(bp);
    node = bp;
  }
  if (o.hp) {
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = o.hp;
    node.connect(hp);
    node = hp;
  }
  if (o.lp) {
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = o.lp;
    node.connect(lp);
    node = lp;
  }
  const g = c.createGain();
  const peak = o.gain ?? 0.05;
  if (o.swell) {
    // 溜め: 小さく始めて大きく（クレッシェンド）、終わりで切る。
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + dur * 0.97);
    g.gain.linearRampToValueAtTime(0, at + dur);
  } else {
    g.gain.setValueAtTime(peak, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  }
  node.connect(g).connect(b.gain);
  src.start(at);
  src.stop(at + dur + 0.02);
}

/** 金管のように厚い和音: 少しずらした2本のノコギリ波を、開いていく低域通過に通す。 */
function brass(b: Bus, notes: readonly number[], at: number, dur: number, gain: number) {
  for (const n of notes) {
    for (const d of [-7, 7]) {
      voice(b, midiHz(n), at, dur, {
        type: "sawtooth",
        gain: gain / notes.length,
        attack: 0.012,
        detune: d,
        lp: 900,
        lpTo: 3200,
      });
    }
  }
}

/** 鐘のような高い音（三角波＋倍音のサイン波）。 */
function bell(b: Bus, n: number, at: number, dur: number, gain: number) {
  voice(b, midiHz(n), at, dur, { type: "triangle", gain });
  voice(b, midiHz(n) * 2, at, dur * 0.6, { type: "sine", gain: gain * 0.25 });
}

// ---- 楽章（演出の段に合わせて呼ぶ）-----------------------------------------

export const Score = {
  /**
   * **溜め**（浮き上がる 480ms の間）。加速する刻み＋上がっていく風の音＋
   * 上がっていく音程。頂点の 60ms 前で切って、一瞬の間を作る。
   */
  build(): void {
    const b = open();
    if (!b) return;
    const t0 = b.c.currentTime;
    const { ticksMs, endMs } = SCORE.build;
    const end = endMs / 1000;
    noise(b, t0, end, { bandFrom: 500, bandTo: 7000, gain: 0.14, swell: true });
    voice(b, midiHz(43), t0, end, {
      type: "sawtooth",
      gain: 0.07,
      attack: end * 0.9,
      glideTo: midiHz(55),
      lp: 700,
      lpTo: 2400,
    });
    ticksMs.forEach((ms, i) => {
      const k = i / (ticksMs.length - 1);
      // 小太鼓のような刻み。後ろほど大きく・明るく。
      noise(b, t0 + ms / 1000, 0.05, { hp: 1800 + k * 2400, lp: 9000, gain: 0.06 + k * 0.1 });
    });
  },

  /**
   * **頂点**（絵が止まる瞬間）。低音の衝撃・厚い和音・倚音から主音へ降りる
   * 旋律・シンバル。全部が同時に「新しく入る」。その後ろに、語を読む間も
   * 続く柔らかい和音（下げて鳴らす）を置く。
   */
  hit(): void {
    const b = open();
    if (!b) return;
    const t = b.c.currentTime;
    // 衝撃（胸に来る低音）。触覚の「成功」と同じ瞬間。
    voice(b, 110, t, 0.42, { type: "sine", gain: 0.32, glideTo: 42 });
    noise(b, t, 0.06, { lp: 1800, gain: 0.08 });
    brass(b, SCORE.hit.chord, t, 0.62, 0.26);
    const [appoggiatura, tonic] = SCORE.hit.melody;
    bell(b, appoggiatura, t, 0.16, 0.12);
    bell(b, tonic, t + 0.13, 0.55, 0.13);
    noise(b, t, 1.1, { hp: 5200, gain: 0.035 });
    // 語の下で続く和音（主和音・柔らかく・低域だけ）。
    for (const n of [48, 55, 64]) {
      voice(b, midiHz(n), t + 0.05, 8, {
        type: "triangle",
        gain: 0.03,
        attack: 0.25,
        lp: 800,
        hold: true,
      });
    }
  },

  /** 語を読み始める直前に BGM を下げ、読み終えたら戻す。 */
  duck(on: boolean): void {
    if (!bus) return;
    const t = bus.c.currentTime;
    const to = on ? 10 ** (SCORE.duckDb / 20) : 1;
    bus.gain.gain.cancelScheduledValues(t);
    bus.gain.gain.setValueAtTime(bus.gain.gain.value, t);
    bus.gain.gain.linearRampToValueAtTime(to, t + (on ? 0.06 : 0.15));
  },

  /**
   * **二度目の山**（語を読んだ後、きらめきと同時）。ソの和音からドの和音へ
   * 膨らませ、上へ駆け上がるきらめきを重ねる。語の下の和音はここで溶かす。
   */
  resolve(): void {
    const b = open();
    if (!b) return;
    Score.duck(false);
    const t = b.c.currentTime;
    brass(b, SCORE.resolve.dominant, t, 0.26, 0.16);
    brass(b, SCORE.resolve.tonic, t + 0.22, 0.9, 0.24);
    SCORE.resolve.shimmer.forEach((n, i) => bell(b, n, t + 0.22 + i * 0.05, 0.5, 0.06));
    releaseHeld(b, t + 0.3);
  },

  /** **着地**（図鑑に収まる瞬間）。ティンパニの主音＋短い主和音＋高い一点。 */
  land(): void {
    const b = open();
    if (!b) return;
    const t = b.c.currentTime;
    voice(b, midiHz(SCORE.land.timpani) * 1.5, t, 0.5, {
      type: "sine",
      gain: 0.3,
      glideTo: midiHz(SCORE.land.timpani),
    });
    noise(b, t, 0.08, { lp: 900, gain: 0.06 });
    brass(b, SCORE.land.chord, t, 0.35, 0.16);
    bell(b, SCORE.land.ping, t + 0.04, 0.6, 0.05);
    releaseHeld(b, t);
  },

  /** 途中で終わった時（保存の失敗など）。鳴り残しを静かに消す。 */
  stop(): void {
    if (!bus) return;
    const t = bus.c.currentTime;
    releaseHeld(bus, t);
    Score.duck(false);
  },
};

/** 続いている和音を、ぷつっと切らずに 0.5 秒で絞ってから止める。 */
function releaseHeld(b: Bus, at: number) {
  for (const { osc, g } of b.held.splice(0)) {
    try {
      g.gain.cancelScheduledValues(at);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      osc.stop(at + 0.55);
    } catch {
      /* もう止まっている */
    }
  }
}
