/**
 * 案B「ひとつの数字」— **全体として、いまどれくらい覚えているか**。
 *
 * いまの面は帯・一覧・折れ線の3つが同じ重さで並び、どれから読めばいいか分からない。
 * ここでは主役を1つ（全体の記憶率 = `getOverallMemoryStats` の今日の値）にして大きく置き、
 * 段ごとの内訳は細い棒の行、予測は**文で**言う（「復習しなかった場合、10/16には約85%」）。
 * 「予測」と書き、条件（復習しなかった場合）も書く — 予定のように読ませない。
 *
 * 平均は弱い語を隠すので、**薄れはじめた語（薄れぎみ以下）を名指しで**下に並べる。
 */
import { useMemo } from "react";
import { useT } from "@/lib/i18n";
import { memoryOf } from "@/lib/memory";
import { useMemdT } from "./copy";
import { lastForecast, levelCounts, seriesAt } from "./model";
import { DesignCard, SummaryButton, WordChip, type MemoryDesignProps } from "./shared";
import { useDateOf } from "./hooks";
import { Sparkline } from "./Sparkline";

/** これ未満（薄れぎみ以下 = 85% 未満）を「薄れはじめた語」として名指しする。 */
const WEAK_BELOW = 85;
const WEAK_CHIPS = 8;

export function MemoryDesignB({
  words,
  series,
  expanded,
  onToggle,
  onOpenWord,
  nowMs: fixedNow,
}: MemoryDesignProps) {
  const t = useMemdT();
  const tApp = useT();
  const nowMs = useMemo(() => fixedNow ?? Date.now(), [fixedNow]);
  const dateOf = useDateOf(nowMs);
  const today =
    seriesAt(series, 0) ??
    (words.length
      ? Math.round(words.reduce((s, w) => s + memoryOf(w).percent, 0) / words.length)
      : null);
  const forecast = lastForecast(series);
  const levels = levelCounts(words).filter((l) => l.count > 0);
  const total = words.length || 1;
  const weak = useMemo(
    () =>
      words
        .filter((w) => memoryOf(w).percent < WEAK_BELOW)
        .sort((a, b) => memoryOf(a).percent - memoryOf(b).percent),
    [words],
  );
  if (today == null) return null;

  return (
    <div>
      <SummaryButton expanded={expanded} onToggle={onToggle}>
        <div className="flex items-baseline gap-2">
          {/* 大きな数は**比例数字**（等幅にすると 94 の間が空いて見える）。 */}
          <span className="text-title font-bold leading-none tracking-[-0.02em]">{today}%</span>
          <span className="min-w-0 truncate text-footnote text-muted-foreground">
            {t("bLabel")} · {t("bOfWords", { n: words.length })}
          </span>
        </div>
      </SummaryButton>

      {expanded && (
        <DesignCard>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-footnote text-muted-foreground">{t("bLabel")}</p>
              <p className="text-hero font-bold leading-none tracking-[-0.02em]">{today}%</p>
              <p className="mt-1 text-caption text-muted-foreground">
                {t("bOfWords", { n: words.length })}
              </p>
            </div>
            <div className="w-28 shrink-0">
              <Sparkline series={series} />
            </div>
          </div>
          {forecast && (
            <p className="mt-2 text-footnote">
              {t("bForecast", { date: dateOf(forecast.day), pct: forecast.value })}
            </p>
          )}

          {/* 段ごとの内訳。**数は字で**、棒は割合の手掛かりだけ（色だけに頼らない）。 */}
          <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
            {levels.map(({ level, count }) => (
              <li
                key={level.level}
                className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.25rem] items-center gap-2"
              >
                <span className="inline-flex min-w-0 items-center gap-1.5 text-footnote">
                  <span
                    aria-hidden
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${level.bar}`}
                  />
                  <span className="truncate">{tApp(level.labelKey)}</span>
                </span>
                <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <span
                    className={`block h-full rounded-full ${level.bar}`}
                    style={{ width: `${Math.max(2, (count / total) * 100)}%` }}
                  />
                </span>
                <span className="text-right text-footnote font-semibold tabular-nums">{count}</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 border-t border-border pt-3">
            {weak.length > 0 ? (
              <>
                <p className="mb-1.5 text-footnote font-semibold">
                  {t("bWeak")}{" "}
                  <span className="font-normal text-muted-foreground">
                    {t("words", { n: weak.length })}
                  </span>
                </p>
                <div className="flex flex-wrap gap-x-1.5 gap-y-2.5">
                  {weak.slice(0, WEAK_CHIPS).map((w) => (
                    <WordChip key={w.sticker_id} word={w} onOpen={onOpenWord} />
                  ))}
                  {weak.length > WEAK_CHIPS && (
                    <span className="inline-flex min-h-8 items-center px-1 text-footnote text-muted-foreground">
                      {t("more", { n: weak.length - WEAK_CHIPS })}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-caption text-muted-foreground">{t("tapWord")}</p>
              </>
            ) : (
              <p className="text-footnote text-muted-foreground">{t("bNoWeak")}</p>
            )}
          </div>
        </DesignCard>
      )}
    </div>
  );
}
