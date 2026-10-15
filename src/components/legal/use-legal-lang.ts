import { useEffect, useState } from "react";
import { htmlLangOf, storedUiLang, type UiLang } from "@/lib/i18n";
import { legalUiLang, parseLangParam } from "@/lib/legal-lang";

/**
 * 法務の頁の表示言語（`legal-lang.ts` の決め方を、描画に乗せる）。
 *
 * - `?lang=` が在れば**サーバの描画から**その言語（最初の1枚から正しい言語。水和の食い違いも無い）。
 * - 無ければ最初は「ja」で描き、マウント後にこの端末で選んだ言語 → ブラウザの言語に切り替える
 *   （`useUiLang` と同じトレードオフ: サーバは localStorage も navigator も読めない）。
 * - 決まった言語を `<html lang>` にも書く（読み上げ・繁体字の字形のため）。
 */
export function useLegalLang(param: unknown): UiLang {
  const fromParam = parseLangParam(param);
  const [lang, setLang] = useState<UiLang>(fromParam ?? "ja");
  useEffect(() => {
    const languages =
      typeof navigator === "undefined"
        ? []
        : navigator.languages?.length
          ? navigator.languages
          : [navigator.language];
    const next = legalUiLang({ param, stored: storedUiLang(), languages });
    setLang(next);
    const attr = htmlLangOf(next);
    if (document.documentElement.lang !== attr) document.documentElement.lang = attr;
  }, [param]);
  return lang;
}
