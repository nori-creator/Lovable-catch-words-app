/**
 * 案A「予定で見る」— **いつ・何語の復習が来るか**。
 *
 * いまの帯（段の色の内訳）は「どれだけ覚えているか」には答えるが、復習の画面で
 * 人が知りたい「今日・明日、何をやればいいか」には答えない。ここでは同じ語の列を
 * **次の復習の日**で数え直し、3つの数（今日・明日・2〜7日後）と14日の棒にする。
 *
 * 棒は**1色**（主色）で、今日だけを濃くする（強調の形 — 見るべきは今日）。
 * 段の色を使わないのは、ここでの色の仕事が「量」だから（段の色は「状態」の印）。
 */
import { useMemo } from "react";
import { useMemdT } from "./copy";
import { dueCountsByDay, groupByDue, type DueBucket } from "./model";
import { DesignCard, LevelLegend, SummaryButton, WordChip, type MemoryDesignProps } from "./shared";
import { useDateOf } from "./hooks";

const DAYS = 14;
/**
 * 1つの箱に並べる札の数。多い日は「ほか n語」にまとめる（開いた面が伸びすぎない）。
 * 10 = 今日の束の既定の数（1回の復習で出る分は、全部名指しで見える）。
 */
const CHIPS_PER_GROUP = 10;
/** 棒の下に日付を書く日（今日・1週間後・最後の日）。毎日書くと 390px では重なる。 */
const LABEL_DAYS = new Set([0, 7, DAYS - 1]);

export function MemoryDesignA({
  words,
  expanded,
  onToggle,
  onOpenWord,
  nowMs: fixedNow,
}: MemoryDesignProps) {
  const t = useMemdT();
  const nowMs = useMemo(() => fixedNow ?? Date.now(), [fixedNow]);
  const dateOf = useDateOf(nowMs);
  const groups = useMemo(() => groupByDue(words, nowMs), [words, nowMs]);
  const perDay = useMemo(() => dueCountsByDay(words, nowMs, DAYS), [words, nowMs]);
  const count = (b: DueBucket) => groups.find((g) => g.bucket === b)?.words.length ?? 0;
  const max = Math.max(1, ...perDay);
  const dayName = (d: number) =>
    d === 0 ? t("today") : d === 1 ? t("tomorrow") : t("daysLater", { n: d });
  const tiles: DueBucket[] = ["today", "tomorrow", "week"];

  return (
    <div>
      <SummaryButton
        expanded={expanded}
        onToggle={onToggle}
        label={`${t("aTitle")}: ${tiles.map((b) => `${t(b)} ${t("words", { n: count(b) })}`).join("、")}`}
      >
        {/* 3つの数を横に。**今日だけ字を大きく**（今やることが先に目に入る）。 */}
        <div aria-hidden className="grid grid-cols-3 gap-2">
          {tiles.map((b) => (
            <div key={b} className="min-w-0">
              <div className="text-caption text-muted-foreground">{t(b)}</div>
              <div
                className={`leading-tight ${
                  b === "today" ? "text-headline font-bold" : "text-body font-semibold"
                }`}
              >
                {t("words", { n: count(b) })}
              </div>
            </div>
          ))}
        </div>
      </SummaryButton>

      {expanded && (
        <DesignCard>
          <p className="text-caption font-semibold label-caps text-muted-foreground">
            {t("aTitle")}
          </p>
          {/* 14日の棒。値の字は**今日と一番多い日だけ**（全部の棒に数を書くと読まれない）。
              ほかの日は読み上げの名前に数を持たせる。 */}
          <ol className="mt-2 flex h-28 items-end gap-[2px]" aria-label={t("aChartCaption")}>
            {perDay.map((n, d) => {
              const showValue = n > 0 && (d === 0 || n === max);
              return (
                <li
                  key={d}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                  aria-label={t("aBarAria", { day: `${dayName(d)}（${dateOf(d)}）`, n })}
                  title={t("aBarAria", { day: `${dayName(d)}（${dateOf(d)}）`, n })}
                >
                  {showValue && (
                    <span
                      aria-hidden
                      className="mb-0.5 text-caption font-semibold tabular-nums text-foreground"
                    >
                      {n}
                    </span>
                  )}
                  <span
                    aria-hidden
                    className={`w-full rounded-t-[4px] ${d === 0 ? "bg-primary" : "bg-primary/35"}`}
                    // 0語の日も**細い線を残す**（日が抜けて見えると、並びが崩れて読める）。
                    style={{ height: n > 0 ? `${Math.max(6, (n / max) * 78)}%` : "2px" }}
                  />
                </li>
              );
            })}
          </ol>
          {/* 日付は**その棒の真下**に（棒と同じ14列で並べる）。両端は内側へ寄せて、
              はみ出さないようにする。 */}
          <div
            aria-hidden
            className="mt-1 flex gap-[2px] border-t border-border pt-1 text-caption text-muted-foreground"
          >
            {perDay.map((_, d) => (
              <span
                key={d}
                className={`flex min-w-0 flex-1 whitespace-nowrap ${
                  d === 0 ? "justify-start" : d === DAYS - 1 ? "justify-end" : "justify-center"
                } ${d === 0 ? "font-semibold text-foreground" : ""}`}
              >
                {LABEL_DAYS.has(d) ? (d === 0 ? t("today") : dateOf(d)) : null}
              </span>
            ))}
          </div>
          <p className="mt-1 text-caption text-muted-foreground">{t("aChartCaption")}</p>

          {/* 語は**日の箱ごと**に。「それ以降」は数だけ（今やることではない）。 */}
          <div className="mt-3 space-y-3 border-t border-border pt-3">
            {groups
              .filter((g) => g.bucket !== "later" && g.words.length > 0)
              .map((g) => (
                <section key={g.bucket}>
                  <h3 className="mb-1.5 text-footnote font-semibold">
                    {t(g.bucket)}{" "}
                    <span className="font-normal text-muted-foreground">
                      {t("words", { n: g.words.length })}
                    </span>
                  </h3>
                  <div className="flex flex-wrap gap-x-1.5 gap-y-2.5">
                    {g.words.slice(0, CHIPS_PER_GROUP).map(({ word }) => (
                      <WordChip key={word.sticker_id} word={word} onOpen={onOpenWord} />
                    ))}
                    {g.words.length > CHIPS_PER_GROUP && (
                      <span className="inline-flex min-h-8 items-center px-1 text-footnote text-muted-foreground">
                        {t("more", { n: g.words.length - CHIPS_PER_GROUP })}
                      </span>
                    )}
                  </div>
                </section>
              ))}
            <p className="text-footnote text-muted-foreground">
              {t("later")} {t("words", { n: count("later") })}
            </p>
          </div>
          <p className="mt-2 text-caption text-muted-foreground">{t("tapWord")}</p>
          {/* 段の色の凡例（札の点の色の意味）。使われている段だけ。 */}
          <LevelLegend words={words} />
        </DesignCard>
      )}
    </div>
  );
}
