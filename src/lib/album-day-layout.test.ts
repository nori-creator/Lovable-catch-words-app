import { describe, expect, it } from "vitest";
import { ALBUM_PAGE_RATIO, BASE_WIDTH, boxOf, boxesOverlap, sizePx } from "./album-place";
import {
  AUTO_ALBUM_SIZE,
  CAP_NOTE_PX,
  CAP_ROW_PX,
  dayExtra,
  dayFrameRatio,
  layoutDayAlbum,
  MIN_TAP_PX,
  PAGE_INSET_X,
  plainCardPx,
  settleDayAlbum,
  type DayLayoutSticker,
} from "./album-day-layout";

const mk = (n: number, extra: (i: number) => Partial<DayLayoutSticker> = () => ({})) =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, ...extra(i) }));
const allHero = () => true;
const RATIOS = [0.75, 1.33, 1.25, 1.33, 0.8, 1.33, 1.2, 1, 0.9, 1.1, 0.7, 1.4];

describe("R27: 1日のアルバムの置き方（ホームと本の左ページが共有）", () => {
  it("全部の札に置き場所が付き、保存した並び（album_order）の順に重なる", () => {
    const stickers = mk(4, (i) => ({ album_order: 3 - i }));
    const { items } = layoutDayAlbum({ stickers, hasHero: allHero, photoRatio: {}, boardW: 340 });
    expect(items).toHaveLength(4);
    // 並びの後ろほど上（z が大きい）。album_order 0 の s3 が最背面。
    expect(items.map((it) => it.id)).toEqual(["s3", "s2", "s1", "s0"]);
    expect(items.map((it) => it.z)).toEqual([10, 11, 12, 13]);
  });

  it("初めの置き方は写真どうしが重ならない", () => {
    const stickers = mk(6, (i) => ({ caption: i % 2 ? "ひと言" : null }));
    const { items } = layoutDayAlbum({
      stickers,
      hasHero: allHero,
      photoRatio: { s0: 0.75, s1: 1.3, s2: 1, s3: 0.9, s4: 1.1, s5: 0.8 },
      boardW: 340,
    });
    const boxes = items.map((it) =>
      boxOf(it.place, it.ratio, dayExtra(stickers.find((s) => s.id === it.id)!, true, 340)),
    );
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        expect(boxesOverlap(boxes[i], boxes[j], 0), `${i}-${j}`).toBe(false);
  });

  it("**台紙は本のページの形**: 何枚の日でも全部がページの中に収まり、台紙の高さはページの比", () => {
    // オーナー決定 2026-10-02「台紙を本のページの形にそろえる」。
    for (const n of [1, 2, 4, 7, 12]) {
      const stickers = mk(n, (i) => ({ caption: i % 3 === 0 ? "ひと言" : null }));
      const photoRatio = Object.fromEntries(stickers.map((s, i) => [s.id, RATIOS[i]]));
      const { items, boardH } = layoutDayAlbum({
        stickers,
        hasHero: allHero,
        photoRatio,
        boardW: 340,
      });
      expect(boardH, `${n}枚`).toBeCloseTo(ALBUM_PAGE_RATIO, 5);
      for (const it of items) {
        const b = boxOf(it.place, it.ratio, it.extra);
        expect(b.x - b.w / 2, `${n}枚 ${it.id} 左`).toBeGreaterThanOrEqual(-0.01);
        expect(b.x + b.w / 2, `${n}枚 ${it.id} 右`).toBeLessThanOrEqual(1.01);
        expect(b.y - b.h / 2, `${n}枚 ${it.id} 上`).toBeGreaterThanOrEqual(-0.01);
        expect(b.y + b.h / 2, `${n}枚 ${it.id} 下`).toBeLessThanOrEqual(ALBUM_PAGE_RATIO + 0.01);
      }
    }
  });

  it("写真が多い日は列を増やしてページの幅を使う（細い1本の列にしない）", () => {
    const stickers = mk(7);
    const photoRatio = Object.fromEntries(stickers.map((s, i) => [s.id, RATIOS[i]]));
    const { items } = layoutDayAlbum({ stickers, hasHero: allHero, photoRatio, boardW: 340 });
    const xs = new Set(items.map((it) => Math.round(it.place.x * 100)));
    expect(xs.size).toBeGreaterThanOrEqual(3);
    const left = Math.min(...items.map((it) => it.place.x - (it.place.scale * BASE_WIDTH) / 2));
    const right = Math.max(...items.map((it) => it.place.x + (it.place.scale * BASE_WIDTH) / 2));
    expect(right - left).toBeGreaterThan(0.8);
  });

  it("1枚の日は紙いっぱいにせず、真ん中に置く", () => {
    const { items } = layoutDayAlbum({
      stickers: mk(1),
      hasHero: allHero,
      photoRatio: { s0: 0.75 },
      boardW: 340,
    });
    expect(items[0].place.scale * BASE_WIDTH).toBeLessThanOrEqual(0.62 + 1e-9);
    expect(items[0].place.x).toBeCloseTo(0.5, 2);
  });

  it("自分で置いて保存した写真は、その場所・大きさ・向きのまま（自動の写真がそれを避ける）", () => {
    const stickers = mk(3, (i) =>
      i === 0
        ? { album_x: 0.3, album_y: 0.9, album_scale: 1.4, album_rot: 12, album_order: 0 }
        : {},
    );
    const { items } = layoutDayAlbum({ stickers, hasHero: allHero, photoRatio: {}, boardW: 340 });
    const saved = items.find((it) => it.id === "s0")!;
    expect(saved.place).toMatchObject({ x: 0.3, y: 0.9, scale: 1.4, rot: 12 });
    const savedBox = boxOf(saved.place, saved.ratio, dayExtra(stickers[0], true, 340));
    for (const it of items.filter((x) => x.id !== "s0"))
      expect(
        boxesOverlap(savedBox, boxOf(it.place, it.ratio, dayExtra(stickers[1], true, 340)), 0),
      ).toBe(false);
  });

  it("昔の縦に長い台紙でページより下に置いた写真は消えず、その日だけ台紙が伸びる", () => {
    const stickers = mk(2, (i) =>
      i === 1 ? { album_x: 0.5, album_y: 2.4, album_scale: 1.2, album_rot: 0 } : {},
    );
    const { items, boardH } = layoutDayAlbum({
      stickers,
      hasHero: allHero,
      photoRatio: {},
      boardW: 340,
    });
    const low = items.find((it) => it.id === "s1")!;
    expect(low.place.y).toBe(2.4);
    expect(boardH).toBeGreaterThan(2.4 + (low.place.scale * BASE_WIDTH * low.ratio) / 2);
  });

  it("写真の縦横比が箱の形になる（丸めは collageRatio の範囲）", () => {
    const stickers = mk(2);
    const ratio = dayFrameRatio(
      { stickers, hasHero: allHero, photoRatio: { s0: 0.5, s1: 3 }, boardW: 340 },
      () => 0.3,
    );
    expect(ratio("s0")).toBeGreaterThanOrEqual(0.66);
    expect(ratio("s1")).toBeLessThanOrEqual(1.15);
  });

  it("字だけの札は 44px を下回らない枠で、幅が変わっても字の高さ（px）は変わらない", () => {
    const stickers = mk(1, () => ({ caption: "x" }));
    const input = { stickers, hasHero: () => false, photoRatio: {}, boardW: 340 };
    for (const w of [0.2, 0.3, 0.6]) {
      const ratio = dayFrameRatio(input, () => w);
      expect(ratio("s0") * w * 340).toBeCloseTo(plainCardPx(stickers[0], w * 340, 340), 5);
      expect(ratio("s0") * w * 340).toBeGreaterThanOrEqual(MIN_TAP_PX);
    }
    // 置き方の中でも同じ高さ（枠の比は選んだ幅から出す）。
    const { items } = layoutDayAlbum(input);
    const { h } = sizePx(items[0].place, 340, items[0].ratio);
    expect(h).toBeCloseTo(
      plainCardPx(stickers[0], items[0].place.scale * BASE_WIDTH * 340, 340),
      3,
    );
    expect(dayExtra(stickers[0], true, 340)).toBeCloseTo((CAP_ROW_PX + CAP_NOTE_PX) / 340);
    expect(dayExtra(stickers[0], false, 340)).toBe(0);
    expect(dayExtra({ id: "a" }, true, 340)).toBeCloseTo(CAP_ROW_PX / 340);
  });

  it("触った順（配列の順）では置き場所が変わらない", () => {
    const stickers = mk(5, (i) => ({ album_order: i }));
    const a = settleDayAlbum({ stickers, hasHero: allHero, photoRatio: {}, boardW: 340 });
    const b = settleDayAlbum({
      stickers: [...stickers].reverse(),
      hasHero: allHero,
      photoRatio: {},
      boardW: 340,
    });
    for (const s of stickers) expect(b.settledById.get(s.id)).toEqual(a.settledById.get(s.id));
  });

  it("置いた札の実寸が幅の割合で出る。左の列は左へ、右の列は右へ傾く", () => {
    const stickers = mk(6);
    const { items, boardH } = layoutDayAlbum({
      stickers,
      hasHero: allHero,
      photoRatio: {},
      boardW: 340,
    });
    expect(boardH).toBeGreaterThan(0);
    const { w } = sizePx(items[0].place, 340, items[0].ratio);
    expect(w).toBeGreaterThan(0);
    for (const it of items) {
      expect(Math.abs(it.place.rot)).toBeGreaterThanOrEqual(1);
      expect(Math.abs(it.place.rot)).toBeLessThanOrEqual(2.5);
      if (it.place.x < 0.5 - PAGE_INSET_X) expect(it.place.rot).toBeLessThan(0);
      if (it.place.x > 0.5 + PAGE_INSET_X) expect(it.place.rot).toBeGreaterThan(0);
    }
    expect(AUTO_ALBUM_SIZE).toHaveLength(6);
  });
});
