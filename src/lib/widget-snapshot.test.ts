import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoryItem } from "@/components/StoryInk";
import {
  WIDGET_MEDIUM,
  contentBounds,
  drawAlbumSnapshot,
  fitTransform,
  itemHeight,
} from "./widget-snapshot";

/**
 * ウィジェットの「今日のアルバム」は、書き込み・ひとこと・落書きごと1枚の絵に焼く
 * （オーナー指示 2026-09-28）。
 */
const photo: StoryItem = {
  id: "p",
  kind: "photo",
  src: "a.jpg",
  caption: "珍珠奶茶",
  x: 0.3,
  y: 0.3,
  w: 0.4,
  rot: 0,
  z: 1,
};
const label: StoryItem = {
  id: "t",
  kind: "text",
  text: "初めての夜市!",
  font: "signature",
  color: "#ff375f",
  bg: "soft",
  x: 0.7,
  y: 0.1,
  w: 0.5,
  rot: 0,
  z: 3,
};
const doodle: StoryItem = {
  id: "s",
  kind: "sketch",
  strokes: [
    {
      color: "#0a84ff",
      width: 8,
      pts: [
        [0, 0],
        [50, 50],
        [100, 0],
      ],
    },
  ],
  box: [0, 0, 100, 50],
  x: 0.8,
  y: 0.9,
  w: 0.2,
  rot: 0,
  z: 2,
};

describe("ウィジェットの絵", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("大きさは Apple の表の「中」（390/393pt 幅の iPhone で 338×158）", () => {
    expect(WIDGET_MEDIUM).toEqual({ w: 338, h: 158 });
  });

  it("書き込み全部を囲む四角に、落書きも文字も入る", () => {
    const b = contentBounds([photo, label, doodle])!;
    expect(b.x0).toBeCloseTo(0.1, 5);
    expect(b.x1).toBeCloseTo(0.95, 5);
    expect(b.y1).toBeCloseTo(0.9 + itemHeight(doodle) / 2, 5);
    expect(contentBounds([])).toBeNull();
  });

  it("枠に縦横比を保って収め、はみ出さない", () => {
    const b = { x0: 0, y0: 0, x1: 1, y1: 2 };
    const box = { x: 10, y: 20, w: 300, h: 100 };
    const t = fitTransform(b, box);
    expect(t.s).toBe(50);
    expect(t.dy + b.y0 * t.s).toBe(20);
    expect(t.dy + b.y1 * t.s).toBe(120);
    expect(t.dx + b.x0 * t.s).toBeGreaterThanOrEqual(10);
    expect(t.dx + b.x1 * t.s).toBeLessThanOrEqual(310);
  });

  it("写真・ひとこと・落書き・文字を全部描く", () => {
    vi.stubGlobal(
      "Path2D",
      class {
        constructor(public d: string) {}
      },
    );
    const calls: string[] = [];
    const texts: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_t, k: string) => {
          if (k === "measureText") return (s: string) => ({ width: s.length * 5 });
          if (k === "fillText") return (s: string) => texts.push(s);
          return (..._a: unknown[]) => calls.push(k);
        },
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D;
    const img = { width: 100, height: 100 } as unknown as CanvasImageSource;
    drawAlbumSnapshot(ctx, {
      items: [photo, label, doodle],
      images: new Map([["a.jpg", img]]),
      title: "9月28日",
      subtitle: "1枚",
    });
    expect(texts).toEqual(expect.arrayContaining(["9月28日", "珍珠奶茶", "初めての夜市!"]));
    expect(calls).toContain("drawImage");
    expect(calls.filter((c) => c === "stroke")).toHaveLength(1);
  });
});
