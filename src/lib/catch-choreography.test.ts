import { describe, it, expect } from "vitest";
import {
  ANTICIPATE_MS,
  ANTICIPATE_SQUASH,
  BREATH,
  HOLD_MS,
  SPEAK_AT_SCALE_RATIO,
  SPRING,
  TRAIL_SAMPLES,
  apexY,
  bloomScale,
  bloomY,
  exitImpulse,
  motionStretch,
  neighborRipple,
  rewardScale,
  shouldSpeak,
  tiltDeg,
  trailSpacing,
  trailStyle,
} from "./catch-choreography";
import { APPLE_SPRING } from "./spring";

/**
 * キャッチの報酬演出の数（オーナー指示 2026-09-13）。
 *
 * ここで守るのは、**画面を見ても気づけないこと**ばかり。
 * 「軌跡が出ない」「音がずれる」は、動いている物を目で追っても
 * 原因が分からない。数の側で止める。
 */

describe("時間（オーナーが秒で指定した所）", () => {
  it("**静止はちょうど1秒**（「1秒間だけ」の指定そのまま）", () => {
    expect(HOLD_MS).toBe(1000);
  });

  it("沈み込みは押した反応として速い（80〜150ms の間）", () => {
    // 150ms を超えると「押したのに遅い」、80ms 未満だと沈みが見えない。
    expect(ANTICIPATE_MS).toBeGreaterThan(80);
    expect(ANTICIPATE_MS).toBeLessThan(150);
  });

  it("静止中の呼吸は、揺れとして知覚されない範囲", () => {
    expect(BREATH.amplitude).toBeLessThanOrEqual(0.01); // 全画面で 2〜4px
    // 0.2Hz 帯(周期5秒)は前庭系に触るので避ける。
    expect(BREATH.periodMs).toBeLessThan(4000);
  });
});

describe("ばね — ここが「軌跡」の正体", () => {
  it("**縦は横より速く動く**（同じにすると弧が消えて直線になる）", () => {
    // これが崩れた瞬間に、オーナーの指摘「軌跡がまったくない」が再発する。
    expect(SPRING.launchY.response).toBeLessThan(SPRING.launchX.response);
  });

  it("跳ねるのは勢いを引き継ぐ幕だけ（apple-design §17）", () => {
    for (const key of ["launchY", "launchScale", "bloomScale", "wordRise"] as const) {
      expect([key, SPRING[key].damping < 1]).toEqual([key, true]);
    }
  });

  it("**退場は跳ねない**（行き先が画面外なので跳ねても見えず、収束だけ遅れる）", () => {
    expect(SPRING.exit.damping).toBe(1);
  });

  it("どのばねも現実的な範囲（響きすぎ・鈍すぎを止める）", () => {
    for (const [key, s] of Object.entries(SPRING)) {
      expect([key, s.damping >= 0.65 && s.damping <= 1]).toEqual([key, true]);
      expect([key, s.response > 0.1 && s.response <= 0.6]).toEqual([key, true]);
    }
  });
});

describe("潰れと伸び（生き生きして見えるかどうかの分かれ目）", () => {
  it("**体積が保たれる**（片方だけ伸ばすと風船になって重さが消える）", () => {
    for (const v of [0, 500, 1500, 4000]) {
      const { sx, sy } = motionStretch(0, v);
      expect(sx * sy).toBeCloseTo(1, 5);
    }
  });

  it("止まっていれば伸びない", () => {
    expect(motionStretch(0, 0)).toEqual({ sx: 1, sy: 1 });
  });

  it("速いほど伸びる", () => {
    expect(motionStretch(0, 1500).sy).toBeGreaterThan(motionStretch(0, 400).sy);
  });

  it("**上限がある**（無いと退場の速度で棒になる）", () => {
    const fast = motionStretch(0, 99999);
    expect(fast.sy).toBeLessThanOrEqual(1.18 + 1e-9);
  });

  it("沈み込みは縦に潰れる（1未満）", () => {
    expect(ANTICIPATE_SQUASH).toBeLessThan(1);
    expect(ANTICIPATE_SQUASH).toBeGreaterThan(0.9); // 潰しすぎない
  });
});

