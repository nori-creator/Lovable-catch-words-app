import { describe, expect, it } from "vitest";
import { boxOf, boxesOverlap, sizePx } from "./album-place";
import {
  AUTO_ALBUM_SIZE,
  CAP_NOTE_PX,
  CAP_ROW_PX,
  dayExtra,
  dayFrameRatio,
  layoutDayAlbum,
  settleDayAlbum,
  type DayLayoutSticker,
} from "./album-day-layout";

const mk = (n: number, extra: (i: number) => Partial<DayLayoutSticker> = () => ({})) =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, ...extra(i) }));
const allHero = () => true;

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
    const boxes = items.map((it, i) =>
      boxOf(it.place, it.ratio, dayExtra(stickers.find((s) => s.id === it.id)!, true, 340)),
    );
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        expect(boxesOverlap(boxes[i], boxes[j], 0), `${i}-${j}`).toBe(false);
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

  it("写真の縦横比が箱の形になる（丸めは collageRatio の範囲）", () => {
    const stickers = mk(2);
    const ratio = dayFrameRatio({
      stickers,
      hasHero: allHero,
      photoRatio: { s0: 0.5, s1: 3 },
      boardW: 340,
    });
    expect(ratio("s0")).toBeGreaterThanOrEqual(0.66);
    expect(ratio("s1")).toBeLessThanOrEqual(1.15);
  });

  it("字だけの札は 44px を下回らない枠、写真の下の字は px で場所を取る", () => {
    const stickers = mk(1, () => ({ caption: "x" }));
    const ratio = dayFrameRatio({ stickers, hasHero: () => false, photoRatio: {}, boardW: 340 });
    const narrowest = 340 * 0.47 * 0.78;
    expect(ratio("s0") * narrowest).toBeGreaterThanOrEqual(44);
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

  it("台紙の高さは中身から決まり、置いた札の実寸が幅の割合で出る", () => {
    const { items, boardH } = layoutDayAlbum({
      stickers: mk(3),
      hasHero: allHero,
      photoRatio: {},
      boardW: 340,
    });
    expect(boardH).toBeGreaterThan(0);
    const { w } = sizePx(items[0].place, 340, items[0].ratio);
    expect(w).toBeGreaterThan(0);
    expect(AUTO_ALBUM_SIZE).toHaveLength(6);
  });
});
