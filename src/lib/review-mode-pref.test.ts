import { describe, it, expect } from "vitest";
import { resolveReviewMode } from "./review-mode-pref";

/**
 * オーナー指示 2026-09-30「話すモードは消して、四択だけにして」。
 *
 * 端末や DB に何が保存されていても、出題は必ず4択。
 * 発話のコードは残してあり、戻すときは `resolveReviewMode` を元に戻す。
 */
describe("resolveReviewMode", () => {
  it("端末に「話す」が保存されていても4択", () => {
    expect(resolveReviewMode("speaking", "choice")).toBe("choice");
    expect(resolveReviewMode("hybrid", "choice")).toBe("choice");
  });

  it("DB に「話す」が残っていても4択", () => {
    expect(resolveReviewMode(null, "speaking")).toBe("choice");
    expect(resolveReviewMode(null, "hybrid")).toBe("choice");
  });

  it("どちらも無ければ4択", () => {
    expect(resolveReviewMode(null, null)).toBe("choice");
    expect(resolveReviewMode(null, undefined)).toBe("choice");
  });

  it("壊れた値が来ても落ちずに4択", () => {
    expect(resolveReviewMode(null, "こわれた")).toBe("choice");
    expect(resolveReviewMode(null, 42)).toBe("choice");
    expect(resolveReviewMode(null, {})).toBe("choice");
  });
});
