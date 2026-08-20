import type { ReactNode } from "react";
import { Quote, X } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * 見開きの**右ページ** — 今日の日記を書く紙。
 *
 * オーナー:
 * > 「今日の日記を書くボタンを押したら、ホームのアルバムのページがめくれて、
 * >  **左に今日撮った写真、右ページに日記を書く。いまはアルバムの写真と
 * >  日記が別の機能として分離してる。**」
 *
 * ## 読む側と同じ紙にする
 * 過去の日を**読む**側(`DayJournalPage`)は既に「向かいのページ」として
 * 出ている。書く側だけ別の画面に飛ばすと、同じ本の中で紙が2種類あることに
 * なる。紙(`.album-page`)も綴じ目も同じにして、**読む日と書く日が
 * 同じ本に見える**ようにする。
 *
 * ## 中身は持たない
 * 書く仕組みは `JournalComposer` が1つだけ持つ。ここは紙と綴じ目と
 * 「閉じる」だけ。中身をここに書くと、`/journal` の画面と2つに割れて
 * 必ず食い違う(この app が声・写真・演出で繰り返した間違い)。
 *
 * 通信も状態も持たない。検査の雛形から本物の見た目をそのまま撮れる。
 */
export function JournalWritingPage({
  children,
  onClose,
}: {
  children: ReactNode;
  /** 紙を閉じる。渡さなければ閉じるボタンを出さない。 */
  onClose?: () => void;
}) {
  const t = useT();
  return (
    <div className="page-turn album-page relative mt-3 rounded-2xl border border-border p-5 sm:p-7">
      {/* 綴じ目。写真のページと向かい合っていることを、言葉ではなく形で示す。 */}
      <span aria-hidden className="absolute inset-x-8 -top-px h-px bg-border" />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Quote className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="label-caps text-caption text-muted-foreground">
            {t("home.writeToday")}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="-m-2 grid h-11 w-11 place-items-center rounded-full text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
