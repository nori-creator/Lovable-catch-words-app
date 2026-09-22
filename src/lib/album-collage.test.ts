import { describe, expect, it } from "vitest";
import {
  packCollage,
  collageRatio,
  COLLAGE_CAP_W,
  COLLAGE_COL_W,
  COLLAGE_HERO_W,
  COLLAGE_RATIO_MAX,
  COLLAGE_RATIO_MIN,
  COLLAGE_STAGGER,
  BASE_WIDTH,
  type Placement,
} from "./album-place";

const items = (n: number, ratio = 1) =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, ratio }));

/**
 * 札の幅・上端・下端（台紙の幅に対する割合）。
 *
 * **高さは「幅 × 比」。** `Placement` は幅（`scale`）しか持たないので、
 * 比を渡さないと正方形として測ってしまう。`items()` の既定は比 1 なので
 * そこでは同じ値になるが、比を変えた回で嘘になる。
 */
const wOf = (p: Placement) => p.scale * BASE_WIDTH;
const topOf = (p: Placement, ratio = 1) => p.y - (wOf(p) * ratio) / 2;
const botOf = (p: Placement, ratio = 1) => p.y + (wOf(p) * ratio) / 2;
/** 左の列か右の列か。 */
const colOf = (p: Placement) => (p.x < 0.5 ? 0 : 1);

describe("誌面の自動配置", () => {
  it("**2列に振り分ける**（1枚目を大きくしない日）", () => {
    // 2枚の日は大きい1枚を作らないので、そのまま左→右。
    const out = packCollage(items(2));
    expect(out[0].x).toBeLessThan(0.5);
    expect(out[1].x).toBeGreaterThan(0.5);
  });

  it("**必ず少し重なる**（2列の幅の合計が台紙より広い）", () => {
    // 「有機的に重なり合って1つの作品に」（オーナー指示 2026-09-22）。
    // 字のほうは外側の端へ逃がしてあるので、重ねても読めなくならない。
    expect(COLLAGE_COL_W * 2).toBeGreaterThan(1);
  });

  it("**右の列は最初から下げる**（段が揃わない）", () => {
    // 幅は `id` ごとに少し違うので、**上端**で比べる（中心だと高さの差が乗る）。
    const out = packCollage(items(2));
    const top = (i: number) => out[i].y - (out[i].scale * BASE_WIDTH) / 2;
    expect(top(0)).toBeCloseTo(0, 5);
    expect(top(1)).toBeCloseTo(COLLAGE_STAGGER, 5);
  });

  it("**同じ列では重ねない**（縦に重ねると、上の札の字が下の札に隠れる）", () => {
    // 重なりは**左右だけ**で作る。縦に重ねると、写真の下に書いた時刻と
    // 語がそのまま隠れる（実測で全部隠れた）。
    const out = packCollage(items(8));
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        if (colOf(out[i]) !== colOf(out[j])) continue;
        const overlap =
          Math.min(botOf(out[i]), botOf(out[j])) - Math.max(topOf(out[i]), topOf(out[j]));
        expect(overlap).toBeLessThanOrEqual(0);
      }
    }
  });

  it("**空いているほうの列へ積む**（片方だけが先へ伸びない）", () => {
    // 左右を1枚ずつ交互に振ると、縦長が続いた列だけが伸び、もう片方に
    // 画面まるごとの空白ができる（実測 230px）。
    const out = packCollage(items(8));
    const left = out.filter((p) => colOf(p) === 0).length;
    expect(left).toBeGreaterThanOrEqual(3);
    expect(out.length - left).toBeGreaterThanOrEqual(3);
    // 最後にできる段差も、札1枚ぶんより小さい。
    const bottomOf = (c: number) => Math.max(...out.filter((p) => colOf(p) === c).map(botOf));
    expect(Math.abs(bottomOf(0) - bottomOf(1))).toBeLessThan(COLLAGE_COL_W * COLLAGE_RATIO_MAX);
  });

  it("**字の幅は、重なりの外側に収まる**（これが「重なっても読める」の根拠）", () => {
    // 右の列の札の左端は `1 - COLLAGE_COL_W`。左の字がそこへ届かなければ、
    // どれだけ重ねても字は隠れない。広げるときは必ず両方を見ること。
    expect(COLLAGE_CAP_W).toBeLessThanOrEqual(1 - COLLAGE_COL_W);
    // 1枚目（大きい札）も同じ約束の中に居る。触られて最前面に来ても、
    // 反対の列の字に届かない。
    expect(COLLAGE_HERO_W).toBeLessThanOrEqual(1 - COLLAGE_CAP_W);
  });

  it("縦長の写真でも、その高さぶんだけ下がる（升目の決め打ちに引きずられない）", () => {
    const tall = packCollage([
      { id: "a", ratio: 1.6 },
      { id: "b", ratio: 1 },
      { id: "c", ratio: 1 },
    ]);
    const flat = packCollage([
      { id: "a", ratio: 0.6 },
      { id: "b", ratio: 1 },
      { id: "c", ratio: 1 },
    ]);
    expect(tall[2].y).toBeGreaterThan(flat[2].y);
  });

  it("**何度描いても同じ**（乱数を使わない）", () => {
    expect(packCollage(items(5))).toEqual(packCollage(items(5)));
  });

  it("**連番の id でも傾きが揃わない**", () => {
    // `s0` `s1` `s2` … のような id で素朴に混ぜると、出てくる値がほぼ連番に
    // なり、傾きが全部同じ向きに並ぶ（実測 0.006° 刻み）。
    const rots = packCollage(items(8)).map((p) => p.rot);
    const gaps = rots.slice(1).map((r, i) => Math.abs(r - rots[i]));
    // 隣どうしが少なくとも1つは大きく離れていること。
    expect(Math.max(...gaps)).toBeGreaterThan(1);
    // 左右どちらにも傾く。
    expect(rots.some((r) => r > 0.3)).toBe(true);
    expect(rots.some((r) => r < -0.3)).toBe(true);
  });

  it("台紙の外へ中心を出さない", () => {
    for (const p of packCollage(items(8))) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThan(0);
    }
  });

  it("比が壊れていても落ちない（0・負・NaN は 1 とみなす）", () => {
    const out = packCollage([
      { id: "a", ratio: 0 },
      { id: "b", ratio: -1 },
      { id: "c", ratio: Number.NaN },
    ]);
    for (const p of out) expect(Number.isFinite(p.y)).toBe(true);
  });
});

