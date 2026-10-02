import { useUiLang } from "@/lib/i18n";
import { readerMeaning } from "@/lib/note-language";
import { shortMeaning } from "@/lib/meaning-rule";
import { useReaderMeaningFor } from "@/lib/reader-meanings";

/**
 * 語の意味を**表示言語で書かれている時だけ**出す（オーナー指示 2026-09-29「言語の不具合や
 * 言語の混ざりがないかアプリ内を検査して」— 共有の語の意味は最初に作った人の言語で入って
 * いるので、英語・台湾華語で読む人の図鑑に日本語の意味が出ていた）。
 *
 * R17「日本語にしてるのに、図鑑のスライドの意味…に英語が表示される」:
 * `wordId` を渡すと、**その人の言語で作られた解説の意味**を優先して出す（`reader-meanings.ts`）。
 * どちらも無ければ何も出さない。長い説明文で返った意味は語の長さに縮める（`shortMeaning`）。
 */
export function ReaderMeaning({
  text,
  wordId,
}: {
  text: string | null | undefined;
  wordId?: string | null;
}) {
  const lang = useUiLang();
  // 共有の意味も渡す — それが読む人の言語でない語は、意味だけを埋めに行く
  // （2026-10-02「英語・繁體中文の表示で図鑑のスライドに意味が出ない」）。
  const own = useReaderMeaningFor(wordId, lang, text ?? "");
  return <>{shortMeaning(own || readerMeaning(text, lang))}</>;
}
