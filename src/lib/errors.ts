/**
 * サーバーから来たエラーを、**画面の言語で**出す。
 *
 * ## なぜ要るか
 * 生のメッセージをそのまま出すと `fetch failed` や `PGRST116` が画面に
 * 並ぶ。読み手には何も分からないし、対処もできない。
 *
 * かといって全部まとめて「失敗しました」に潰すのも間違いだった。
 * こちらが自分で投げている「1日の利用上限(300回)に達しました」は、
 * **理由も対処も分かる**メッセージで、これを潰すとユーザーは
 * 二度と直らないものを押し続けることになる(独立監査の指摘)。
 *
 * ## 言語を混ぜない（オーナー指示 2026-09-23 の3回目）
 * サーバーのメッセージは日本語で書いてある。英語・台湾華語で使っている人に
 * そのまま出すと、画面に日本語が混ざる。
 *  ・日本語で使っている人 … こちらが書いた日本語の文はそのまま出す
 *  ・それ以外 … 知っている文（上限・権限・見つからない・もう一度）は
 *    その言語の文に置き換え、知らない文は `fallback`（その言語の汎用の文）
 */
import { useCallback } from "react";
import { useT, useUiLang, type UiLang } from "./i18n";

/** サーバーの日本語の文 → 辞書の鍵。上から順に見る。 */
const KNOWN: Array<[RegExp, string]> = [
  [/利用上限/, "err.dailyCap"],
  [/Pro 限定/, "err.proOnly"],
  [/権限がありません|編集できません|削除できません|管理者のみ/, "err.forbidden"],
  [/見つかりません/, "err.notFound"],
  [/もう一度|形が整いませんでした|返りませんでした|生成できませんでした/, "err.tryAgain"],
];

export function readableError(
  e: unknown,
  fallback: string,
  lang: UiLang = "ja",
  t?: (key: string) => string,
): string {
  const msg = e instanceof Error ? e.message : "";
  if (!msg) return fallback;
  // ひらがな・カタカナ・漢字のいずれかを含む = 人に向けて書かれた文。
  const human = /[぀-ヿ一-龯]/.test(msg);
  if (!human) return fallback;
  if (lang === "ja") return msg;
  if (t) {
    for (const [re, key] of KNOWN) if (re.test(msg)) return t(key);
  }
  return fallback;
}

/** 画面の中で使う形（言語と辞書を自分で持つ）。 */
export function useReadableError(): (e: unknown, fallback: string) => string {
  const t = useT();
  const lang = useUiLang();
  return useCallback((e, fallback) => readableError(e, fallback, lang, t), [lang, t]);
}
