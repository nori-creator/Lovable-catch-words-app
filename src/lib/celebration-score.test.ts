import { describe, expect, it } from "vitest";
import { midiHz, SCORE } from "./celebration-score";

/** ハ長調の音（ド・レ・ミ・ファ・ソ・ラ・シ）。 */
const C_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);

describe("祝福の BGM の楽譜（オーナー指示 2026-09-23・研究にもとづく約束）", () => {
  it("音番号 → 周波数（A4 = 440Hz、C4 ≒ 261.63Hz）", () => {
    expect(midiHz(69)).toBe(440);
    expect(midiHz(60)).toBeCloseTo(261.63, 1);
  });

  it("溜めは加速する（刻みの間隔がだんだん縮む）", () => {
    const t = SCORE.build.ticksMs;
    const gaps = t.slice(1).map((v, i) => v - t[i]);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeLessThan(gaps[i - 1]);
  });

  it("頂点の直前に一瞬の間（溜めは頂点の 50ms 以上前に切れる。Huron の対比価）", () => {
    expect(SCORE.build.hitMs - SCORE.build.endMs).toBeGreaterThanOrEqual(50);
    expect(Math.max(...SCORE.build.ticksMs)).toBeLessThan(SCORE.build.endMs);
    // 頂点は浮き上がる動き（v5_reward の 480ms）の終わりと同じ瞬間。
    expect(SCORE.build.hitMs).toBe(480);
  });

  it("頂点の旋律は倚音: 主音の1つ上から主音へ降りる（Sloboda 1991）", () => {
    const [app, tonic] = SCORE.hit.melody;
    expect(app - tonic).toBe(2);
    expect(tonic % 12).toBe(SCORE.tonic % 12);
  });

  it("二度目の山は属和音（ソ）から主和音（ド）へ", () => {
    expect((SCORE.resolve.dominant[0] - SCORE.tonic + 120) % 12).toBe(7);
    expect(SCORE.resolve.tonic[0] % 12).toBe(SCORE.tonic % 12);
    // きらめきは上へ駆け上がる。
    const s = SCORE.resolve.shimmer;
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
  });

  it("使う音はすべてハ長調の中（アプリの音の顔を変えない）", () => {
    const all = [
      ...SCORE.hit.chord,
      ...SCORE.hit.melody,
      ...SCORE.resolve.dominant,
      ...SCORE.resolve.tonic,
      ...SCORE.resolve.shimmer,
      ...SCORE.land.chord,
      SCORE.land.timpani,
      SCORE.land.ping,
    ];
    for (const n of all) expect(C_MAJOR.has(n % 12)).toBe(true);
  });

  it("着地は主音で終わる", () => {
    expect(SCORE.land.timpani % 12).toBe(0);
    expect(SCORE.land.ping % 12).toBe(0);
  });

  it("発音を邪魔しない: 読む間は 20dB 以上下げ、打撃の 150ms 以上後から読む", () => {
    expect(SCORE.duckDb).toBeLessThanOrEqual(-20);
    expect(SCORE.speechDelayMs).toBeGreaterThanOrEqual(150);
  });
});
