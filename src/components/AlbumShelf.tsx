import { Bookshelf } from "@/components/Bookshelf";
import { ALBUM_SPANS, type AlbumSpan } from "@/lib/album-span";
import { useT } from "@/lib/i18n";

/**
 * ホームの**アルバムの本棚**。日ごと・週ごと・月ごとの3冊が立っている。
 *
 * オーナー指摘 2026-08-21:
 * > 「ホームの画面の日、週、月のボタンを消して。そのかわり、今、アルバムの
 * >  壁紙を変更するところを、**本物の本の背表紙の本棚**にして、背表紙に
 * >  日週、月ごとの本も良いし、それらをタップすると本物のアルバムの
 * >  ページがめくれて…見えるようにしたい。」
 *
 * ## 帯ではなく本にする
 * 前は「日 / 週 / 月」の丸い帯だった。押せば束ね方が変わるが、
 * **何が起きるのかは押すまで分からない**。背表紙にすると
 * 「この本を開く」と読めるので、めくる演出とも辻褄が合う。
 *
 * ## 棚の作りは単語帳と同じ物を使う
 * `Bookshelf` は復習の単語帳のために作った。同じ「棚に立つ本」を
 * 2つ作ると、必ず片方だけ直して見た目がずれる — この app が声・写真・
 * 演出で繰り返した形。
 *
 * 通信も状態も持たない。
 */
export function AlbumShelf({
  onOpen,
  current,
}: {
  onOpen: (span: AlbumSpan) => void;
  /** いま開いている本。`null` なら棚が閉じたまま。 */
  current?: AlbumSpan | null;
}) {
  const t = useT();
  return (
    <Bookshelf
      label={t("home.shelfAria")}
      selectedId={current ?? null}
      onSelect={(id) => onOpen(id as AlbumSpan)}
      books={ALBUM_SPANS.map((s) => ({ id: s, title: t(bookTitleKey(s)) }))}
    />
  );
}

/** 背表紙に書く名前の翻訳キー。 */
export function bookTitleKey(span: AlbumSpan): string {
  return span === "day" ? "home.bookDay" : span === "week" ? "home.bookWeek" : "home.bookMonth";
}
