import { describe, it, expect } from "vitest";
import {
  bubbleSize,
  layoutBubbles,
  stepBubbles,
  MAX_DT_MS,
  MAX_SPEED,
  type Bubble,
  type World,
} from "./bubble-physics";

/**
 * 浮いて跳ねる札（オーナー指示 2026-08-27 ⑤）。
 *
 * この手の輪は**静かに壊れる** — 札が枠の外へ抜ける、速さが発散する、
 * 裏で開いたタブに戻った瞬間に全部が飛ぶ。どれも「たまに変」としか
 * 報告されないので、ここで縛る。
 */

const world: World = { width: 300, height: 160 };
const b = (over: Partial<Bubble> = {}): Bubble => ({
  id: "a",
  x: 150,
  y: 80,
  vx: 0,
  vy: 0,
  hw: 20,
  hh: 12,
  ...over,
});

/** n コマ回す（16ms ≒ 60fps）。 */
function run(start: Bubble[], frames: number, dt = 16, w: World = world): Bubble[] {
  let cur = start;
  for (let i = 0; i < frames; i++) cur = stepBubbles(cur, w, dt);
  return cur;
}

/** その2つが（どちらかの軸で）離れているか。 */
const apart = (a: Bubble, c: Bubble) =>
  a.hw + c.hw - Math.abs(c.x - a.x) <= 0.01 || a.hh + c.hh - Math.abs(c.y - a.y) <= 0.01;

describe("枠から出ない", () => {
  it("速い札を長く回しても、全部が枠の中にいる", () => {
    const start = [
      b({ id: "1", x: 30, y: 30, vx: 400, vy: 300 }),
      b({ id: "2", x: 260, y: 130, vx: -350, vy: -260, hw: 40, hh: 14 }),
      b({ id: "3", x: 150, y: 80, vx: 500, vy: -500, hw: 14, hh: 10 }),
    ];
    for (const bb of run(start, 600)) {
      expect([bb.id, bb.x >= bb.hw - 0.001, bb.x <= world.width - bb.hw + 0.001]).toEqual([
        bb.id,
        true,
        true,
      ]);
      expect([bb.id, bb.y >= bb.hh - 0.001, bb.y <= world.height - bb.hh + 0.001]).toEqual([
        bb.id,
        true,
        true,
      ]);
    }
  });

  it("**裏タブから戻った1コマで突き抜けない**(`dt` に上限)", () => {
    const [after] = stepBubbles([b({ vx: 300, vy: 200 })], world, 30_000);
    expect(after.x).toBeLessThanOrEqual(world.width - after.hw + 0.001);
    expect(after.y).toBeLessThanOrEqual(world.height - after.hh + 0.001);
    const [capped] = stepBubbles([b({ vx: 10, vy: 0 })], world, 30_000);
    const [atCap] = stepBubbles([b({ vx: 10, vy: 0 })], world, MAX_DT_MS);
    expect(capped.x).toBeCloseTo(atCap.x, 6);
  });

  it("枠が札より小さくても、外に置き去りにしない", () => {
    const tiny: World = { width: 10, height: 10 };
    const [after] = stepBubbles([b({ hw: 40, hh: 30, x: 200, y: 200 })], tiny, 16);
    expect(Number.isFinite(after.x)).toBe(true);
    expect(after.x).toBeLessThanOrEqual(tiny.width);
    expect(after.y).toBeLessThanOrEqual(tiny.height);
  });
});

describe("跳ね返る", () => {
  it("壁に当たると向きが変わる", () => {
    const [after] = stepBubbles([b({ x: 22, y: 80, vx: -200, vy: 0 })], world, 16);
    expect(after.vx).toBeGreaterThan(0);
  });

  it("跳ね返るたびに少しだけ勢いを落とす(永久に同じ速さで往復しない)", () => {
    const before = 200;
    const [after] = stepBubbles([b({ x: 22, y: 80, vx: -before, vy: 0 })], world, 16);
    expect(Math.abs(after.vx)).toBeLessThan(before);
  });

  it("速さは上限を超えない(押し合いで弾け飛ばない)", () => {
    const start = [b({ id: "1" }), b({ id: "2" })];
    for (const bb of run(start, 120)) {
      expect([bb.id, Math.hypot(bb.vx, bb.vy) <= MAX_SPEED + 0.001]).toEqual([bb.id, true]);
    }
  });
});

