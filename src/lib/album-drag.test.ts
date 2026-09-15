import { describe, it, expect } from "vitest";
import {
  JIGGLE,
  LIFTED,
  SIZE_CELLS,
  cellDelta,
  jiggleStyle,
  reorder,
  resizeFromDrag,
  sizeOfCells,
  type AlbumSize,
} from "./album-drag";

/**
 * ホームのアルバムを iPhone のホーム画面のように触る所（オーナー指示 2026-09-13）。
 *
 * ここで止めるのは、**触ってみないと分からない**類の壊れ方。
 * 「大きくしたのに元に戻せない」は、絵を見ても見つからない。
 */

const ALL: AlbumSize[] = ["small", "portrait", "landscape", "large"];
const CELL = [96, 96] as const;

describe("角を引いて大きさを変える", () => {
  it("動かさなければ変わらない", () => {
    for (const s of ALL) expect([s, resizeFromDrag(0, 0, s, CELL)]).toEqual([s, s]);
  });

  it("右へ引くと横に広がる / 下へ引くと縦に伸びる", () => {
    expect(resizeFromDrag(80, 0, "small", CELL)).toBe("landscape");
    expect(resizeFromDrag(0, 80, "small", CELL)).toBe("portrait");
    expect(resizeFromDrag(80, 80, "small", CELL)).toBe("large");
  });

  it("左・上へ引くと縮む", () => {
    expect(resizeFromDrag(-80, 0, "large", CELL)).toBe("portrait");
    expect(resizeFromDrag(0, -80, "large", CELL)).toBe("landscape");
    expect(resizeFromDrag(-80, -80, "large", CELL)).toBe("small");
  });

  it("**引き返せば必ず元に戻る**（前はここが戻らなかった）", () => {
    // 前は掴んだ瞬間の大きさを取り置き、`next !== current` のときだけ
    // 書き換えていた。`current` は一度も更新されないので、大きくしてから
    // 引き返しても「元と同じ」と判定されて戻せなかった。
    for (const s of ALL) {
      // **外へ引く向きは大きさで違う。** `large` を右下へ引いても
      // それ以上大きくならない（升目の上限）ので、そこは内向きに引く。
      const [w, h] = SIZE_CELLS[s];
      const away: [number, number] = [w === 1 ? 90 : -90, h === 1 ? 90 : -90];
      expect([s, resizeFromDrag(away[0], away[1], s, CELL)]).not.toEqual([s, s]);
      expect([s, resizeFromDrag(0, 0, s, CELL)]).toEqual([s, s]); // 戻る
      expect([s, resizeFromDrag(5, -4, s, CELL)]).toEqual([s, s]); // ほぼ戻れば戻る
    }
  });

  it("升目の外へは出ない（1〜2升）", () => {
    expect(resizeFromDrag(9999, 9999, "small", CELL)).toBe("large");
    expect(resizeFromDrag(-9999, -9999, "large", CELL)).toBe("small");
  });

  it("升目の大きさに追従する（小さい画面ほど早く切り替わる）", () => {
    // 48px の升なら 27px 引けば1升ぶん。96px の升では足りない。
    expect(resizeFromDrag(30, 0, "small", [48, 48])).toBe("landscape");
    expect(resizeFromDrag(30, 0, "small", [96, 96])).toBe("small");
  });
});

describe("cellDelta（境目で震えないこと）", () => {
  it("**半分では切り替わらない**（55% まで引かせる）", () => {
    // 45% など半分より小さくすると、境目で指が1px揺れるだけで
    // 大きさが行き来して、掴んでいる物が壊れて見える。
    expect(cellDelta(48, 96)).toBe(0); // ちょうど半分 → まだ
    expect(cellDelta(53, 96)).toBe(1); // 55% → 進む
    expect(cellDelta(-53, 96)).toBe(-1);
  });

  it("0 の近くは 0（触っただけで動かさない）", () => {
    for (const d of [0, 1, -1, 10, -10]) expect([d, cellDelta(d, 96)]).toEqual([d, 0]);
  });

  it("升の大きさが 0 でも落ちない", () => {
    expect(Number.isFinite(cellDelta(10, 0))).toBe(true);
  });
});

