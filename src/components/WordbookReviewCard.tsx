import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Zh } from "@/components/Zh";
import { PronounceButton } from "@/components/PronounceButton";
import { Reading } from "@/lib/phonetic";
import type { WordbookCard } from "@/lib/wordbook.functions";

/**
 * 単語帳の1問。**意味を見て、台湾華語を選ぶ。**
 *
 * ## 図鑑の復習と向きを揃える
 * 図鑑の4択も「写真+意味 → 台湾華語を選ぶ」向き。単語帳には写真が無い
 * ぶん意味だけになるが、**問いの向きを揃える**ことで、同じアプリの中で
 * 2種類の頭の使い方をさせない。
 *
 * ## 選択肢は同じ本の中から
 * 単語帳は同じ単元の語が並ぶので、図鑑から借りるより紛らわしく、練習になる
 * (作るのは `getWordbookDue`。AI は1回も呼ばない)。
 *
 * 通信を持たない。押した結果は呼ぶ側が受け取る。
 */
export function WordbookReviewCard({
  card,
  onAnswer,
  language,
}: {
  card: WordbookCard;
  /** 選んだ答えが正しかったか。次へ進むのも呼ぶ側の仕事。 */
  onAnswer: (correct: boolean) => void;
  /**
   * 読み上げる言語。**渡さないと台湾華語として読む。**
   *
   * ここは `usePronounce()` を引数なしで呼んでいたので、英語を学んで
   * いる人の単語帳も中国語の声で読まれていた。単語帳そのものには
   * 言語の列が無いので、いまその人が学んでいる言語を呼ぶ側が渡す。
   */
  language?: string;
}) {
  const t = useT();
  const [picked, setPicked] = useState<string | null>(null);
  const correct = picked === card.headword;

  return (
    <article className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <p className="text-caption label-caps text-muted-foreground">{t("wb.pickTheWord")}</p>
      {/* 意味は問いそのものなので大きく。読みは**答え合わせのあと**に出す —
          先に出すと、注音を見て当てられてしまう。 */}
      <p className="ja-phrase mt-1 text-title font-bold leading-snug">
        {card.meaning_ja || t("wb.noMeaning")}
      </p>

      <ul className="mt-4 space-y-2">
        {card.choices.map((c) => {
          const isPicked = picked === c;
          const isAnswer = c === card.headword;
          // 押す前は全部同じ顔。押したあとだけ、正解と自分の選択に色を付ける。
          // 色は `--ok` / `--bad` のトークンから作る(図鑑の4択と同じ作法)。
          // 素の緑・赤を直に書くと、暗いテーマで一切追従しない。
          const tone = !picked
            ? "border-border bg-secondary"
            : isAnswer
              ? "border-ok bg-ok/12"
              : isPicked
                ? "border-bad bg-bad/12"
                : "border-border bg-secondary opacity-60";
          return (
            <li key={c}>
              <button
                disabled={!!picked}
                onClick={() => setPicked(c)}
                className={`min-h-11 w-full rounded-2xl border px-4 py-3 text-left text-headline font-semibold ${tone}`}
              >
                <Zh>{c}</Zh>
              </button>
            </li>
          );
        })}
      </ul>

      {picked && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-headline font-bold">
              <Zh>{card.headword}</Zh>
            </span>
            <Reading
              zhuyin={card.reading_zhuyin ?? undefined}
              pinyin={card.pinyin ?? undefined}
              className="text-body text-muted-foreground"
            />
            {/* **鳴らせるようになってから出る**(オーナー指摘 2026-08-26)。 */}
            <PronounceButton
              text={card.headword}
              language={language}
              tone="quiet"
              label={t("card.pronOfWord", { word: card.headword })}
            />
          </div>
          {/* **押す物の強さを結果で入れ替える。** 間違えた直後にいちばん
              目立つボタンが「次へ」だと、間違いを見ないまま先へ進む。 */}
          <button
            onClick={() => onAnswer(correct)}
            className={`mt-3 min-h-11 w-full rounded-xl py-3 text-body font-semibold ${
              correct
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-secondary text-foreground"
            }`}
          >
            {t("review.next")}
          </button>
        </div>
      )}
    </article>
  );
}
