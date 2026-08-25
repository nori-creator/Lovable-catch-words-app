import { Volume2, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";
import { speak } from "@/lib/speak";
import { DEFAULT_TARGET_LANGUAGE } from "@/lib/target-lang";
import type { JournalScaffold as JournalScaffoldData } from "@/lib/journal.functions";

/**
 * 日記を書く**前**に置く足場。
 *
 * 要望(2026-07-14):
 * 「日記に誘導・質問が必要。レベルに合う型・チャンク・文法 +
 *  今日撮った物・コメント・場所からの自然な質問」
 *
 * ## 白紙を渡さない
 * これまでこの画面には `placeholder` の一文しか無かった。空欄を渡されて
 * 「今日のことを台湾華語で」と言われるのは、いちばん手が止まる形。
 * 復習のスピーキングで同じ問題を解いたので(`getSpeakingScaffold`)、
 * ここも同じ形 — **質問と、書き出しの型**を先に置く。
 *
 * ## 型は押せる
 * 質問だけ出しても、まだ最初の一文字が書けない。型は押すと下書きの
 * 末尾に入る。「我今天在…」まで入っていれば、続きは書ける。
 *
 * ## 通信も状態も持たない
 * 材料は全部 props。検査の雛形から**本物の見た目をそのまま撮れる**。
 */
export function JournalScaffold({
  data,
  onUsePattern,
  targetLanguage = DEFAULT_TARGET_LANGUAGE,
}: {
  data: JournalScaffoldData;
  /** 型を押したとき。下書きの末尾に足す。 */
  onUsePattern: (zh: string) => void;
  /**
   * 足場の文が**何語で書かれているか**(読み上げの声を決める)。
   * 渡さないと台湾華語として読む — 英語の足場が中国語の声で読まれる。
   */
  targetLanguage?: string;
}) {
  const t = useT();
  const headById = new Map(data.captures.map((c) => [c.id, c.headword]));
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-caption font-semibold label-caps text-primary-ink">
          {t("jr.scaffoldTitle")}
        </span>
      </div>

      <ul className="mt-2 space-y-2">
        {data.prompts.map((p, i) => {
          const head = p.sticker_id ? headById.get(p.sticker_id) : null;
          return (
            <li key={i} className="rounded-xl bg-secondary/60 p-2.5">
              <div className="flex items-start gap-2">
                <p lang="zh-Hant" className="flex-1 text-body font-semibold leading-snug">
                  {p.question_zh}
                </p>
                {/* 読み上げは `lib/speak.ts` の1箇所を使う。**自前の写しを
                    作らない** — 写しを持った画面が大陸の声で読んでいた。 */}
                <button
                  onClick={() => speak(p.question_zh, targetLanguage)}
                  aria-label={t("card.playPron")}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-0.5 text-caption text-muted-foreground">{p.question_ja}</p>
              {/* **何のことを聞かれているかを示す。** 撮った物と結び付かない
                  質問は、その人の今日について聞いているように見えない。 */}
              {head && (
                <p className="mt-1 text-caption text-muted-foreground">
                  {t("jr.aboutCapture", { w: head })}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {data.patterns.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <p className="text-caption font-semibold label-caps text-muted-foreground">
            {t("jr.useThese")}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {data.patterns.map((p, i) => (
              <button
                key={i}
                onClick={() => onUsePattern(p.zh)}
                title={p.ja}
                className="min-h-11 rounded-full bg-primary/10 px-3 text-footnote font-semibold text-primary-ink active:scale-[0.98] motion-reduce:active:scale-100"
              >
                <span lang="zh-Hant">{p.zh}</span>
              </button>
            ))}
          </div>
          <p className="mt-1 text-caption text-muted-foreground">{t("jr.tapToInsert")}</p>
        </div>
      )}
    </div>
  );
}
