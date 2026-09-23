import { describe, expect, it } from "vitest";
import { nearestStop, zoomStops } from "./CameraChrome";

/**
 * 倍率の刻みを決める計算。**画面を描かずに確かめられる所**なので、
 * 見た目の検査ではなくここで押さえる。
 *
 * 直したのはオーナー指示 2026-09-15「Apple風のズームメーターを付けて」。
 * 前は 0.1 刻みの縦スライダーで、**端末に無い倍率まで動かせて**いた。
 */
describe("倍率の刻みは、端末が本当に出せる範囲からだけ作る", () => {
  it("広角を持つ端末は 0.5 から始まる", () => {
    expect(zoomStops(0.5, 6)).toEqual([0.5, 1, 2, 3, 5]);
  });

  it("倍率を持たない端末では刻みが1つしか出ない（＝目盛りを出さない）", () => {
    expect(zoomStops(1, 1)).toEqual([1]);
  });

  it("2倍までの端末に 3倍・5倍の粒を作らない", () => {
    expect(zoomStops(1, 2)).toEqual([1, 2]);
  });

  it("下限が 1 を超える端末では、1 の粒も出さない", () => {
    // 望遠固定のカメラ。押しても届かない粒を置かない。
    expect(zoomStops(2, 4)).toEqual([2, 3]);
  });
});

describe("いま点く粒", () => {
  const stops = [0.5, 1, 2, 3];

  it("ちょうどの値はその粒が点く", () => {
    expect(nearestStop(stops, 1)).toBe(1);
    expect(nearestStop(stops, 3)).toBe(3);
  });

  it("近ければ吸い付く（端末が少しずれた値を返すことがある）", () => {
    expect(nearestStop(stops, 1.1)).toBe(1);
    expect(nearestStop(stops, 0.44)).toBe(0.5);
  });

  /**
   * **間の値では、どの粒も点けない。** ピンチで 1.6倍にしている人に
   * 「2倍です」と点けて見せるのは嘘になる（押せば本当に 2倍へ飛ぶので、
   * 点いている＝いまその値、でなければ意味が食い違う）。
   */
  it("刻みから離れているときは、どれも点かない", () => {
    expect(nearestStop(stops, 1.6)).toBe(null);
    expect(nearestStop(stops, 2.5)).toBe(null);
  });

  it("刻みが無ければ null", () => {
    expect(nearestStop([], 1)).toBe(null);
  });
});

import { zoomFromDrag, ZOOM_PX_PER_DOUBLING } from "./CameraChrome";

describe("払って倍率を変える（オーナー指示 2026-09-23）", () => {
  it("右へ一定の距離で2倍、左へ同じだけで半分", () => {
    expect(zoomFromDrag(1, ZOOM_PX_PER_DOUBLING, 0.5, 5)).toBe(2);
    expect(zoomFromDrag(2, -ZOOM_PX_PER_DOUBLING, 0.5, 5)).toBe(1);
  });
  it("端末の範囲を越えない・0.1 刻み", () => {
    expect(zoomFromDrag(1, 1000, 1, 3)).toBe(3);
    expect(zoomFromDrag(1, -1000, 1, 3)).toBe(1);
    expect(zoomFromDrag(1, 30, 1, 3)).toBe(1.2);
  });
});
