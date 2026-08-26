import { reconcileLanguage } from "./language-sync";
import { restoreLevel, type LevelScale } from "./level-scale";
import { targetProfile } from "./target-profile";
import { DEFAULT_TARGET_LANGUAGE } from "./target-lang";

/**
 * **設定の画面に何を出すかを、1つの関数で決める。**
 *
 * オーナー報告 2026-08-26（3度目）:
 * > 「まだ一度保存しても、ほかのページ移ってから設定のページに行くと、
 * >  学習言語を英語、表示言語を台湾華語や TOEFL のレベルを設定で指定しても、
 * >  すぐに学習言語台湾華語、表示言語日本語、今の TOEFL のレベル1、
 * >  目標はレベル2に戻る。」
 *
 * ## 同じ報告が3度来た理由
 * 1度目・2度目の直しはどちらも**画面の中に**書いた。判定が画面の中に
 * ある限り、直したかどうかを確かめる手が「絵を見る」しか無い。
 * そして戻る条件（私用の列が読めない・列がまだ無い・保存が撥ねられた）は
 * どれも**手元では再現しない**ので、絵を見ても直ったように見える。
 *
 * だから判定をここへ出す。**報告の4つの値をそのまま試験に書ける。**
 *
 * ## 規則は1つだけ
 * 「**その端末で選んだ事実が在るなら、それが勝つ**」。
 * サーバの値は持ち歩くための控え（`language-sync.ts` に同じ注）。
 * 級も言語とまったく同じ扱いにする — 級だけ裸だったのが3度目の中身。
 */

export type SettingsDevice = {
  uiLanguage: string | null;
  targetLanguage: string | null;
  /** その学習言語で憶えている級（`level-pref.ts`）。 */
  currentLevel: string | null;
  levelGoal: string | null;
};

export type SettingsServer = {
  uiLanguage: string | null | undefined;
  targetLanguage: string | null | undefined;
  currentLevel: string | null | undefined;
  levelGoal: string | null | undefined;
  /**
   * 私用の列が読めなかった行か（`getMyProfile` の `partial`）。
   * **真なら server 側は丸ごと「無い」として扱う** — 入っているのは
   * その人の設定ではなく置き場所の既定値なので、比べる相手にならない。
   */
  partial?: boolean;
};

export type SettingsRestored = {
  uiLanguage: string;
  targetLanguage: string;
  currentLevel: string;
  levelGoal: string;
  /** サーバとずれているので書き戻しが要るか。`partial` のときは常に false。 */
  pushToServer: boolean;
  /** 級の表記を決める目盛り（呼ぶ側が一覧を作るのに使う）。 */
  scale: LevelScale;
};

export function restoreSettings(input: {
  device: SettingsDevice;
  server: SettingsServer;
}): SettingsRestored {
  const partial = !!input.server.partial;
  const srv = <T>(v: T): T | null => (partial ? null : v);

  const ui = reconcileLanguage({
    stored: input.device.uiLanguage,
    server: srv(input.server.uiLanguage),
    fallback: "ja",
  });
  const target = reconcileLanguage({
    stored: input.device.targetLanguage,
    server: srv(input.server.targetLanguage),
    fallback: DEFAULT_TARGET_LANGUAGE,
  });

  // **級は学習言語が決まってから。** 表記はその言語の目盛りで変わる
  // （台湾華語 = TOCFL-2 / 英語 = A2）。
  const scale = targetProfile(target.value).levels;
  const goal = reconcileLanguage({
    stored: input.device.levelGoal,
    server: srv(input.server.levelGoal),
    fallback: scale.toStored(2),
  });
  const current = reconcileLanguage({
    stored: input.device.currentLevel,
    server: srv(input.server.currentLevel),
    fallback: scale.toStored(1),
  });

  return {
    uiLanguage: ui.value,
    targetLanguage: target.value,
    // **一覧に無い値をそのまま返さない。** 台湾華語で2級だった人の
    // `"TOCFL-2"` は CEFR の一覧に無く、渡すと選択が空に見える。
    currentLevel: restoreLevel(scale, current.value, 1),
    levelGoal: restoreLevel(scale, goal.value, 2),
    pushToServer:
      !partial &&
      (ui.pushToServer || target.pushToServer || goal.pushToServer || current.pushToServer),
    scale,
  };
}
