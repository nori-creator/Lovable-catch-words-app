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
  applyDelta,
  BASE_WIDTH,
  boardHeight,
  cellsHeight,
  cellsWidth,
  clamp,
  gestureDelta,
  MAX_SCALE,
  MIN_SCALE,
  normalizeDeg,
  packAuto,
  placeFromCell,
  placementFrom,
  ratioOf,
  ROT_SNAP_DEG,
  scaleOf,
  settle,
  sizePx,
  type AlbumSize,
  type Placement,
} from "./album-place";

const W = 400;
const MAXY = 2;
const MID: Placement = { x: 0.5, y: 0.5, scale: 1, rot: 0 };
const SIZE_CELLS_X = (s: AlbumSize) => ({ small: 1, portrait: 1, landscape: 2, large: 2 })[s];
const SIZE_CELLS_Y = (s: AlbumSize) => ({ small: 1, portrait: 2, landscape: 1, large: 2 })[s];
const one = (x: number, y: number) => ({ a: { x, y } });
const two = (ax: number, ay: number, bx: number, by: number) => ({
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
});

describe("指1本 — 動かすだけ", () => {
  it("指に 1:1 で付いてくる（割合に直すので、箱の大きさで割る）", () => {
    const d = gestureDelta(one(100, 100), one(140, 180));
    expect(d).toEqual({ dx: 40, dy: 80, scale: 1, rot: 0 });
    const p = applyDelta(MID, d, W, MAXY);
    expect(p.x).toBeCloseTo(0.5 + 40 / W, 6);
    // **縦も幅で測る**（台紙が縦に伸びても置いた物が動かないように）。
    expect(p.y).toBeCloseTo(0.5 + 80 / W, 6);
  });

  it("1本では大きさも傾きも変えない（別々の操作にしない、の裏返し）", () => {
    const p = applyDelta(MID, gestureDelta(one(0, 0), one(300, 300)), W, MAXY);
    expect([p.scale, p.rot]).toEqual([1, 0]);
  });
});

describe("指2本 — 動かす・広げる・回すが同時に起きる", () => {
  it("**つまんで広げると大きくなる**（距離の比がそのまま倍率）", () => {
    // 100px 離れていた2点を 200px に広げる。
    const d = gestureDelta(two(150, 200, 250, 200), two(100, 200, 300, 200));
    expect(d.scale).toBeCloseTo(2, 6);
    expect(applyDelta(MID, d, W, MAXY).scale).toBeCloseTo(2, 6);
  });

  it("**2本の指を回すと傾く**", () => {
    // 横並びの2点を、縦並びに回す = 90度。
    const d = gestureDelta(two(100, 200, 300, 200), two(200, 100, 200, 300));
    expect(d.rot).toBeCloseTo(90, 6);
    expect(applyDelta(MID, d, W, MAXY).rot).toBeCloseTo(90, 6);
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
    const moved = applyDelta(MID, gestureDelta(start, two(100, 260, 320, 140)), W, MAXY);
    const back = applyDelta(MID, gestureDelta(start, start), W, MAXY);
    expect(moved).not.toEqual(back);
    expect(back).toEqual(MID);
  });
});

describe("画面の外へ消えない・小さすぎない・大きすぎない", () => {
  it("**中心は必ず台紙の中**（出しきると二度と掴めない札ができる）", () => {
    const far = applyDelta(MID, { dx: 99999, dy: 99999, scale: 1, rot: 0 }, W, MAXY);
    expect([far.x, far.y]).toEqual([1, MAXY]);
    const back = applyDelta(MID, { dx: -99999, dy: -99999, scale: 1, rot: 0 }, W, MAXY);
    expect([back.x, back.y]).toEqual([0, 0]);
  });

  it("大きさに下限と上限がある", () => {
    expect(applyDelta(MID, { dx: 0, dy: 0, scale: 100, rot: 0 }, W, MAXY).scale).toBe(MAX_SCALE);
    expect(applyDelta(MID, { dx: 0, dy: 0, scale: 0.001, rot: 0 }, W, MAXY).scale).toBe(MIN_SCALE);
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
    const p = applyDelta(MID, { dx: 0, dy: 0, scale: 1, rot: 1 }, W, MAXY);
    expect(p.rot).toBeCloseTo(1, 6);
  });
});

describe("**昔の升目とまったく同じ寸法**（オーナー指示 2026-09-15）", () => {
  /**
   * 自由配置にしたとき、基準の幅を目分量で 0.26 に置いたせいで札が一回り
   * 小さくなった。ここは昔の `grid-cols-3 gap-x-4 auto-rows-[7rem] gap-y-8`
   * の実寸を割合に直したもの。
   */
  it("1升の幅が、昔の升目と同じ（幅316pxで 94.7px）", () => {
    expect(BASE_WIDTH * 316).toBeCloseTo((316 - 16 * 2) / 3, 6);
  });

  it("1段の高さが、昔の `auto-rows-[7rem]` と同じ（112px）", () => {
    expect(cellsHeight(1) * 316).toBeCloseTo(112, 6);
  });

  it("2升ぶんの幅には**隙間も入る**（隙間を忘れると1枚ぶん細くなる）", () => {
    expect(cellsWidth(2) * 316).toBeCloseTo(94.666 * 2 + 16, 2);
    expect(cellsHeight(2) * 316).toBeCloseTo(112 * 2 + 32, 2);
  });

  it("4通りの縦横の比と倍率が、昔の升目のまま", () => {
    expect(scaleOf("small")).toBeCloseTo(1, 6);
    expect(scaleOf("portrait")).toBeCloseTo(1, 6);
    expect(scaleOf("landscape")).toBeCloseTo(cellsWidth(2) / BASE_WIDTH, 6);
    expect(scaleOf("large")).toBeCloseTo(cellsWidth(2) / BASE_WIDTH, 6);
    // 縦長は縦に長く、横長は横に長い。
    expect(ratioOf("portrait")).toBeGreaterThan(2);
    expect(ratioOf("landscape")).toBeLessThan(0.6);
  });

  it("**指で広げても縦横の比は変わらない**（横長の写真が縦長にならない）", () => {
    const r = ratioOf("landscape");
    const a = sizePx({ x: 0, y: 0, scale: 1, rot: 0 }, 400, r);
    const b = sizePx({ x: 0, y: 0, scale: 2, rot: 0 }, 400, r);
    expect(b.w / b.h).toBeCloseTo(a.w / a.h, 6);
    expect(b.w).toBeCloseTo(a.w * 2, 6);
  });
});

