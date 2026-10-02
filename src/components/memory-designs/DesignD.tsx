/**
 * 案D「曲線を読みやすく」— **全体の記憶が、これまでとこれからどう動くか**。
 *
 * いまの「全体の記憶率（前後2週間）」は縦軸が 0〜100% なので、94% → 85% の動きが
 * ほぼ平らに見え、線の色も値で塗り分けられていて、何を見ればいいか分からない。ここでは:
 *  ・縦軸を**データのある所**（60%〜100% 前後）に寄せ、背景に**記憶の段の帯**
 *    （はっきり・覚えている・薄れぎみ…）を敷く — 線が「どの段にいるか」で読める。
 *  ・線は2色だけ: これまで = 主色の実線、これから = 灰色の点線 + 「予測」の地。
 *  ・字は今日の値と予測の終わりの値の2つだけ。
 *
 * 畳んだ行は小さな線と1文（recharts は開いた時に読み込む）。
 */
import { Suspense, useMemo } from "react";
import { lazyWithRetry } from "@/lib/chunk-reload";
import { useMemdT } from "./copy";
import { lastForecast, seriesAt } from "./model";
import { DesignCard, SummaryButton, type MemoryDesignProps } from "./shared";
import { useDateOf } from "./hooks";
import { Sparkline } from "./Sparkline";

const CurveChart = lazyWithRetry(() =>
  import("./DesignDChart").then((m) => ({ default: m.DesignDChart })),
);

export function MemoryDesignD({ series, expanded, onToggle, nowMs: fixedNow }: MemoryDesignProps) {
  const t = useMemdT();
  const nowMs = useMemo(() => fixedNow ?? Date.now(), [fixedNow]);
  const dateOf = useDateOf(nowMs);
  const today = seriesAt(series, 0);
  const forecast = lastForecast(series);
  if (today == null) return null;
  return (
    <div>
      <SummaryButton expanded={expanded} onToggle={onToggle}>
        <div className="flex items-center gap-3">
          <Sparkline series={series} height={32} />
          <div className="min-w-0 text-footnote leading-snug">
            <span className="font-semibold">
              {t("today")} {today}%
            </span>
            {forecast && (
              <span className="block truncate text-muted-foreground">
                → {t("dSummary", { date: dateOf(forecast.day), pct: forecast.value })}
              </span>
            )}
          </div>
        </div>
      </SummaryButton>
      {expanded && (
        <DesignCard>
          <p className="text-caption font-semibold label-caps text-muted-foreground">
            {t("dTitle")}
          </p>
          <Suspense fallback={<div className="h-52 w-full" />}>
            <CurveChart series={series} nowMs={nowMs} />
          </Suspense>
          <p className="mt-1 text-caption text-muted-foreground">{t("forecastIfNot")}</p>
          <p className="text-caption text-muted-foreground">{t("dBands")}</p>
        </DesignCard>
      )}
    </div>
  );
}
