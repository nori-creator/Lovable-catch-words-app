import { describe, it, expect } from "vitest";
import { resolveReviewMode } from "./review-mode-pref";

/**
 * オーナー報告「復習のAIが選ぶボタンを押したらエラーが出た」の後始末。
 *
 * DB の列に `'hybrid'` を許す移行が当たっていないと保存が落ちる。
 * ここで守るのは「**保存が落ちても、この端末で選んだ形が勝つ**」の一点。
 */
describe("resolveReviewMode", () => {
  it("この端末で選んだ値が、DB の値より強い", () => {
    expect(resolveReviewMode("hybrid", "choice")).toBe("hybrid");
    expect(resolveReviewMode("choice", "hybrid")).toBe("choice");
  });

  it("一度も選んでいなければ DB の値を使う", () => {
    expect(resolveReviewMode(null, "choice")).toBe("choice");
    expect(resolveReviewMode(null, "hybrid")).toBe("hybrid");
  });

  it("どちらも無ければ既定", () => {
    expect(resolveReviewMode(null, null)).toBe("speaking");
    expect(resolveReviewMode(null, undefined)).toBe("speaking");
  });

  it("DB に知らない値が入っていても落ちない", () => {
    expect(resolveReviewMode(null, "こわれた")).toBe("speaking");
    expect(resolveReviewMode(null, 42)).toBe("speaking");
    expect(resolveReviewMode(null, {})).toBe("speaking");
  });

  it("**移行が当たっていない DB を想定**: 保存は失敗し、DB は古い値のまま", () => {
    // 画面は 'hybrid' を選んだ。DB は制約違反で 'choice' のまま。
    // それでもこの端末では 'hybrid' で出題される。
    expect(resolveReviewMode("hybrid", "choice")).toBe("hybrid");
  });
});
