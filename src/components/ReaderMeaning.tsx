import { useUiLang } from "@/lib/i18n";
import { readerMeaning } from "@/lib/note-language";

/**
 * 語の意味を**表示言語で書かれている時だけ**出す（オーナー指示 2026-09-29「言語の不具合や
 * 言語の混ざりがないかアプリ内を検査して」— 共有の語の意味は最初に作った人の言語で入って
 * いるので、英語・台湾華語で読む人の図鑑に日本語の意味が出ていた）。違えば何も出さない
 * （その人向けの解説ができれば、そちらが入る）。
 */
export function ReaderMeaning({ text }: { text: string | null | undefined }) {
  const lang = useUiLang();
  return <>{readerMeaning(text, lang)}</>;
}
