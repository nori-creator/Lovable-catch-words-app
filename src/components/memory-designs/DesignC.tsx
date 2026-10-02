/**
 * 案C「急ぐ順の一覧」— **どの語が、いつ復習どきか**。
 *
 * いまの一覧は「% の低い順」で、行ごとに棒・%・段の札の3つが同じ意味を繰り返す
 * （緑の棒 + 81% + 「覚えている」）。ここでは:
 *  ・並びを**次の復習の日**の順にし、「今日・明日・2〜7日後・それ以降」の見出しで区切る。
 *  ・段の札をやめて、行の右に**いつ**（今日 / あと3日 / 2日過ぎ）を置く — 行が言う
 *    ことが「どれだけ」と「いつ」の2つになる。
 *  ・棒に**復習どき（90%）の印**を立てる。棒の端が印より左なら、もう復習どき。
 * 段は棒と % の色に残し、名前は読み上げで言う。
 */
import { useMemo } from "react";
import { useT } from "@/lib/i18n";
import { memoryOf } from "@/lib/memory";
import { TARGET_RETENTION } from "@/lib/srs";
import { useTargetLang } from "@/lib/target-lang-pref";
import { Term } from "@/components/Term";
import { useMemdT } from "./copy";
import { groupByDue } from "./model";
import { DesignCard, SummaryButton, type MemoryDesignProps } from "./shared";
import { useWhenLabel } from "./hooks";

const TARGET_PCT = Math.round(TARGET_RETENTION * 100);
/** 畳んだ行に名指しする語の数。 */
const PEEK = 3;

export function MemoryDesignC({
  words,
  expanded,
  onToggle,
  onOpenWord,
  nowMs: fixedNow,
}: MemoryDesignProps) {
  const t = useMemdT();
  const tApp = useT();
  const targetLanguage = useTargetLang();
  const whenOf = useWhenLabel();
  const nowMs = useMemo(() => fixedNow ?? Date.now(), [fixedNow]);
  const groups = useMemo(() => groupByDue(words, nowMs), [words, nowMs]);
  const todayCount = groups[0]?.words.length ?? 0;
  const peek = groups.flatMap((g) => g.words).slice(0, PEEK);

  return (
    <div>
      <SummaryButton expanded={expanded} onToggle={onToggle}>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-footnote font-semibold">
            {t("today")} {t("words", { n: todayCount })}
          </span>
          {/* いちばん急ぐ3語を名指し。**色の点 + 語 + %** — 押す前に中身が分かる。 */}
          <span className="flex min-w-0 items-baseline gap-2 overflow-hidden whitespace-nowrap text-footnote text-muted-foreground">
            {peek.map(({ word, percent }) => (
              <span key={word.sticker_id} className="inline-flex shrink-0 items-center gap-1">
                <span
                  aria-hidden
                  className={`inline-block h-1.5 w-1.5 rounded-full ${memoryOf(word).level.bar}`}
                />
                <Term lang={targetLanguage}>{word.headword}</Term>
                <span className="tabular-nums">{percent}%</span>
              </span>
            ))}
          </span>
        </div>
      </SummaryButton>

      {expanded && (
        <DesignCard>
          <div className="flex items-center justify-between gap-2">
            <p className="text-caption font-semibold label-caps text-muted-foreground">
              {t("cTitle")}
            </p>
            <p className="inline-flex items-center gap-1 text-caption text-muted-foreground">
              <span aria-hidden className="inline-block h-3 w-[2px] rounded bg-foreground/60" />
              {t("cTick", { pct: TARGET_PCT })}
            </p>
          </div>
          <div className="mt-1 max-h-80 overflow-y-auto">
            {groups
              .filter((g) => g.words.length > 0)
              .map((g) => (
                <section key={g.bucket}>
                  {/* 見出しは送っても上に残す（いま見ている語が「いつ」の箱か分かる）。 */}
                  <h3 className="sticky top-0 z-10 flex items-baseline justify-between bg-card py-1.5 text-footnote font-semibold">
                    <span>{t(g.bucket)}</span>
                    <span className="font-normal text-muted-foreground">
                      {t("words", { n: g.words.length })}
                    </span>
                  </h3>
                  <ul className="space-y-0.5">
                    {g.words.map(({ word, next, percent }) => {
                      const { level } = memoryOf(word);
                      const when = whenOf(next);
                      const late = next != null && next.days <= 0;
                      return (
                        <li key={word.sticker_id}>
                          <button
                            type="button"
                            onClick={() => onOpenWord(word)}
                            aria-label={t("cRowAria", {
                              w: word.headword,
                              pct: `${percent}（${tApp(level.labelKey)}）`,
                              when,
                            })}
                            className="grid min-h-11 w-full grid-cols-[3.5rem_minmax(0,1fr)_2.25rem_4.25rem] items-center gap-2 rounded-lg px-1.5 text-left hover:bg-secondary/60 active:bg-secondary"
                          >
                            <Term lang={targetLanguage} className="truncate text-body font-medium">
                              {word.headword}
                            </Term>
                            <span aria-hidden className="relative h-2 rounded-full bg-secondary">
                              <span
                                className={`absolute inset-y-0 left-0 rounded-full ${level.bar}`}
                                style={{ width: `${percent}%` }}
                              />
                              {/* 復習どきの印。棒より少し長くして、棒の上でも見える。 */}
                              <span
                                className="absolute -inset-y-1 w-[2px] rounded bg-foreground/60"
                                style={{ left: `calc(${TARGET_PCT}% - 1px)` }}
                              />
                            </span>
                            <span
                              aria-hidden
                              className={`text-right text-footnote font-semibold tabular-nums ${level.text}`}
                            >
                              {percent}%
                            </span>
                            <span
                              aria-hidden
                              className={`truncate text-right text-caption ${
                                late ? "font-semibold text-foreground" : "text-muted-foreground"
                              }`}
                            >
                              {when}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
          </div>
          <p className="mt-1.5 text-caption text-muted-foreground">{t("tapWord")}</p>
        </DesignCard>
      )}
    </div>
  );
}
