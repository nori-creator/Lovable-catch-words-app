import { describe, it, expect } from "vitest";
import { countsAsRemembered, scoreForSpeaking, speakingResult } from "./speaking-grade";
import { LAPSE_SCORE, nextSrs } from "./srs";

/**
 * オーナー指示 2026-08-27 ⑦:
 * > 「言い直して合ってるのは覚えてない、忘れたとしてカウントし直して。」
 *
 * 守るのは1点 — **言い直して当てた語が、1回で言えた語と同じ点にならない**。
 */

describe("speakingResult", () => {
  it("1回で言えたら正解", () => {
    expect(speakingResult({ kind: "success", objectiveOk: true, failedAttempts: 0 })).toBe(
      "success",
    );
  });

  it("**言い直して言えたのは失念**(報告された不具合)", () => {
    expect(speakingResult({ kind: "success", objectiveOk: true, failedAttempts: 1 })).toBe("hint");
    expect(speakingResult({ kind: "success", objectiveOk: true, failedAttempts: 5 })).toBe("hint");
  });

  it("言えていないものは、何回試しても飛ばしと同じ", () => {
    expect(speakingResult({ kind: "success", objectiveOk: false, failedAttempts: 0 })).toBe("skip");
    expect(speakingResult({ kind: "success", objectiveOk: false, failedAttempts: 3 })).toBe("skip");
  });

  it("**「飛ばす」が最優先**(本人が言えなかったと言っている)", () => {
    expect(speakingResult({ kind: "skip", objectiveOk: true, failedAttempts: 0 })).toBe("skip");
  });
});

describe("SRS への効き方", () => {
  const state = { ease: 2.5, interval_days: 10, repetitions: 4 };

  it("1回で言えた語だけが間隔を伸ばす", () => {
    const next = nextSrs(state, scoreForSpeaking("success"));
    expect(next.interval_days).toBeGreaterThan(state.interval_days);
    expect(next.repetitions).toBe(5);
  });

  it("**言い直しは連続を捨てて明日また出す**", () => {
    const next = nextSrs(state, scoreForSpeaking("hint"));
    expect(next.interval_days).toBe(1);
    expect(next.repetitions).toBe(0);
  });

  it("言い直しと飛ばしは、どちらも失念の側", () => {
    for (const r of ["hint", "skip"] as const) {
      expect([r, scoreForSpeaking(r) < LAPSE_SCORE]).toEqual([r, true]);
      expect([r, countsAsRemembered(r)]).toEqual([r, false]);
    }
    expect(countsAsRemembered("success")).toBe(true);
  });

  it("言い直しは飛ばしより ease に優しい(言えたこと自体は事実)", () => {
    expect(scoreForSpeaking("hint")).toBeGreaterThan(scoreForSpeaking("skip"));
  });
});

describe("点の表が `gradeReview` と揃っている", () => {
  it("success=5 / hint=2 / skip=1", () => {
    expect([
      scoreForSpeaking("success"),
      scoreForSpeaking("hint"),
      scoreForSpeaking("skip"),
    ]).toEqual([5, 2, 1]);
  });
});
