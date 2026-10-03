/**
 * キャッチの演出の大きさ（PRODUCT「Catch」・ROADMAP Phase 4）。
 * 普段は短く、節目だけ大きく。オフでも語は読む（`CatchLanding.tsx` の `runQuietLanding`）。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATCH_MILESTONES,
  DEFAULT_CATCH_ANIMATION,
  isCatchMilestone,
  parseCatchAnimation,
  planCatchAnimation,
  readCollection,
  registerCollectionReader,
} from "./catch-animation-pref";

describe("キャッチの演出の選択", () => {
  it("既定は「短く」", () => {
    expect(DEFAULT_CATCH_ANIMATION).toBe("short");
    expect(parseCatchAnimation(null)).toBe("short");
    expect(parseCatchAnimation("loud")).toBe("short");
    expect(parseCatchAnimation("off")).toBe("off");
    expect(parseCatchAnimation("full")).toBe("full");
  });

  it("「短く」は節目だけ大きく祝う", () => {
    expect(planCatchAnimation("short", false)).toBe("short");
    expect(planCatchAnimation("short", true)).toBe("full");
  });

  it("「しっかり」は毎回、「オフ」は節目でも出さない", () => {
    expect(planCatchAnimation("full", false)).toBe("full");
    expect(planCatchAnimation("off", true)).toBe("off");
    expect(planCatchAnimation("off", false)).toBe("off");
  });
});

describe("節目", () => {
  it("1・10・50・100 匹目は節目（前に持っていた数 + 1）", () => {
    for (const n of [1, 10, 50, 100]) {
      expect(CATCH_MILESTONES).toContain(n);
      expect(isCatchMilestone({ previousCount: n - 1 })).toBe(true);
    }
    expect(isCatchMilestone({ previousCount: 1 })).toBe(false); // 2 匹目
    expect(isCatchMilestone({ previousCount: 10 })).toBe(false); // 11 匹目
    expect(isCatchMilestone({ previousCount: 48 })).toBe(false); // 49 匹目
  });

  it("新しいカテゴリーは数にかかわらず節目", () => {
    expect(isCatchMilestone({ previousCount: 7, newCategory: true })).toBe(true);
  });

  it("再会は数が増えないので節目にしない", () => {
    expect(isCatchMilestone({ previousCount: 9, reencounter: true })).toBe(false);
  });

  it("数が分からない時は最初の1匹かもしれないので祝う", () => {
    expect(isCatchMilestone({ previousCount: null })).toBe(true);
  });
});

describe("一覧の読み口", () => {
  it("登録した読み方を返し、壊れていたら null に倒す", () => {
    registerCollectionReader(() => ({ count: 3, has: (id) => id === "a" }));
    expect(readCollection()?.count).toBe(3);
    expect(readCollection()?.has("a")).toBe(true);
    registerCollectionReader(() => {
      throw new Error("boom");
    });
    expect(readCollection()).toBeNull();
    registerCollectionReader(() => null);
  });
});

describe("演出の配線", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

  it("オフでも語を読む・短い版は BGM と紙吹雪を省く", () => {
    const landing = read("components/CatchLanding.tsx");
    expect(landing).toMatch(/if \(plan === "off"\) return runQuietLanding\(ctx\);/);
    expect(landing).toMatch(/runQuietLanding[\s\S]*ctx\.speakLine\?\.\(\)/);
    expect(landing).toMatch(/intensity: plan/);
    const v5 = read("components/effects/catch-landing/v5_reward.ts");
    expect(v5).toMatch(/if \(!short\) Score\.build\(\);/);
    expect(v5).toMatch(/const confetti = short\s*\? Promise\.resolve\(null\)/);
    // 短い版でも語は読み、読み終わるまで待つ。
    expect(v5).toMatch(/await Promise\.race\(\[spoken, wait\(2600\)\]\);/);
  });

  it("節目を数えるため、一覧のキャッシュの読み方を router が登録する", () => {
    expect(read("router.tsx")).toMatch(/registerCollectionReader\(/);
  });
});
