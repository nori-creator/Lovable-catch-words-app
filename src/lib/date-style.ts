import { useEffect, useState } from "react";

/**
 * **ホームの日付の組み方を見比べる**（開発者専用・オーナー指示 2026-09-24
 * 「ホームの日付の文字を変更して。9月21日のように。デザインを複数提示して。
 *  比較したい。開発者の私だけ」）。
 *
 * どれも「9月21日」のように**月と日を一緒に**書く（前の形は日にちの数字だけを
 * 大きくし、月は下に小さく書いていた — 何月か一目で分からなかった）。
 *
 * 選択は端末ローカル（`localStorage`）。開発者が自分の端末で見比べるための
 * ものなので、サーバーには保存しない（`effect-lab.ts` と同じ考え方）。
 * 一般の利用者には選ぶ欄を出さず、既定（`DEFAULT_DATE_STYLE`）だけが見える。
 */
export const DATE_STYLES = ["a", "b", "c", "d", "current"] as const;
export type DateStyle = (typeof DATE_STYLES)[number];

export const DATE_STYLE_META: Record<DateStyle, { label: string; note: string }> = {
  a: { label: "A 大きく1行", note: "「9月21日」を大きく。曜日は上に小さく青で" },
  b: { label: "B 曜日を横に", note: "「9月21日（月）」を1行に。年は下に小さく" },
  c: { label: "C 日を強く", note: "「9月」は細く、「21日」を太く大きく。曜日は下に" },
  d: { label: "D 写真アプリ風", note: "「9月21日 月曜日」を中くらいの太字で。控えめ" },
  current: { label: "今の形", note: "曜日・日にちの数字だけ大きく・年月（見比べ用）" },
};

export const DEFAULT_DATE_STYLE: DateStyle = "a";
const KEY = "cw.dateStyle";
export const DATE_STYLE_EVENT = "cw:date-style";

export function isDateStyle(v: unknown): v is DateStyle {
  return typeof v === "string" && (DATE_STYLES as readonly string[]).includes(v);
}

export function getDateStyle(): DateStyle {
  try {
    const v = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    return isDateStyle(v) ? v : DEFAULT_DATE_STYLE;
  } catch {
    return DEFAULT_DATE_STYLE;
  }
}

export function setDateStyle(v: DateStyle) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* 保存できなくても、この画面の間は反映する */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DATE_STYLE_EVENT));
}

/** 選んだ瞬間に全部の日付が変わる。 */
export function useDateStyle(): DateStyle {
  const [s, setS] = useState<DateStyle>(DEFAULT_DATE_STYLE);
  useEffect(() => {
    const sync = () => setS(getDateStyle());
    sync();
    window.addEventListener(DATE_STYLE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DATE_STYLE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return s;
}

/**
 * 「9月21日」を**月の部分と日の部分に分けて**返す（C の太さの出し分けに使う）。
 * 言語ごとの書き方（「September 21」「9月21日」）は `Intl` に任せ、切れ目だけ取る。
 */
export function monthDayParts(
  date: Date,
  locale: string,
): { month: string; day: string; order: "month-first" | "day-first" } {
  const parts = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).formatToParts(
    date,
  );
  const mi = parts.findIndex((p) => p.type === "month");
  const di = parts.findIndex((p) => p.type === "day");
  if (mi < 0 || di < 0) {
    const all = parts.map((p) => p.value).join("");
    return { month: "", day: all, order: "month-first" };
  }
  // 区切りの字（「月」の後ろ・「日」・空白）は、それぞれ手前の部分に付ける。
  const month: string[] = [];
  const day: string[] = [];
  let into = mi < di ? month : day;
  parts.forEach((p, i) => {
    if (i === Math.min(mi, di)) into = mi < di ? month : day;
    if (i === Math.max(mi, di)) into = mi < di ? day : month;
    into.push(p.value);
  });
  return {
    month: month.join("").trimEnd(),
    day: day.join("").trim(),
    order: mi < di ? "month-first" : "day-first",
  };
}
