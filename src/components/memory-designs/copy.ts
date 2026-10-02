/**
 * デザイン案（A〜D）の文言。**本番の辞書（`lib/i18n.tsx` の `DICT`）にはまだ入れない。**
 *
 * 案は見比べのための物で、オーナーが選ぶまで本番の画面には出ない。選ばれなかった案の
 * 文言を `DICT` に入れると、使われない項目が辞書に残る（数の検査
 * 「表示文言の登録数を把握する」も動く）。選んだ案を本番へつなぐ時に、その案の
 * 鍵だけを `DICT` へ移す — 3言語ぶん既に書いてあるので、写すだけで済む。
 */
import { useCallback } from "react";
import { useUiLang, type UiLang } from "@/lib/i18n";

const COPY = {
  today: {
    ja: "今日",
    en: "Today",
    "zh-TW": "今天",
  },
  tomorrow: {
    ja: "明日",
    en: "Tomorrow",
    "zh-TW": "明天",
  },
  // 「1週間以内」だと明日も含むように読める（明日は別の箱）。日数で言い切る。
  week: {
    ja: "2〜7日後",
    en: "In 2–7 days",
    "zh-TW": "2～7 天後",
  },
  later: {
    ja: "それ以降",
    en: "Later",
    "zh-TW": "之後",
  },
  words: {
    ja: "{n}語",
    en: "{n} words",
    "zh-TW": "{n} 個字",
  },
  inDays: {
    ja: "あと{n}日",
    en: "in {n}d",
    "zh-TW": "{n} 天後",
  },
  lateDays: {
    ja: "{n}日過ぎ",
    en: "{n}d late",
    "zh-TW": "晚了 {n} 天",
  },
  estimated: {
    ja: "目安",
    en: "est.",
    "zh-TW": "預估",
  },
  more: {
    ja: "ほか{n}語",
    en: "+{n} more",
    "zh-TW": "還有 {n} 個",
  },
  tapWord: {
    ja: "語を押すと、その語の忘却曲線が開きます",
    en: "Tap a word to open its forgetting curve",
    "zh-TW": "點一個字，可以打開它的遺忘曲線",
  },
  forecastIfNot: {
    ja: "点線は、これから復習しなかった場合の予測です",
    en: "Dashed: forecast if you don't review from now on",
    "zh-TW": "虛線是之後都不複習時的預測",
  },
  // A 予定で見る
  aTitle: {
    ja: "これからの復習",
    en: "Coming up",
    "zh-TW": "接下來的複習",
  },
  aChartCaption: {
    ja: "その日に復習どきが来る語の数（過ぎた語は今日に入ります）",
    en: "Words that come due each day (overdue ones count as today)",
    "zh-TW": "每天到複習時機的字數（過期的算在今天）",
  },
  aBarAria: {
    ja: "{day}: {n}語",
    en: "{day}: {n} words",
    "zh-TW": "{day}：{n} 個字",
  },
  daysLater: {
    ja: "{n}日後",
    en: "+{n}d",
    "zh-TW": "{n} 天後",
  },
  // B ひとつの数字
  bLabel: {
    ja: "いま思い出せる見込み",
    en: "Chance you'd recall them now",
    "zh-TW": "現在想得起來的機率",
  },
  bOfWords: {
    ja: "{n}語の平均",
    en: "average of {n} words",
    "zh-TW": "{n} 個字的平均",
  },
  bForecast: {
    ja: "復習しなかった場合、{date}には約{pct}%（予測）",
    en: "If you don't review, about {pct}% by {date} (forecast)",
    "zh-TW": "如果不複習，{date} 大約 {pct}%（預測）",
  },
  bWeak: {
    ja: "薄れはじめた語",
    en: "Starting to slip",
    "zh-TW": "開始變淡的字",
  },
  bNoWeak: {
    ja: "薄れはじめた語はありません",
    en: "Nothing is slipping right now",
    "zh-TW": "目前沒有開始變淡的字",
  },
  // C 急ぐ順
  cTitle: {
    ja: "急ぐ順",
    en: "Most urgent first",
    "zh-TW": "依急迫程度",
  },
  cTick: {
    ja: "線の印 = 復習どき（{pct}%）",
    en: "Tick = review point ({pct}%)",
    "zh-TW": "刻度 = 複習時機（{pct}%）",
  },
  cRowAria: {
    ja: "{w}: いま{pct}%・{when}",
    en: "{w}: {pct}% now, {when}",
    "zh-TW": "{w}：現在 {pct}%，{when}",
  },
  // D 曲線
  dTitle: {
    ja: "全体の記憶率（前後2週間）",
    en: "Overall retention (±2 weeks)",
    "zh-TW": "整體記憶率（前後兩週）",
  },
  dForecast: {
    ja: "予測",
    en: "Forecast",
    "zh-TW": "預測",
  },
  dSummary: {
    ja: "{date}には約{pct}%（予測）",
    en: "about {pct}% by {date} (forecast)",
    "zh-TW": "{date} 大約 {pct}%（預測）",
  },
  dBands: {
    ja: "背景の色は記憶の段（はっきり・覚えている・薄れぎみ…）です",
    en: "Background colors are the memory levels (Clear, Remembered, Slipping…)",
    "zh-TW": "背景顏色是記憶的程度（很清楚、記得、開始變淡…）",
  },
} satisfies Record<string, Record<UiLang, string>>;

export type CopyKey = keyof typeof COPY;

/** `{n}` などを埋める（`lib/i18n.tsx` の `fill` と同じ規則）。 */
function fill(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function useMemdT(): (key: CopyKey, vars?: Record<string, string | number>) => string {
  const lang = useUiLang();
  return useCallback((key, vars) => fill(COPY[key][lang] ?? COPY[key].ja, vars), [lang]);
}

/** 検査用（3言語がそろっているか・変数が一致するか）。 */
export const MEMORY_DESIGN_COPY = COPY;
