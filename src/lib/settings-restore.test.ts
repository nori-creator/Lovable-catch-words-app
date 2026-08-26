import { describe, it, expect } from "vitest";
import { restoreSettings } from "./settings-restore";

/**
 * オーナー報告 2026-08-26（**3度目**）:
 * > 「まだ一度保存しても、ほかのページ移ってから設定のページに行くと、
 * >  学習言語を英語、表示言語を台湾華語や TOEFL のレベルを設定で指定しても、
 * >  すぐに学習言語台湾華語、表示言語日本語、今の TOEFL のレベル1、
 * >  目標はレベル2に戻る。このエラーを直して。」
 *
 * 報告の「戻った先の4つの値」は、設定画面の `useState` の初期値と
 * **1つ残らず同じ**だった:
 *
 *   学習言語 = DEFAULT_TARGET_LANGUAGE ("zh-TW")
 *   表示言語 = "ja"
 *   今の級   = 1
 *   目標の級 = 2
 *
 * つまり「サーバの値で塗り替えられた」のではなく、
 * **端末の写しを一度も読まないまま初期値が見えていた**。
 * 私用の列が読めない行（`partial`）で丸ごと `return` していたのが原因。
 */

const EN_DEVICE = {
  uiLanguage: "zh-TW",
  targetLanguage: "en",
  currentLevel: "B1",
  levelGoal: "B2",
};

describe("restoreSettings — 3度目の報告の実物", () => {
  it("**私用の列が読めなくても、選んだ4つが1つも戻らない**", () => {
    const got = restoreSettings({
      device: EN_DEVICE,
      // `getMyProfile` が `partial` で返す**置き場所の値**そのもの。
      server: {
        uiLanguage: "ja",
        targetLanguage: "zh-TW",
        currentLevel: null,
        levelGoal: "TOCFL-2",
        partial: true,
      },
    });
    expect(got.targetLanguage).toBe("en");
    expect(got.uiLanguage).toBe("zh-TW");
    expect(got.currentLevel).toBe("B1");
    expect(got.levelGoal).toBe("B2");
    // 読めない行へ書き戻しに行かない（権限の話なので通らない）。
    expect(got.pushToServer).toBe(false);
  });

  it("**級の列がまだ無くて保存が落とされても、級が1と2に戻らない**", () => {
    // `updateMyProfile` は知らない列をその名前だけ落として保存し直す。
    // だから `current_level` は永久に null のまま返ってくる。
    const got = restoreSettings({
      device: EN_DEVICE,
      server: {
        uiLanguage: "zh-TW",
        targetLanguage: "en",
        currentLevel: null,
        levelGoal: "B2",
        partial: false,
      },
    });
    expect(got.currentLevel).toBe("B1");
    expect(got.levelGoal).toBe("B2");
    // ずれているので揃えに行く。
    expect(got.pushToServer).toBe(true);
  });

  it("サーバの保存がまるごと届いていなくても戻らない", () => {
    const got = restoreSettings({
      device: EN_DEVICE,
      server: {
        uiLanguage: "ja",
        targetLanguage: "zh-TW",
        currentLevel: "TOCFL-1",
        levelGoal: "TOCFL-2",
        partial: false,
      },
    });
    expect(got).toMatchObject({
      targetLanguage: "en",
      uiLanguage: "zh-TW",
      currentLevel: "B1",
      levelGoal: "B2",
      pushToServer: true,
    });
  });
});

describe("restoreSettings — 端末が何も選んでいないとき", () => {
  it("サーバの値を受ける（別の端末で選んだ人が新しい端末で開く）", () => {
    const got = restoreSettings({
      device: { uiLanguage: null, targetLanguage: null, currentLevel: null, levelGoal: null },
      server: {
        uiLanguage: "zh-TW",
        targetLanguage: "en",
        currentLevel: "A2",
        levelGoal: "B1",
      },
    });
    expect(got).toMatchObject({
      targetLanguage: "en",
      uiLanguage: "zh-TW",
      currentLevel: "A2",
      levelGoal: "B1",
      pushToServer: false,
    });
  });

  it("どちらも無ければ既定（台湾華語・日本語・1級・2級）", () => {
    const got = restoreSettings({
      device: { uiLanguage: null, targetLanguage: null, currentLevel: null, levelGoal: null },
      server: { uiLanguage: null, targetLanguage: null, currentLevel: null, levelGoal: null },
    });
    expect(got).toMatchObject({
      targetLanguage: "zh-TW",
      uiLanguage: "ja",
      currentLevel: "TOCFL-1",
      levelGoal: "TOCFL-2",
      pushToServer: false,
    });
  });
});

describe("restoreSettings — 級の表記は学習言語で決まる", () => {
  it("**台湾華語の級を英語の一覧に無い形のまま返さない**", () => {
    // 台湾華語で2級だった人が英語へ切り替えた直後。段だけ引き継ぐ。
    const got = restoreSettings({
      device: {
        uiLanguage: "ja",
        targetLanguage: "en",
        currentLevel: "TOCFL-2",
        levelGoal: "TOCFL-4",
      },
      server: { uiLanguage: null, targetLanguage: null, currentLevel: null, levelGoal: null },
    });
    expect(got.currentLevel).toBe("A2");
    expect(got.levelGoal).toBe("B2");
  });

  it("英語の級を台湾華語の一覧に無い形のまま返さない（逆向き）", () => {
    const got = restoreSettings({
      device: { uiLanguage: "ja", targetLanguage: "zh-TW", currentLevel: "A2", levelGoal: "B2" },
      server: { uiLanguage: null, targetLanguage: null, currentLevel: null, levelGoal: null },
    });
    expect(got.currentLevel).toBe("TOCFL-2");
    expect(got.levelGoal).toBe("TOCFL-4");
  });
});
