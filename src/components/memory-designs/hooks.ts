import { localeOf, useUiLang } from "@/lib/i18n";
import { useMemdT } from "./copy";
import type { NextReview } from "./model";

/** 「今日」「あと3日」「2日過ぎ」。目安（予定が無い語）はそうと書く。 */
export function useWhenLabel(): (next: NextReview | null) => string {
  const t = useMemdT();
  return (next) => {
    if (!next) return "—";
    const base =
      next.days < 0
        ? t("lateDays", { n: -next.days })
        : next.days === 0
          ? t("today")
          : next.days === 1
            ? t("tomorrow")
            : t("inDays", { n: next.days });
    return next.estimated ? `${base} · ${t("estimated")}` : base;
  };
}

/** 今日から `d` 日後の「10/16」。表示言語の書式で、日付の境目は台湾時間。 */
export function useDateOf(nowMs: number): (d: number) => string {
  const locale = localeOf(useUiLang());
  return (d) =>
    new Date(nowMs + d * 86_400_000).toLocaleDateString(locale, {
      month: "numeric",
      day: "numeric",
      timeZone: "Asia/Taipei",
    });
}
