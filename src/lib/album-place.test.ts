/**
 * アルバムの札を好きな場所・大きさ・傾きで置く所の数。
 *
 * オーナー指示 2026-09-15:
 * > 「直感的に写真を指で動かせて大きさをズームしたら大きくなるように。
 * >  また傾きも指で決めれるできるようにして。今はカクカクして…」
 *
 * 「カクカク」の正体は升目そのもの（4通りしか無かった）。ここは連続値で
 * 持つための数で、**飛ばない・引き返せば戻る・画面外へ消えない**を見る。
 */
import { describe, expect, it } from "vitest";
import {
  ALBUM_ASPECT,
  applyDelta,
  autoPlacement,
  clamp,
  gestureDelta,
  MAX_SCALE,
  MIN_SCALE,
  normalizeDeg,
  placementFrom,
  ROT_SNAP_DEG,
  settle,
  type Placement,
} from "./album-place";

const BOX = { w: 400, h: 400 / ALBUM_ASPECT };
const MID: Placement = { x: 0.5, y: 0.5, scale: 1, rot: 0 };
const one = (x: number, y: number) => ({ a: { x, y } });
const two = (ax: number, ay: number, bx: number, by: number) => ({
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
});

describe("指1本 — 動かすだけ", () => {
  it("指に 1:1 で付いてくる（割合に直すので、箱の大きさで割る）", () => {
    const d = gestureDelta(one(100, 100), one(140, 180));
    expect(d).toEqual({ dx: 40, dy: 80, scale: 1, rot: 0 });
    const p = applyDelta(MID, d, BOX);
    expect(p.x).toBeCloseTo(0.5 + 40 / BOX.w, 6);
    expect(p.y).toBeCloseTo(0.5 + 80 / BOX.h, 6);
  });

  it("1本では大きさも傾きも変えない（別々の操作にしない、の裏返し）", () => {
    const p = applyDelta(MID, gestureDelta(one(0, 0), one(300, 300)), BOX);
    expect([p.scale, p.rot]).toEqual([1, 0]);
  });
});

describe("指2本 — 動かす・広げる・回すが同時に起きる", () => {
  it("**つまんで広げると大きくなる**（距離の比がそのまま倍率）", () => {
    // 100px 離れていた2点を 200px に広げる。
    const d = gestureDelta(two(150, 200, 250, 200), two(100, 200, 300, 200));
    expect(d.scale).toBeCloseTo(2, 6);
    expect(applyDelta(MID, d, BOX).scale).toBeCloseTo(2, 6);
  });

  it("**2本の指を回すと傾く**", () => {
    // 横並びの2点を、縦並びに回す = 90度。
    const d = gestureDelta(two(100, 200, 300, 200), two(200, 100, 200, 300));
    expect(d.rot).toBeCloseTo(90, 6);
    expect(applyDelta(MID, d, BOX).rot).toBeCloseTo(90, 6);
  });

  it("広げながら動かしながら回しても、3つとも同時に効く", () => {
    const d = gestureDelta(two(150, 200, 250, 200), two(200, 300, 200, 500));
    expect(d.scale).toBeCloseTo(2, 6); // 100 → 200
    expect(d.rot).toBeCloseTo(90, 6);
    expect(d.dx).toBeCloseTo(0, 6); // 真ん中 200,200 → 200,400
    expect(d.dy).toBeCloseTo(200, 6);
  });

  it("**2点が重なった回は倍率を出さない**（割ると画面外へ吹き飛ぶ）", () => {
    const d = gestureDelta(two(200, 200, 200, 200), two(100, 200, 300, 200));
    expect(d.scale).toBe(1);
  });

  it("359度回した、ではなく −1度回した、と読む", () => {
    expect(normalizeDeg(359)).toBeCloseTo(-1, 6);
    expect(normalizeDeg(-359)).toBeCloseTo(1, 6);
    // ちょうど半回転は ±180 のどちらで表しても同じ向き。**片方に決める**
    // ことだけが大事（両方出てくると、同じ傾きの札が別物として保存される）。
    expect(Math.abs(normalizeDeg(180))).toBeCloseTo(180, 6);
    expect(normalizeDeg(180)).toBe(normalizeDeg(-180));
  });
});

describe("引き返せば、必ず元に戻る", () => {
  /**
   * 掴んだ瞬間の置き方から**毎回作り直す**ので、同じ所へ指を戻せば
   * 同じ数が出る。前の升目の実装は掴んだ瞬間の大きさと比べていたので、
   * 一度変えたら元に戻せなかった（`album-drag.ts` の注）。
   */
  it("同じ所へ指を戻すと、同じ置き方に戻る", () => {
    const start = two(150, 200, 250, 200);
    const moved = applyDelta(MID, gestureDelta(start, two(100, 260, 320, 140)), BOX);
    const back = applyDelta(MID, gestureDelta(start, start), BOX);
    expect(moved).not.toEqual(back);
    expect(back).toEqual(MID);
  });
});