describe("傾き", () => {
  it("横に動いた向きへ傾く", () => {
    expect(tiltDeg(600)).toBeGreaterThan(0);
    expect(tiltDeg(-600)).toBeLessThan(0);
    expect(tiltDeg(0)).toBe(0);
  });

  it("**漫画にならない範囲で頭打ちになる**", () => {
    expect(Math.abs(tiltDeg(100000))).toBeLessThanOrEqual(3.2);
  });
});

describe("音と単語を出す瞬間", () => {
  /**
   * 前の版は「420ms 待ってから鳴らす」だった。ばねの到達時間は
   * 画面の大きさと引き継いだ速度で変わるので、時間で計ると回ごとにずれる。
   */
  it("**広がりきる前に鳴る**（1.0 を待つと明らかに遅れて聞こえる）", () => {
    expect(SPEAK_AT_SCALE_RATIO).toBeLessThan(1);
    expect(SPEAK_AT_SCALE_RATIO).toBeGreaterThanOrEqual(0.85);
  });

  it("開き始めでは鳴らない", () => {
    expect(shouldSpeak(1, 10)).toBe(false);
    expect(shouldSpeak(5, 10)).toBe(false);
  });

  it("ほぼ開いたら鳴る", () => {
    expect(shouldSpeak(9, 10)).toBe(true);
    expect(shouldSpeak(10, 10)).toBe(true);
    expect(shouldSpeak(11, 10)).toBe(true); // 行き過ぎた後も鳴る
  });
});

describe("画面いっぱいの拡大と位置", () => {
  it("**横幅を超える**（ぴったりだと左右に隙が見える回がある）", () => {
    const s = bloomScale(384, 390);
    expect(384 * s).toBeGreaterThan(390);
  });

  it("幅が 0 でも落ちない", () => {
    expect(Number.isFinite(bloomScale(0, 390))).toBe(true);
  });

  it("頂点も展開も画面の上寄り（下に単語が出る場所を残す）", () => {
    expect(apexY(800)).toBeLessThan(400);
    expect(bloomY(800)).toBeLessThanOrEqual(400);
  });
});

describe("残像（ブラウザに本物のモーションブラーが無いことの代わり）", () => {
  it("速いほど間隔が広がる（等間隔だと遅いとき団子になる）", () => {
    expect(trailSpacing(3000)).toBeGreaterThan(trailSpacing(300));
  });

  it("間隔は 1 フレーム以上、開きすぎない", () => {
    for (const v of [0, 100, 5000, 100000]) {
      const s = trailSpacing(v);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(4);
    }
  });

  it("古い残像ほど薄く、ぼける", () => {
    const a = trailStyle(0);
    const b = trailStyle(TRAIL_SAMPLES - 1);
    expect(b.opacity).toBeLessThan(a.opacity);
    expect(b.blurPx).toBeGreaterThan(a.blurPx);
    expect(a.opacity).toBeLessThan(0.4); // 濃いと「残像」そのものが見えてくる
  });
});

describe("退場の初速", () => {
  it("**上向き（負）に、しっかり速い**", () => {
    // 0 のままだと「ゆっくり動き出して加速」になり、投げられた感じが出ない。
    expect(exitImpulse(800)).toBeLessThan(-800);
  });
});

