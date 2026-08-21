import { BookMarked, ChevronRight, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Zh } from "@/components/Zh";
import { formatCount } from "@/lib/count";
import type { WordbookSummary } from "@/lib/wordbook.functions";

/**
 * 取り込んだ単語帳の**本棚**。
 *
 * オーナー: 「復習も図鑑の単語とは別に、**単語帳を選択すると**単語帳で
 * 取り込んだものを SRS で復習できるように。」
 *
 * ## 図鑑と混ぜない
 * 図鑑は「街で出会って自分で撮った物」の記録。単語帳の語には写真も場所も
 * 無いので、同じ棚に置くと図鑑の意味が変わる。本棚は復習側に置く。
 *
 * ## 数字は2つだけ
 * 「今日出す数」と「覚えた数」。全部で何語かは添え物にする —
 * 3つの数字を同じ大きさで並べると、どれを見ればいいのか分からない。
 *
 * 通信も状態も持たない。検査の雛形から本物の見た目をそのまま撮れる。
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
  if (books.length === 0) return null;
  return (
    <ul className="space-y-2">
      {books.map((b) => (
        <li key={b.id} className="flex items-stretch gap-2">
          <button
            onClick={() => onOpen(b.id)}
            // **`min-w-0` を外に付ける。** flex の子は既定で `min-width: auto` なので、
            // 中で `truncate` を書いても、名前の長い本でボタンごと横にはみ出す
            // (検査が 504 > 390 で弾いた)。
            className="press-in flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-sm"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary">
              <BookMarked className="h-4 w-4 text-primary" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-semibold">
                <Zh>{b.title}</Zh>
              </span>
              <span className="mt-0.5 block text-caption text-muted-foreground">
                {b.due > 0 ? t("wb.dueN", { n: formatCount(b.due) }) : t("wb.doneForToday")}
                {" · "}
                {t("wb.learnedOf", {
                  n: formatCount(b.learned),
                  total: formatCount(b.total),
                })}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
          {onDelete && (
            <button
              onClick={() => onDelete(b.id)}
              aria-label={t("wb.delete", { title: b.title })}
              className="grid min-h-11 w-11 shrink-0 place-items-center rounded-2xl border border-border bg-card text-muted-foreground shadow-sm"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
