import { useEffect, useState } from "react";
import { Play, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Zh } from "@/components/Zh";
import { Bookshelf } from "@/components/Bookshelf";
import { formatCount } from "@/lib/count";
import type { WordbookSummary } from "@/lib/wordbook.functions";

/**
 * 取り込んだ単語帳の**本棚**。
 *
 * オーナー: 「復習も図鑑の単語とは別に、**単語帳を選択すると**単語帳で
 * 取り込んだものを SRS で復習できるように。」
 *
 * オーナー指摘 2026-08-21:
 * > 「復習の単語帳の復習は上部に**リアルな本の本棚**を作って、
 * >  **背表紙のタイトルが見える**ようにし、いろんな単語帳を選択できる
 * >  ようにして。」
 *
 * ## なぜ行の一覧をやめたか
 * 前は角丸の行が縦に並ぶだけで、**本には見えなかった**。単語帳は
 * 「持っている本」なので、棚に立っているほうが探しやすい
 * (この app が繰り返し言っている「場所で覚える」と同じ理屈 —
 *  左から3冊目の赤い本、と手が覚える)。
 *
 * ## 数と「捨てる」は棚に載せない
 * 背表紙は細い。そこに数字を詰めると題が読めなくなり、
 * 背表紙の値打ちが消える。**選んだ1冊の話は棚の下**でする。
 *
 * ## 図鑑と混ぜない
 * 図鑑は「街で出会って自分で撮った物」の記録。単語帳の語には写真も場所も
 * 無いので、同じ棚に置くと図鑑の意味が変わる。本棚は復習側に置く。
 *
 * 通信も状態も持たない(選んでいる本だけ)。検査の雛形から本物の見た目を
 * そのまま撮れる。
 */
export function WordbookShelf({
  books,
  onOpen,
  onDelete,
}: {
  books: readonly WordbookSummary[];
  onOpen: (id: string) => void;
  /** 渡さなければ捨てるボタンを出さない。 */
  onDelete?: (id: string) => void;
}) {
  const t = useT();
  const [selectedId, setSelectedId] = useState<string | null>(books[0]?.id ?? null);
  // 選んでいた本が棚から消えたら(捨てた・読み込み直した)、先頭に戻す。
  // **選びっぱなしにしない** — 下の欄が空のまま残ると、棚に本があるのに
  // 「何も選べていない」画面になる。
  useEffect(() => {
    if (books.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((id) => (id && books.some((b) => b.id === id) ? id : books[0].id));
  }, [books]);

  if (books.length === 0) return null;
  const selected = books.find((b) => b.id === selectedId) ?? books[0];

  return (
    <div className="space-y-3">
      <Bookshelf
        books={books.map((b) => ({ id: b.id, title: b.title }))}
        selectedId={selected.id}
        onSelect={setSelectedId}
      />

      {/* 選んだ1冊。**数字は2つだけ** — 「今日出す数」と「覚えた数」。
          3つを同じ大きさで並べると、どれを見ればいいのか分からない。 */}
      <section className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <h3 className="truncate text-body font-semibold">
          <Zh>{selected.title}</Zh>
        </h3>
        <p className="mt-0.5 text-caption text-muted-foreground">
          {selected.due > 0 ? t("wb.dueN", { n: formatCount(selected.due) }) : t("wb.doneForToday")}
          {" · "}
          {t("wb.learnedOf", {
            n: formatCount(selected.learned),
            total: formatCount(selected.total),
          })}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => onOpen(selected.id)}
            className="press-in inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 text-footnote font-semibold text-primary-foreground"
          >
            <Play className="h-4 w-4" aria-hidden />
            {t("wb.review")}
          </button>
          {onDelete && (
            <button
              onClick={() => onDelete(selected.id)}
              aria-label={t("wb.delete", { title: selected.title })}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