describe("押し合う", () => {
  it("重なった2つは離れる", () => {
    const start = [b({ id: "1", x: 140, y: 80 }), b({ id: "2", x: 155, y: 80 })];
    const [a1, a2] = stepBubbles(start, world, 16);
    expect(apart(a1, a2)).toBe(true);
  });

  it("**食い込みの浅い軸へ逃がす**(斜めへ逃がして玉突きにしない)", () => {
    const start = [b({ id: "1", x: 140, y: 80 }), b({ id: "2", x: 175, y: 80 })];
    const [a1, a2] = stepBubbles(start, world, 16);
    expect(a1.y).toBeCloseTo(80, 6);
    expect(a2.y).toBeCloseTo(80, 6);
    expect(a2.x - a1.x).toBeGreaterThan(35);
  });

  it("**3つ以上の塊もほどける**(1周で解けない重なりを残さない)", () => {
    const start = [
      b({ id: "1", x: 150, y: 80 }),
      b({ id: "2", x: 152, y: 82 }),
      b({ id: "3", x: 154, y: 78 }),
    ];
    const after = run(start, 90);
    for (let i = 0; i < after.length; i++) {
      for (let j = i + 1; j < after.length; j++) {
        expect([after[i].id, after[j].id, apart(after[i], after[j])]).toEqual([
          after[i].id,
          after[j].id,
          true,
        ]);
      }
    }
  });

  it("ぴったり重なっていても、決まった向きへ逃がす(同じ入力で同じ絵)", () => {
    const start = [b({ id: "1" }), b({ id: "2" })];
    expect(stepBubbles(start, world, 16)).toEqual(stepBubbles(start, world, 16));
  });

  it("離れていく2つを跳ね返さない", () => {
    const start = [b({ id: "1", x: 140, y: 80, vx: -30 }), b({ id: "2", x: 155, y: 80, vx: 30 })];
    const [a1, a2] = stepBubbles(start, world, 16);
    expect(a1.vx).toBeLessThan(0);
    expect(a2.vx).toBeGreaterThan(0);
  });
});

describe("渡した物を書き換えない", () => {
  it("元の配列も中身も変わらない(React の状態をその場で壊さない)", () => {
    const start = [b({ vx: 50, vy: 30 })];
    const snapshot = JSON.parse(JSON.stringify(start));
    stepBubbles(start, world, 16);
    expect(start).toEqual(snapshot);
  });

  it("0ms でも落ちない(同じ位置の写しを返す)", () => {
    const start = [b({ vx: 50 })];
    expect(stepBubbles(start, world, 0)).toEqual(start);
    expect(stepBubbles(start, world, 0)).not.toBe(start);
  });

  it("札が無くても落ちない", () => {
    expect(stepBubbles([], world, 16)).toEqual([]);
  });
});

describe("layoutBubbles", () => {
  const items = [
    { id: "1", hw: 24, hh: 13 },
    { id: "2", hw: 30, hh: 13 },
    { id: "3", hw: 18, hh: 13 },
    { id: "4", hw: 22, hh: 13 },
  ];

  it("同じ種なら同じ置き方(検査で同じ絵を撮れる)", () => {
    expect(layoutBubbles(items, world, 7)).toEqual(layoutBubbles(items, world, 7));
  });

  it("種が違えば違う置き方", () => {
    expect(layoutBubbles(items, world, 1)).not.toEqual(layoutBubbles(items, world, 2));
  });

  it("最初から枠の中に置く", () => {
    for (const bb of layoutBubbles(items, world, 3)) {
      expect([bb.id, bb.x >= bb.hw - 0.001, bb.x <= world.width - bb.hw + 0.001]).toEqual([
        bb.id,
        true,
        true,
      ]);
    }
  });

  it("**置いた時点で重なっていない**(1コマ目で弾け飛ばない)", () => {
    const placed = layoutBubbles(items, world, 11);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect([placed[i].id, placed[j].id, apart(placed[i], placed[j])]).toEqual([
          placed[i].id,
          placed[j].id,
          true,
        ]);
      }
    }
  });

  it("枠より大きい札は、枠に収まる大きさへ落とす", () => {
    const [only] = layoutBubbles([{ id: "big", hw: 500, hh: 500 }], world, 1);
    expect(only.hw).toBeLessThanOrEqual(world.width / 2);
    expect(only.hh).toBeLessThanOrEqual(world.height / 2);
  });

  it("最初から動いている(止まった絵から始めない)", () => {
    for (const bb of layoutBubbles(items, world, 5)) {
      expect([bb.id, Math.hypot(bb.vx, bb.vy) > 0]).toEqual([bb.id, true]);
    }
  });
});

describe("bubbleSize（実測が届くまでの見積もり）", () => {
  it("長い札ほど広い箱(字が箱からはみ出さない)", () => {
    expect(bubbleSize("夜市").hw).toBeLessThan(bubbleSize("台南の朝ごはん屋").hw);
  });

  it("高さは字数に依らない(札は1行)", () => {
    expect(bubbleSize("夜市").hh).toBe(bubbleSize("台南の朝ごはん屋").hh);
  });

  it("空でも 0 にしない(見えない箱を作らない)", () => {
    expect(bubbleSize("").hw).toBeGreaterThan(0);
    expect(bubbleSize("").hh).toBeGreaterThan(0);
  });

  it("絵文字を1文字と数える(サロゲートペアで倍にしない)", () => {
    expect(bubbleSize("🌸")).toEqual(bubbleSize("春"));
  });
});
