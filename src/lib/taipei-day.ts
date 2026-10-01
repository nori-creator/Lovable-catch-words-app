/**
 * アプリの「今日」は台湾時間で数える（`YYYY-MM-DD`）。
 *
 * 統計・日記・単語帳・管理画面がそれぞれ同じ1行を写して持っていたので、
 * ここに寄せた（2026-10-01）。
 */
const TAIPEI_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" });

export function taipeiDay(at: Date | string = new Date()): string {
  return TAIPEI_DAY.format(typeof at === "string" ? new Date(at) : at);
}
