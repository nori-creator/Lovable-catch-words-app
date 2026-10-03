import { CHINESE_EXPLANATION_LANGUAGE as ZH } from "@/lib/target-lang";
import type { UiLang } from "@/lib/i18n";
import type { LegalPublicInfo } from "@/lib/legal-config";
import { PrivacyEn } from "./privacy-en";
import { PrivacyJa } from "./privacy-ja";
import { PrivacyZhTw } from "./privacy-zh-tw";
import { TermsEn } from "./terms-en";
import { TermsJa } from "./terms-ja";
import { TermsZhTw } from "./terms-zh-tw";

/**
 * 表示言語の版を選ぶ。
 *
 * 法務文書は翻訳キーに刻まず、**言語ごとに文書そのもの**を持つ（条文は文章として
 * 成り立っていないと意味がなく、`t()` で細切れにすると片方だけ古くなる）。
 * 2026-10-03 に繁體中文の版を足した（台湾の利用者が読める言語で条件を出す）。
 * 日本語版が正文で、英語・繁體中文の版は頭にそう書いてある。
 */
export function PrivacyDocument({ lang, info }: { lang: UiLang; info: LegalPublicInfo }) {
  if (lang === "ja") return <PrivacyJa info={info} />;
  if (lang === ZH) return <PrivacyZhTw info={info} />;
  return <PrivacyEn info={info} />;
}

export function TermsDocument({ lang, info }: { lang: UiLang; info: LegalPublicInfo }) {
  if (lang === "ja") return <TermsJa info={info} />;
  if (lang === ZH) return <TermsZhTw info={info} />;
  return <TermsEn info={info} />;
}
