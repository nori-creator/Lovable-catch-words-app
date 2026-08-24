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
  /**
   * **すでにアルバムの台紙の上に置かれているか。**
   *
   * 台紙(`album-bg-*`)は明るい面でテーマに関わらず固定してある。その上に
   * `text-foreground` のようなテーマ追従の色を載せると、暗いテーマで
   * 「白い字を生成りの紙に載せる」ことになる — 見開きに入れた最初の版が
   * まさにそれで、検査がコントラスト 1.00 で弾いた。
   * 台紙が固定なら、**その上の字も固定**でなければ噛み合わない
   * (`--album-ink` / `--album-ink-dim`。理由は `styles.css` にも書いてある)。
   *
   * 単体で置くとき(既定)は自分で紙を敷き、字はテーマに従う。
   */
  onPaper = false,
}: {
  body: string;
  note?: string | null;
  usedWords: readonly string[];
  onPaper?: boolean;
}) {
  const t = useT();
  const ink = onPaper ? "text-album-ink" : "text-foreground";
  const dim = onPaper ? "text-album-ink" : "text-muted-foreground";
  return (
    <div
      className={
        onPaper
          ? "relative"
          : "album-page relative mt-3 rounded-2xl border border-border p-5 sm:p-7"
      }
    >
      {/* 見開きの**綴じ目**。写真のページと向かい合っていることを、
          言葉ではなく形で示す。すでに見開きの中に居るときは要らない
          (本物の綴じ目がその外側に在る)。 */}
      {!onPaper && <span aria-hidden className="absolute inset-x-8 -top-px h-px bg-border" />}
      <div className="flex items-center gap-1.5">
        <Quote className={`h-3.5 w-3.5 ${dim}`} />
        <span className={`label-caps text-caption ${dim}`}>{t("home.dayJournal")}</span>
      </div>

      {/* 日記は**手書きの字**で置く。写真のページと同じ本の中に在る物なので、
          画面の本文と同じ顔にしない。 */}
      <p className={`ja-phrase mt-2 whitespace-pre-wrap text-body leading-relaxed ${ink}`}>
        {body}
      </p>

      {note && (
        <p className={`ja-phrase mt-2 border-t border-border pt-2 text-footnote ${dim}`}>{note}</p>
      )}

      {usedWords.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className={`text-caption ${dim}`}>{t("home.dayJournalUsed")}</span>
          {usedWords.map((w) => (
            <span
              key={w}
              lang="zh-Hant"
              // 紙の上では**紙の色で**囲む。`bg-secondary` はテーマ追従なので、
              // 暗いテーマで生成りの紙に暗い札が乗って読めなくなる。
              className={`rounded-full px-2 py-0.5 text-caption font-semibold ring-1 ${
                onPaper
                  ? "bg-white/55 text-album-ink ring-album-ink/25"
                  : "bg-secondary text-foreground ring-border"
              }`}
            >
              {w}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
