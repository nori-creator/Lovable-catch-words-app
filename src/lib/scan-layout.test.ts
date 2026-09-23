import { describe, expect, it } from "vitest";
import { clampToVisible, coverPoint, focusedIndex } from "./scan-layout";

describe("coverPoint", () => {
  it("縦横比が同じなら、そのまま比例", () => {
    expect(coverPoint([500, 500], { w: 720, h: 1280 }, { w: 360, h: 640 })).toEqual({
      left: 180,
      top: 320,
    });
  });

  it("横長の写真を縦長の画面に置くと左右が切れる。真ん中は真ん中、端は画面の外", () => {
    // 1280x720 を 390x844 へ: 拡大率は高さ基準 844/720。
    const box = { w: 390, h: 844 };
    const mid = coverPoint([500, 500], { w: 1280, h: 720 }, box);
    expect(mid.left).toBeCloseTo(195);
    expect(mid.top).toBeCloseTo(422);
    const left = coverPoint([0, 0], { w: 1280, h: 720 }, box);
    expect(left.left).toBeLessThan(0);
    expect(left.top).toBeCloseTo(0);
  });

  it("縦長の写真を少し横長の箱に置くと上下が切れる（以前はここで点がずれていた）", () => {
    const box = { w: 390, h: 500 };
    const p = coverPoint([500, 100], { w: 720, h: 1280 }, box);
    // 拡大率は幅基準 390/720。写真の高さ 693px のうち上下 96.7px ずつ切れる。
    const s = 390 / 720;
    expect(p.top).toBeCloseTo((500 - 1280 * s) / 2 + 128 * s);
    // 素朴な比例（100/1000*500 = 50）とは違う位置になる。
    expect(Math.abs(p.top - 50)).toBeGreaterThan(20);
  });

  it("大きさが分からないときは比例に戻る", () => {
    expect(coverPoint([250, 750], { w: 0, h: 0 }, { w: 400, h: 800 })).toEqual({
      left: 100,
      top: 600,
    });
  });
});

describe("clampToVisible", () => {
  it("シートの裏に入る点は、シートの上端より上へ持ち上げる", () => {
    const p = clampToVisible({ left: 100, top: 800 }, { w: 390, bottom: 700 });
    expect(p.top).toBe(700 - 48);
    expect(p.left).toBe(100);
  });

  it("画面の外（左右・上）の点も内側へ", () => {
    const p = clampToVisible({ left: -30, top: -10 }, { w: 390, bottom: 700 });
    expect(p.left).toBe(24);
    expect(p.top).toBe(56);
    expect(clampToVisible({ left: 500, top: 300 }, { w: 390, bottom: 700 }).left).toBe(366);
  });
});

describe("focusedIndex", () => {
  const items = [0, 1, 2, 3, 4].map((i) => ({ left: i * 110, width: 100 }));
  it("送っていないときは先頭、端まで送ったときは末尾", () => {
    expect(focusedIndex(items, { scrollLeft: 0, width: 300, scrollWidth: 540 })).toBe(0);
    expect(focusedIndex(items, { scrollLeft: 240, width: 300, scrollWidth: 540 })).toBe(4);
  });
  it("途中では真ん中にいちばん近いもの", () => {
    // 中心 = 120 + 150 = 270 → 3番目(220..320, 中心270)
    expect(focusedIndex(items, { scrollLeft: 120, width: 300, scrollWidth: 540 })).toBe(2);
  });
  it("空なら -1", () => {
    expect(focusedIndex([], { scrollLeft: 0, width: 300, scrollWidth: 300 })).toBe(-1);
  });
});
