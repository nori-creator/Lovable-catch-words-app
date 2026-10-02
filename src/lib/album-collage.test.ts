import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  captionAlign,
  collageRatio,
  COLLAGE_CAP_MIN,
  COLLAGE_CAP_W,
  COLLAGE_RATIO_MAX,
  COLLAGE_RATIO_MIN,
  idSeed,
} from "./album-place";
import { PAGE_FIT_MAX_W } from "./album-page-fit";

/**
 * 誌面の約束のうち、置き方の計算（`album-day-layout.test.ts` / `album-page-fit.test.ts`）の
 * 外に残る物: 字の幅・語の揃え方・枠の比の丸め・傾きの種。
 */
describe("写真の下の字", () => {
  it("**字は潰さない**（写真を小さくしても、字の欄は下限の幅を保つ）", () => {
    // オーナー指示 2026-09-27「画像を小さくしても文字は潰れたり隠れたりしないようにして」。
    // 上限はいちばん広い写真（1枚の日）の幅まで（その語が「…」で切れない）。
    expect(COLLAGE_CAP_MIN).toBeLessThan(COLLAGE_CAP_W);
    expect(COLLAGE_CAP_W).toBeGreaterThanOrEqual(PAGE_FIT_MAX_W - 0.03);
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.collage__plain \{[\s\S]*?width: max\(100%, var\(--cap-min/);
    expect(css).toMatch(/\.collage__cap \{[\s\S]*?min-width: var\(--cap-min/);
  });

  it("**語は写真の真下が基本**。台紙の端から出る時だけ内側へ寄せる", () => {
    expect(captionAlign(0.5, 100, 340)).toBe("c");
    expect(captionAlign(0.05, 100, 340)).toBe("l");
    expect(captionAlign(0.95, 100, 340)).toBe("r");
    // 台紙を測れていない間は真ん中。
    expect(captionAlign(0.05, 100, 0)).toBe("c");
  });
});

describe("傾きの種（`id` から決まる 0〜1）", () => {
  it("**何度でも同じ**で、連番の id でも値が揃わない", () => {
    expect(idSeed("s1", 13)).toBe(idSeed("s1", 13));
    const vals = Array.from({ length: 8 }, (_, i) => idSeed(`s${i}`, 13));
    const gaps = vals.slice(1).map((v, i) => Math.abs(v - vals[i]));
    expect(Math.max(...gaps)).toBeGreaterThan(0.2);
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

/**
 * **枠の比の丸め込み。**（オーナー指示 2026-09-22「パッと今日撮った写真が
 * 一目で見えるように…画面を開いたときの情報量や作品感を出したい」）
 */
describe("枠の縦横比は誌面に収まる範囲へ", () => {
  it("縦長は 4:5 で止める（1枚で画面の半分を占めさせない）", () => {
    expect(collageRatio(2)).toBe(COLLAGE_RATIO_MAX);
    expect(collageRatio(1.5)).toBe(COLLAGE_RATIO_MAX);
  });

  it("極端な横長は帯にしない（何が写っているか読めなくなる）", () => {
    expect(collageRatio(0.2)).toBe(COLLAGE_RATIO_MIN);
  });

  it("範囲の中はそのまま（切らずに全部出す）", () => {
    expect(collageRatio(0.75)).toBe(0.75);
    expect(collageRatio(1)).toBe(1);
  });

  it("壊れた値は 1 に倒す", () => {
    expect(collageRatio(0)).toBe(1);
    expect(collageRatio(-3)).toBe(1);
    expect(collageRatio(Number.NaN)).toBe(1);
  });
});
