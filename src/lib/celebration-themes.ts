import { bell, midiHz, noise, open, voice, type Bus } from "./celebration-score";

/**
 * **祝福の音の別案**（オーナー指示 2026-09-27「キャッチの祝福の BGM・効果音を
 * 最高品質に、案を複数」）。
 *
 * 今の音（`Score`、映画の山場のような金管）に加えて、方向の違う3つを置く。
 * どれもファイルを使わず、その場で合成する（通信0・容量0）。鳴らす所は
 * 今の演出と同じ3か所 — **頂点（hit）・二度目の山（resolve）・着地（land）**。
 * 語を読む間に下げる仕組み（`Score.duck`）は同じ通り道なので、そのまま効く。
 */
export type ThemeId = "orchestra" | "pop" | "warm" | "chime";

type Theme = {
  hit: (b: Bus, t: number) => void;
  resolve: (b: Bus, t: number) => void;
  land: (b: Bus, t: number) => void;
};

/** 木琴のような短い音（すぐ減衰するサイン波＋高い倍音を一瞬）。 */
function pluck(b: Bus, n: number, at: number, gain: number) {
  voice(b, midiHz(n), at, 0.45, { type: "sine", gain, attack: 0.003 });
  voice(b, midiHz(n) * 4, at, 0.06, { type: "sine", gain: gain * 0.35, attack: 0.002 });
}

const THEMES: Record<Exclude<ThemeId, "orchestra">, Theme> = {
  /** 軽快: ゲームで何かを手に入れたときのような、明るく短い上り。 */
  pop: {
    hit(b, t) {
      [72, 76, 79, 84].forEach((n, i) =>
        voice(b, midiHz(n), t + i * 0.045, 0.16, { type: "square", gain: 0.05, lp: 3200 }),
      );
      bell(b, 96, t + 0.2, 0.35, 0.07);
      noise(b, t, 0.08, { hp: 4000, gain: 0.03 });
    },
    resolve(b, t) {
      bell(b, 91, t, 0.18, 0.08);
      bell(b, 96, t + 0.11, 0.5, 0.09);
    },
    land(b, t) {
      voice(b, 620, t, 0.12, { type: "sine", gain: 0.18, glideTo: 180 });
      noise(b, t, 0.03, { hp: 2500, gain: 0.05 });
    },
  },
  /** 温かい: 木の音で、和音をやさしく1つずつ置く。 */
  warm: {
    hit(b, t) {
      [60, 64, 67, 72].forEach((n, i) => pluck(b, n, t + i * 0.07, 0.13));
      for (const n of [48, 55]) {
        voice(b, midiHz(n), t, 1.4, { type: "triangle", gain: 0.035, attack: 0.2, lp: 700 });
      }
    },
    resolve(b, t) {
      [76, 79, 84].forEach((n, i) => pluck(b, n, t + i * 0.09, 0.1));
    },
    land(b, t) {
      voice(b, 180, t, 0.18, { type: "sine", gain: 0.2, glideTo: 90 });
      noise(b, t, 0.05, { lp: 900, gain: 0.07 });
    },
  },
  /** 静か: 鐘を1つだけ。音を控えたい人・人前で使う人向け。 */
  chime: {
    hit(b, t) {
      bell(b, 84, t, 1.4, 0.1);
      bell(b, 91, t + 0.02, 1.1, 0.04);
    },
    resolve() {
      /* 鳴らさない（1つの音で終える） */
    },
    land(b, t) {
      voice(b, midiHz(96), t, 0.25, { type: "sine", gain: 0.05 });
    },
  },
};

/** その案の段を鳴らす。`orchestra` は呼ぶ側が今の `Score` を使う。 */
export function playTheme(id: Exclude<ThemeId, "orchestra">, part: keyof Theme): void {
  const b = open();
  if (!b) return;
  THEMES[id][part](b, b.c.currentTime);
}
