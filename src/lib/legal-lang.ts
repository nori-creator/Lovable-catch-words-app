import { browserUiLang, UI_LANGS, type UiLang } from "./i18n";

/** 繁體中文の表示言語（値を直に書かない — `target-lang.test.ts` の門）。 */
const ZH_UI: UiLang = (UI_LANGS as readonly UiLang[]).find((l) => l.startsWith("zh")) ?? "en";

/**
 * **法務の頁（規約・プライバシー・特商法・サポート）の表示言語**（2026-10-15）。
 *
 * ## なぜ別に決めるか
 * iPhone アプリはこれらの頁を Safari で開く。Safari には app の表示言語の記憶（`localStorage` の
 * `ui-lang-v1`）が無いので、`getUiLang()` は既定の「ja」を返し、**英語で使っている人にも日本語の規約**が
 * 出ていた（英語版・繁體中文版は在るのに）。
 *
 * ## 決め方（上から順に、最初に決まった物）
 * 1. URL の `?lang=ja|en|zh-TW`（iOS は表示言語を付けて開く。`zh-Hant` / `zh-tw` / `en-US` のような
 *    書き方も受ける。知らない値は無視）
 * 2. この端末で選んだことのある表示言語（Web の app と同じ鍵）
 * 3. ブラウザの言語（`browserUiLang` — ウェルカム画面と同じ規則。何にも当たらなければ英語）
 *
 * **裸の既定「ja」には落とさない。** 外の世界（URL・localStorage・navigator）はここでは読まない —
 * 呼ぶ側（`use-legal-lang.ts`）が渡す。
 */

/** `?lang=` の値を表示言語に読む。読めなければ `null`。 */
export function parseLangParam(raw: unknown): UiLang | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v === "ja" || v.startsWith("ja-")) return "ja";
  if (v === "en" || v.startsWith("en-")) return "en";
  if (v === "zh" || v.startsWith("zh-") || v.startsWith("zh_")) return ZH_UI;
  return null;
}

export function legalUiLang(opts: {
  param?: unknown;
  stored?: string | null;
  languages?: readonly string[] | null;
}): UiLang {
  const fromParam = parseLangParam(opts.param);
  if (fromParam) return fromParam;
  const stored = parseLangParam(opts.stored);
  if (stored) return stored;
  return browserUiLang(opts.languages ?? []);
}

/** 同じ頁を別の言語で開く URL（`?lang=` だけを付け替える）。 */
export function legalHrefFor(path: string, lang: UiLang): string {
  return `${path}?lang=${encodeURIComponent(lang)}`;
}
