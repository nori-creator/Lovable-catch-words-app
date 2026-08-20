import { Quote } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * その日の日記を、写真のページの**向かい**に置く(要望 #22)。
 *
 * > 「日ごとの本を開くと日記と写真が見開きで見れる」
 *
 * ## `used_sticker_ids` は書かれていたが誰も読んでいなかった
 * 添削のたびに「その日撮った札の id」が `journal_entries.used_sticker_ids`
 * に入っている(`journal.functions.ts`)。**書くだけ書いて、読む所が
 * どこにも無かった** — 数えていたのに誰にも見えていない、という形を
 * この app で何度も直している(`modeFor` / `getMyStats` / `rarity.ts`)。
 *
 * その日の札は呼ぶ側が既に持っているので、id を突き合わせるだけで
 * 「この日はこの語を使って書いた」が出せる。**問い合わせは増やさない。**
 *
 * ## 日記の無い日には何も出さない
 * 過去の日に「日記を書きませんか」と誘っても、日記は今日のことを書く物
 * なので誘いにならない。空の枠だけが並ぶと、本が**書き損じの束**に見える。
 *
 * ## 色を固定しない
 * 最初 `amber-*` を直に書いたら検査が18件で落ちた — 暗いテーマで 1.31:1、
 * 明るいテーマでも下限割れ。`memory.ts` に**同じ失敗が既に書いてある**
 * (「`text-red-600` のように直に書いていた。暗いテーマに一切追従しない」)。
 * 紙の色は `.album-page` が持つので、字はテーマのトークンで置く。
 *
 * 通信も状態も持たない。検査の雛形から本物の見た目をそのまま撮れる。
 */
export function DayJournalPage({
  /** 直された文(無ければ下書き)。どちらも無ければこの部品は呼ばれない。 */
  body,
  /** 気づき。無ければ出さない。 */
  note,
  /** その日の札のうち、日記に使った語の見出し。 */
  usedWords,
}: {
  body: string;
  note?: string | null;
  usedWords: readonly string[];
}) {
  const t = useT();
  return (
    <div className="album-page relative mt-3 rounded-2xl border border-border p-5 sm:p-7">
      {/* 見開きの**綴じ目**。写真のページと向かい合っていることを、
          言葉ではなく形で示す。 */}
      <span aria-hidden className="absolute inset-x-8 -top-px h-px bg-border" />
      <div className="flex items-center gap-1.5">
        <Quote className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="label-caps text-caption text-muted-foreground">
          {t("home.dayJournal")}
        </span>
      </div>

      {/* 日記は**手書きの字**で置く。写真のページと同じ本の中に在る物なので、
          画面の本文と同じ顔にしない。 */}
      <p className="ja-phrase mt-2 whitespace-pre-wrap text-body leading-relaxed text-foreground">
        {body}
      </p>

      {note && (
        <p className="ja-phrase mt-2 border-t border-border pt-2 text-footnote text-muted-foreground">
          {note}
        </p>
      )}

      {usedWords.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-caption text-muted-foreground">{t("home.dayJournalUsed")}</span>
          {usedWords.map((w) => (
            <span
              key={w}
              lang="zh-Hant"
              className="rounded-full bg-secondary px-2 py-0.5 text-caption font-semibold text-foreground ring-1 ring-border"
            >
              {w}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