describe("sizeOfCells", () => {
  it("升目と大きさが1対1で往復する", () => {
    for (const s of ALL) {
      const [w, h] = SIZE_CELLS[s];
      expect([s, sizeOfCells(w, h)]).toEqual([s, s]);
    }
  });

  it("範囲の外は丸める", () => {
    expect(sizeOfCells(0, 0)).toBe("small");
    expect(sizeOfCells(9, 9)).toBe("large");
  });
});

describe("揺れ（iPhone のホーム画面のように）", () => {
  it("**回転と上下、両方が動く**", () => {
    // 回転だけだと軸が止まって見え、平行移動だけだと滑って見える。
    expect(JIGGLE.rotateDeg).toBeGreaterThan(0);
    expect(JIGGLE.liftPx).toBeGreaterThan(0);
  });

  it("**速すぎない**（前は170ms＝約6Hz で、震えているようにしか見えなかった）", () => {
    expect(JIGGLE.periodMs).toBeGreaterThanOrEqual(200);
    expect(JIGGLE.periodMs).toBeLessThanOrEqual(320);
  });

  it("揺れの幅は小さい（写真が壊れて見えない量）", () => {
    expect(JIGGLE.rotateDeg).toBeLessThan(2);
    expect(JIGGLE.liftPx).toBeLessThan(2);
  });

  it("**札ごとに位相が違う**（全部が同じ拍で動くと機械の表に見える）", () => {
    const ids = ["a1", "b2", "c3", "d4", "e5", "f6"];
    const delays = new Set(ids.map((id) => jiggleStyle(id).delayMs));
    expect(delays.size).toBeGreaterThan(3);
  });

  it("周期も少しだけ散る（同じ周期だと位相をずらしてもいずれ揃う）", () => {
    const ids = ["a1", "b2", "c3", "d4", "e5", "f6"];
    expect(new Set(ids.map((id) => jiggleStyle(id).durationMs)).size).toBeGreaterThan(2);
  });

  it("同じ札はいつも同じ揺れ（描き直しで位相が飛ばない）", () => {
    expect(jiggleStyle("x")).toEqual(jiggleStyle("x"));
  });

  it("位相は1周期の中に収まり、周期は現実的な幅", () => {
    for (const id of ["a", "bb", "ccc", "dddd"]) {
      const j = jiggleStyle(id);
      expect([id, j.delayMs <= 0 && j.delayMs > -JIGGLE.periodMs]).toEqual([id, true]);
      expect([id, j.durationMs >= JIGGLE.periodMs]).toEqual([id, true]);
      expect([id, j.durationMs < JIGGLE.periodMs + JIGGLE.jitterMs]).toEqual([id, true]);
    }
  });

  it("掴んだ札は少しだけ持ち上がる（大げさにしない）", () => {
    expect(LIFTED.scale).toBeGreaterThan(1);
    expect(LIFTED.scale).toBeLessThan(1.2);
  });
});

describe("並べ替え", () => {
  it("**入れ替えではなく差し込み**（間の札が飛び越されない）", () => {
    expect(reorder(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(reorder(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("同じ所へ動かしても並びは変わらない", () => {
    expect(reorder(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("範囲の外でも落ちず、元の並びを返す", () => {
    expect(reorder(["a", "b"], -1, 0)).toEqual(["a", "b"]);
    expect(reorder(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(reorder([], 0, 0)).toEqual([]);
  });

  it("元の配列を書き換えない", () => {
    const xs = ["a", "b", "c"];
    reorder(xs, 0, 2);
    expect(xs).toEqual(["a", "b", "c"]);
  });
});