describe("昔の升目の**並び**をそのままなぞる", () => {
  /**
   * 大きさだけ戻しても、並びが違えば「今までと同じ」にはならない。
   * CSS グリッドの流し込み（密詰めなし）と同じで、carriage は後戻りしない。
   */
  const AUTO: AlbumSize[] = ["large", "portrait", "small", "landscape", "portrait", "small"];

  it("2×2 の次に 1×2 は**右隣**に入る（3列なので残り1列）", () => {
    const cells = packAuto(AUTO.slice(0, 2));
    expect(cells[0]).toEqual({ col: 0, row: 0 });
    expect(cells[1]).toEqual({ col: 2, row: 0 });
  });

  it("**埋まっている升目には置かない**（重なって出ない）", () => {
    const cells = packAuto(AUTO);
    const taken = new Set<string>();
    AUTO.forEach((size, i) => {
      const [cx, cy] = [SIZE_CELLS_X(size), SIZE_CELLS_Y(size)];
      for (let r = cells[i].row; r < cells[i].row + cy; r++)
        for (let c = cells[i].col; c < cells[i].col + cx; c++) {
          expect([i, `${r},${c}`, taken.has(`${r},${c}`)]).toEqual([i, `${r},${c}`, false]);
          taken.add(`${r},${c}`);
        }
    });
  });

  it("3列からはみ出さない", () => {
    for (const cell of packAuto(AUTO)) expect(cell.col).toBeLessThan(3);
  });

  it("**何度描いても同じ場所**（乱数だと描き直すたびに動く）", () => {
    expect(placeFromCell({ col: 1, row: 2 }, "small", "abc")).toEqual(
      placeFromCell({ col: 1, row: 2 }, "small", "abc"),
    );
  });

  it("札ごとに少しだけ傾く（まっすぐ揃いすぎないのが紙らしさ）", () => {
    const rots = ["a", "b", "c", "d", "e"].map(
      (id) => placeFromCell({ col: 0, row: 0 }, "small", id).rot,
    );
    expect(new Set(rots).size).toBeGreaterThan(1);
    for (const r of rots) expect(Math.abs(r)).toBeLessThanOrEqual(3.5);
  });
});

describe("台紙の高さは中身から決まる", () => {
  it("札が増えれば紙も伸びる（下がはみ出さない）", () => {
    const one = boardHeight([{ place: { x: 0, y: 0.2, scale: 1, rot: 0 }, ratio: 1.2 }]);
    const far = boardHeight([{ place: { x: 0, y: 3, scale: 1, rot: 0 }, ratio: 1.2 }]);
    expect(far).toBeGreaterThan(one);
    // 一番下の札の下端より下に、紙の縁がある。
    expect(far).toBeGreaterThan(3 + (BASE_WIDTH * 1.2) / 2);
  });

  it("札が少ない日でも、紙らしい面積が残る", () => {
    expect(boardHeight([])).toBeGreaterThanOrEqual(1.25);
  });
});

describe("保存された値の読み方", () => {
  const AUTO = placeFromCell({ col: 1, row: 1 }, "small", "id");

  it("そろっていればそのまま使う", () => {
    const p = placementFrom({ x: 0.3, y: 0.7, scale: 1.5, rot: 12 }, AUTO);
    expect(p).toEqual({ x: 0.3, y: 0.7, scale: 1.5, rot: 12 });
  });

  it("**欠けている値だけ自動の置き方に倒す**（列がまだ無い環境でも壊れない）", () => {
    const p = placementFrom({ x: 0.3, y: null, scale: undefined, rot: null }, AUTO);
    expect(p.x).toBe(0.3);
    expect(p.y).toBeCloseTo(AUTO.y, 6);
    expect(p.scale).toBe(AUTO.scale);
    expect(p.rot).toBeCloseTo(AUTO.rot, 6);
  });

  it("壊れた値は範囲に収める（`NaN` や桁外れが入っていても画面は壊れない）", () => {
    const p = placementFrom({ x: 99, y: -5, scale: 1e9, rot: 3600 + 10 }, AUTO);
    expect([p.x, p.y, p.scale]).toEqual([1, 0, MAX_SCALE]);
    expect(p.rot).toBeCloseTo(10, 6);
    const n = placementFrom({ x: NaN, y: NaN, scale: NaN, rot: NaN }, AUTO);
    expect(Number.isFinite(n.x) && Number.isFinite(n.scale)).toBe(true);
  });
});