describe("写真の下に付く字のぶん", () => {
  it("**字のぶんだけ次の札を下げる**（字の上に写真が乗らない）", () => {
    const base = items(6);
    // 一言が付くのは「s1」。同じ列に続く札が、その字を越えて始まること。
    const out = packCollage(base.map((x) => (x.id === "s1" ? { ...x, extra: 0.15 } : x)));
    const next = out.findIndex((p, k) => k > 1 && colOf(p) === colOf(out[1]));
    expect(next).toBeGreaterThan(1);
    expect(topOf(out[next]) - botOf(out[1])).toBeGreaterThanOrEqual(0.15);
    // 一言が無ければ、そこまで空けない。
    const plain = packCollage(base);
    const plainNext = plain.findIndex((p, k) => k > 1 && colOf(p) === colOf(plain[1]));
    expect(topOf(plain[plainNext]) - botOf(plain[1])).toBeLessThan(0.15);
  });
});

describe("その日の1枚目", () => {
  it("**3枚以上の日は、1枚目だけ大きく置く**", () => {
    const out = packCollage(items(4));
    expect(wOf(out[0])).toBeCloseTo(COLLAGE_HERO_W, 5);
    expect(colOf(out[0])).toBe(0);
  });

  it("**2枚目は1枚目の下ではなく、横に並ぶ**（最初の画面に入る枚数が増える）", () => {
    // 幅 0.8 だと1枚目だけで高さ 344px（画面の4割）を占め、表紙と合わせて
    // 最初の画面に写真が1枚半しか入らなかった（オーナー指示 2026-09-22）。
    const out = packCollage(items(4));
    expect(colOf(out[1])).toBe(1);
    expect(topOf(out[1])).toBeLessThan(botOf(out[0]));
    // 横に並ぶので、**左右で必ず重なる**。
    expect(COLLAGE_HERO_W + wOf(out[1])).toBeGreaterThan(1);
  });

  it("**2枚の日は大きくしない**（残り1枚が取り残される）", () => {
    const out = packCollage(items(2));
    expect(out[0].scale * BASE_WIDTH).toBeLessThan(COLLAGE_HERO_W);
  });

  it("1枚目の下も、空いているほうへ積む", () => {
    const out = packCollage(items(6));
    expect(out.filter((p) => colOf(p) === 0).length).toBeGreaterThanOrEqual(2);
    expect(out.filter((p) => colOf(p) === 1).length).toBeGreaterThanOrEqual(2);
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

  it("**積む計算では丸めない**（字だけの札は写真より低いのが正しい）", () => {
    // 低い比をそのまま渡したら、そのぶんだけ低く積まれること。
    const out = packCollage([
      { id: "a", ratio: 0.2 },
      { id: "b", ratio: 0.2 },
    ]);
    expect(botOf(out[0], 0.2) - topOf(out[0], 0.2)).toBeCloseTo(wOf(out[0]) * 0.2, 5);
    // 積んだ位置も低い比のまま（丸めていれば 0.66 で積まれて下がる）。
    expect(out[0].y).toBeCloseTo((wOf(out[0]) * 0.2) / 2, 5);
  });
});
