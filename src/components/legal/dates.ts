/** 最終更新日（3言語の版で同じ日にする — 片方だけ古い条文を出さない）。 */
export const PRIVACY_UPDATED = {
  ja: "2026年10月26日",
  en: "26 October 2026",
  "zh-TW": "2026年10月26日",
} as const;

/** 利用規約・特商法の表記は 2026-10-03 のまま（2026-10-26 はプライバシーポリシーの広告の条だけを直した）。 */
export const TERMS_UPDATED = {
  ja: "2026年10月3日",
  en: "3 October 2026",
  "zh-TW": "2026年10月3日",
} as const;
export const TOKUSHOHO_UPDATED = TERMS_UPDATED;
