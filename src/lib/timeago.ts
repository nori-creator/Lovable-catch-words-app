/**
 * 「3日前」「5分前」のような相対時刻を、表示言語に合わせて作る。
 *
 * これまで画面ごとに `${n}日前` と書き散らしていたため、英語表示にしても
 * 日本語のまま出ていた。語順も違う(日本語は「3日前」、英語は "3 days ago")
 * ので、文字列連結では直せない。翻訳キーに数を差し込む形に一本化する。
 */

import { tStatic, useT, type Vars } from "@/lib/i18n";

/** 経過秒数から、いちばん粗くて意味が通る単位を選ぶ。 */
function pick(seconds: number): { key: string; vars: Vars } {
  if (seconds < 60) return { key: "ago.seconds", vars: { n: Math.max(0, Math.floor(seconds)) } };
  if (seconds < 3600) return { key: "ago.minutes", vars: { n: Math.floor(seconds / 60) } };
  if (seconds < 86_400) return { key: "ago.hours", vars: { n: Math.floor(seconds / 3600) } };
  const days = Math.floor(seconds / 86_400);
  if (days < 30) return { key: "ago.days", vars: { n: days } };
  if (days < 365) return { key: "ago.months", vars: { n: Math.floor(days / 30) } };
  return { key: "ago.years", vars: { n: Math.floor(days / 365) } };
}

/**
 * 経過秒数を返す。無効な日付は null(表示しない)。未来日時(時計ずれ)は
 * 0 に丸めて "たった今" 相当にする — "NaN年前" や負の値を画面に出さない。
 */
function elapsedSeconds(iso: string): number | null {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, (Date.now() - ms) / 1000);
}

/** React の中で使う版。表示言語が変わったら自動で追従する。 */
export function useTimeAgo(): (iso: string) => string {
  const t = useT();
  return (iso: string) => {
    const secs = elapsedSeconds(iso);
    if (secs === null) return "";
    const { key, vars } = pick(secs);
    return t(key, vars);
  };
}

/** React の外(通知の文面など)で使う版。 */
export function timeAgoStatic(iso: string): string {
  const secs = elapsedSeconds(iso);
  if (secs === null) return "";
  const { key, vars } = pick(secs);
  return tStatic(key, vars);
}

/** 日数から直接作る(場所の思い出しのように日数しか持っていない場合)。 */
export function daysAgoLabel(days: number, t: (k: string, v?: Vars) => string): string {
  if (days >= 365) return t("ago.years", { n: Math.floor(days / 365) });
  if (days >= 30) return t("ago.months", { n: Math.floor(days / 30) });
  return t("ago.days", { n: days });
}