describe("隣のセルの揺れ（世界が反応することで物理法則に見える）", () => {
  it("隣は揺れる", () => {
    expect(neighborRipple(1, 0).liftPx).toBeGreaterThan(0);
  });

  it("落ちたセル自身は対象外（そこは着弾の動きが担う）", () => {
    expect(neighborRipple(0, 0)).toEqual({ liftPx: 0, delayMs: 0 });
  });

  it("遠いほど弱く、遅れて届く（衝撃が伝わる）", () => {
    const near = neighborRipple(1, 0);
    const far = neighborRipple(2, 1);
    expect(far.liftPx).toBeLessThan(near.liftPx);
    expect(far.delayMs).toBeGreaterThan(near.delayMs);
  });

  it("**遠すぎる所は揺らさない**（画面全体が揺れると酔う）", () => {
    expect(neighborRipple(4, 4).liftPx).toBe(0);
  });

  it("揺れは小さい（棚が崩れて見えない量）", () => {
    expect(neighborRipple(1, 0).liftPx).toBeLessThan(6);
  });
});

describe("レア度で報酬の大きさを変える（確率は動かさない）", () => {
  it("珍しいほど大きい", () => {
    expect(rewardScale(6)).toBeGreaterThan(rewardScale(1));
  });

  it("**別の演出には見えない幅に留める**", () => {
    expect(rewardScale(6)).toBeLessThanOrEqual(1.3);
    expect(rewardScale(1)).toBe(1);
  });

  it("段が無い・壊れていても既定に落ちる", () => {
    for (const v of [null, undefined, NaN, 0, -3, 99]) {
      const r = rewardScale(v as number);
      expect([v, r >= 1 && r <= 1.3]).toEqual([v, true]);
    }
  });
});

/**
 * Apple の実数値との対応（2026-09-14 に公式値を取り寄せて突き合わせた）。
 *
 * Apple のばねは `duration`(秒) と `bounce` の2値で、
 *   dampingRatio = 1 − bounce      (bounce ≥ 0)
 *   減衰係数     = (1 − bounce) × 4π ÷ duration
 * （WWDC23「Animate with springs」/ SwiftUI `Spring(duration:bounce:)`）。
 *
 * `lib/spring.ts` は `omega = 2π/response` から `c = 4π × damping ÷ response`
 * を作っているので、**`damping` を dampingRatio、`response` を duration と
 * 読めば同じ式**。だから換算せずに値を比べられる。
 *
 * ここで止めたいのは「いつの間にか Apple から離れていく」こと。
 * 離れること自体は構わない（この演出は Apple のUIではなく、この app の見せ場）。
 * ただし**離れたなら、離れたと分かる形で離れる**べきなので、範囲で囲っておく。
 */
describe("Apple のばねとの対応", () => {
  it("Apple のプリセットが公式の値どおりに置かれている", () => {
    // duration 0.5 は3つ共通。bounce 0 / 0.15 / 0.3 → damping 1 − bounce。
    expect(APPLE_SPRING.smooth).toEqual({ response: 0.5, damping: 1.0 });
    expect(APPLE_SPRING.snappy).toEqual({ response: 0.5, damping: 0.85 });
    expect(APPLE_SPRING.bouncy).toEqual({ response: 0.5, damping: 0.7 });
  });

  it("**跳ねは Apple の `.bouncy` より強くしない**（0.7 が下限）", () => {
    // damping が小さいほど跳ねる。0.7 は Apple がいちばん跳ねる版に置いた値で、
    // これより下は「Apple のアプリでは見ない跳ね方」になる。
    for (const [name, s] of Object.entries(SPRING)) {
      expect([name, s.damping >= APPLE_SPRING.bouncy.damping]).toEqual([name, true]);
      expect([name, s.damping <= 1]).toEqual([name, true]);
    }
  });

  it("**演出の各段は Apple の既定より速い**（見せ場なので待たせない）", () => {
    // response が小さいほど機敏。0.5 は Apple の3プリセット共通の duration。
    // ここが 0.5 を超え始めたら、演出が「もたつく」側へ寄った合図。
    for (const [name, s] of Object.entries(SPRING)) {
      expect([name, s.response <= APPLE_SPRING.smooth.response]).toEqual([name, true]);
      expect([name, s.response > 0]).toEqual([name, true]);
    }
  });

  it("退場だけは跳ねない（行き先が画面外なので跳ねても見えない）", () => {
    expect(SPRING.exit.damping).toBe(1);
  });
});