describe("画面の外へ消えない・小さすぎない・大きすぎない", () => {
  it("**中心は必ず台紙の中**（出しきると二度と掴めない札ができる）", () => {
    const far = applyDelta(MID, { dx: 99999, dy: 99999, scale: 1, rot: 0 }, BOX);
    expect([far.x, far.y]).toEqual([1, 1]);
    const back = applyDelta(MID, { dx: -99999, dy: -99999, scale: 1, rot: 0 }, BOX);
    expect([back.x, back.y]).toEqual([0, 0]);
  });

  it("大きさに下限と上限がある", () => {
    expect(applyDelta(MID, { dx: 0, dy: 0, scale: 100, rot: 0 }, BOX).scale).toBe(MAX_SCALE);
    expect(applyDelta(MID, { dx: 0, dy: 0, scale: 0.001, rot: 0 }, BOX).scale).toBe(MIN_SCALE);
  });

  it("clamp は素直に働く", () => {
    expect([clamp(5, 0, 1), clamp(-5, 0, 1), clamp(0.5, 0, 1)]).toEqual([1, 0, 0.5]);
  });
});

describe("離したときだけ、まっすぐの近くを直す", () => {
  /**
   * 指ではぴったり 0 度に止められない。1〜2度だけ傾いた札が並ぶと、
   * 揃えたつもりが揃わず、直す手立ても無い。
   */
  it("**まっすぐの近くは、まっすぐにする**", () => {
    expect(settle({ ...MID, rot: ROT_SNAP_DEG - 0.5 }).rot).toBe(0);
    expect(settle({ ...MID, rot: -(ROT_SNAP_DEG - 0.5) }).rot).toBe(0);
  });

  it("はっきり傾けた物は、そのまま残す（自由を奪わない）", () => {
    expect(settle({ ...MID, rot: 22 }).rot).toBe(22);
    expect(settle({ ...MID, rot: -45 }).rot).toBe(-45);
  });

  it("動かしている最中は吸い付かせない（途中で飛ぶと驚く）", () => {
    const p = applyDelta(MID, { dx: 0, dy: 0, scale: 1, rot: 1 }, BOX);
    expect(p.rot).toBeCloseTo(1, 6);
  });
});

describe("まだ自分で置いていない札", () => {
  it("**何度描いても同じ場所**（乱数だと描き直すたびに動く）", () => {
    expect(autoPlacement(4, "abc")).toEqual(autoPlacement(4, "abc"));
  });

  it("3列の律動で並ぶ（昔の升目に寄せる。いきなり散らばらせない）", () => {
    const xs = [0, 1, 2, 3].map((i) => autoPlacement(i, "x").x);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
    expect(xs[3]).toBeCloseTo(xs[0], 6); // 次の行は左へ戻る
    expect(autoPlacement(3, "x").y).toBeGreaterThan(autoPlacement(0, "x").y);
  });

  it("札ごとに少しだけ傾く（まっすぐ揃いすぎないのが紙らしさ）", () => {
    const rots = ["a", "b", "c", "d", "e"].map((id) => autoPlacement(0, id).rot);
    expect(new Set(rots).size).toBeGreaterThan(1);
    for (const r of rots) expect(Math.abs(r)).toBeLessThanOrEqual(3.5);
  });
});

describe("保存された値の読み方", () => {
  it("そろっていればそのまま使う", () => {
    const p = placementFrom({ x: 0.3, y: 0.7, scale: 1.5, rot: 12 }, 0, "id");
    expect(p).toEqual({ x: 0.3, y: 0.7, scale: 1.5, rot: 12 });
  });

  it("**欠けている値だけ自動の置き方に倒す**（列がまだ無い環境でも壊れない）", () => {
    const auto = autoPlacement(2, "id");
    const p = placementFrom({ x: 0.3, y: null, scale: undefined, rot: null }, 2, "id");
    expect(p.x).toBe(0.3);
    expect(p.y).toBeCloseTo(auto.y, 6);
    expect(p.scale).toBe(auto.scale);
    expect(p.rot).toBeCloseTo(auto.rot, 6);
  });

  it("壊れた値は範囲に収める（`NaN` や桁外れが入っていても画面は壊れない）", () => {
    const p = placementFrom({ x: 99, y: -5, scale: 1e9, rot: 3600 + 10 }, 0, "id");
    expect([p.x, p.y, p.scale]).toEqual([1, 0, MAX_SCALE]);
    expect(p.rot).toBeCloseTo(10, 6);
    const n = placementFrom({ x: NaN, y: NaN, scale: NaN, rot: NaN }, 0, "id");
    expect(Number.isFinite(n.x) && Number.isFinite(n.scale)).toBe(true);
  });
});
