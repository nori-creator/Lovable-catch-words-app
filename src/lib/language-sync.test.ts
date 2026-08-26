import { describe, it, expect } from "vitest";
import { reconcileLanguage } from "./language-sync";

/**
 * オーナー報告 2026-08-26（2度目）
 * 「一度設定を保存したらその後キープして」。
 *
 * ここで守るのは1つ: **選んだ事実を、開き直しただけで失わない。**
 */

describe("reconcileLanguage", () => {
  it("**端末に選択が在れば、そちらが勝つ**", () => {
    const got = reconcileLanguage({ stored: "en", server: "zh-TW", fallback: "zh-TW" });
    expect(got.value).toBe("en");
    // 揃えるためにサーバへ書き戻す（放っておくと次も同じことが起きる）。
    expect(got.pushToServer).toBe(true);
  });

  it("同じ値なら書き戻さない（開くたびに保存しない）", () => {
    const got = reconcileLanguage({ stored: "en", server: "en", fallback: "zh-TW" });
    expect(got).toEqual({ value: "en", pushToServer: false });
  });

  it("まだ選んでいない端末は**サーバの値を受ける**", () => {
    // 別の端末で選んだ人が、新しい端末で初めて開いた場合。
    const got = reconcileLanguage({ stored: null, server: "en", fallback: "zh-TW" });
    expect(got).toEqual({ value: "en", pushToServer: false });
  });

  it("どちらも無ければ既定", () => {
    expect(reconcileLanguage({ stored: null, server: null, fallback: "zh-TW" })).toEqual({
      value: "zh-TW",
      pushToServer: false,
    });
  });

  it("サーバが読めなくても**端末の選択は消えない**", () => {
    // 私用の列が読めないとき、`getMyProfile` は既定を返す。その値で
    // 端末を塗り替えないことがこの報告の本体。
    const got = reconcileLanguage({ stored: "en", server: null, fallback: "zh-TW" });
    expect(got.value).toBe("en");
    expect(got.pushToServer).toBe(true);
  });

  it("空白だけの値は「無い」として扱う", () => {
    expect(reconcileLanguage({ stored: "   ", server: "en", fallback: "zh-TW" }).value).toBe("en");
    expect(reconcileLanguage({ stored: "en", server: "  ", fallback: "zh-TW" })).toEqual({
      value: "en",
      pushToServer: true,
    });
  });
});
