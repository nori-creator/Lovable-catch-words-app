import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useReadableError } from "@/lib/errors";
import { useT } from "@/lib/i18n";
import { AI_FEATURES, AUTO } from "@/lib/ai-features";
import {
  AI_STATS_DAYS,
  type AiModelStat,
  type AiModelStatsReport,
  type AiStatsDays,
  type AiTaskStats,
} from "@/lib/ai-model-stats";
import {
  AI_TEST_LANGUAGES,
  AI_TEST_PHOTOS,
  aiTestPhotoPath,
  type AiTestLanguage,
} from "@/lib/ai-test-photos";
import type { AdminAiSettings } from "@/lib/admin-ai.server";
import { DEFAULT_TARGET_LANGUAGE } from "@/lib/target-lang";

/**
 * **「AI の設定（開発者）」の速さと正確さ**（オーナー依頼 2026-10-11「開発者の設定から、それぞれの
 * 機能で使う AI を切り替えたときの結果を計測し、分析できるようにして」）。
 *
 * - 上: 実際に使われた分（機能 → 用途 → モデル）。モデルを切り替えると行が増え、前後を見比べられる。
 *   数え方は `ai-model-stats.ts`。
 * - 下: 固定の写真で試す。本番を切り替えずに、選んだモデルに正解の付いた写真を流す
 *   （`adminTestPhotoCandidates`）。
 *
 * 道具（`actions`）を受け取るだけなので、見本（`scripts/ui-harness`）からも描ける。
 */

type ReadyData = Extract<AdminAiSettings, { isAdmin: true }>;

export type AiStatsResult =
  { isAdmin: false } | ({ isAdmin: true; truncated: boolean } & AiModelStatsReport);

export type AiTestPhotoResult = {
  ok: boolean;
  ms: number;
  model: string;
  /** `thinking-off` = Claude に考えさせない呼び方で測った。 */
  variant: string | null;
  rank: number | null;
  heads: string[];
  want: string;
  code: string | null;
};

export type AiStatsActions = {
  getStats: (input: { days: AiStatsDays; mine: boolean }) => Promise<AiStatsResult>;
  testPhoto?: (input: {
    value: string;
    photo: string;
    targetLanguage: AiTestLanguage;
    /** `"off"` = Claude に考えさせない（Claude 以外は無視される）。 */
    thinking: "default" | "off";
    imageBase64: string;
  }) => Promise<AiTestPhotoResult>;
};

const selectCls =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 text-field disabled:opacity-60";

/** 秒（小数1桁）。 */
const sec = (ms: number | null) => (ms == null ? "—" : (ms / 1000).toFixed(1));
const usd = (v: number | null) =>
  v == null ? null : v >= 0.01 ? v.toFixed(3) : v >= 0.0001 ? v.toFixed(4) : v.toExponential(1);
const int = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString());

/** 機能の「いま」の `会社:モデル`（表の行に「いま」を付ける）。 */
function currentModels(data: ReadyData): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of data.features)
    if (f.provider && (f.resolved ?? f.model))
      m.set(f.id, `${f.provider}:${f.resolved ?? f.model}`);
  return m;
}

export function AiStatsSection({ data, actions }: { data: ReadyData; actions: AiStatsActions }) {
  const t = useT();
  const [days, setDays] = useState<AiStatsDays>(7);
  const [mine, setMine] = useState(false);
  const [report, setReport] = useState<AiStatsResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setFailed(false);
    try {
      const r = await actions.getStats({ days, mine });
      if (id === seq.current) setReport(r);
    } catch {
      if (id === seq.current) setFailed(true);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [actions, days, mine]);

  useEffect(() => {
    void load();
  }, [load]);

  const ready = report && report.isAdmin ? report : null;
  const current = currentModels(data);
  const byFeature = AI_FEATURES.map((f) => ({
    id: f.id,
    labelKey: f.labelKey,
    tasks: ready?.tasks.filter((x) => x.feature === f.id) ?? [],
  })).filter((g) => g.tasks.length > 0);
  const others = ready?.tasks.filter((x) => !x.feature) ?? [];

  return (
    <section className="space-y-2" aria-label={t("aiStats.heading")} data-ai-stats="">
      <div>
        <h3 className="text-footnote font-semibold label-caps text-muted-foreground">
          {t("aiStats.heading")}
        </h3>
        <p className="mt-0.5 text-caption leading-snug text-muted-foreground">
          {t("aiStats.note")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label={t("aiStats.period")}>
          {AI_STATS_DAYS.map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={d === days ? "default" : "outline"}
              aria-pressed={d === days}
              onClick={() => setDays(d)}
            >
              {t("aiStats.days", { n: String(d) })}
            </Button>
          ))}
        </div>
        <label className="flex min-h-11 items-center gap-2 text-caption">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          {t("aiStats.mine")}
        </label>
      </div>

      {failed ? (
        <p className="text-caption text-destructive-ink">{t("aiStats.loadFailed")}</p>
      ) : !ready ? (
        <p className="text-caption text-muted-foreground">{t("aiSet.loading")}</p>
      ) : (
        <div className={`space-y-3 ${loading ? "opacity-60" : ""}`}>
          {ready.truncated && (
            <p className="text-caption text-muted-foreground">{t("aiStats.truncated")}</p>
          )}
          {byFeature.length === 0 && others.length === 0 && (
            <p className="text-caption text-muted-foreground">{t("aiStats.empty")}</p>
          )}
          {byFeature.map((g) => (
            <div key={g.id} className="space-y-2" data-ai-stats-feature={g.id}>
              <p className="text-footnote font-semibold">{t(g.labelKey)}</p>
              {g.tasks.map((task) => (
                <TaskBlock key={task.task} task={task} current={current.get(g.id) ?? null} />
              ))}
            </div>
          ))}
          {others.length > 0 && (
            <div className="space-y-2">
              <p className="text-footnote font-semibold">{t("aiStats.other")}</p>
              {others.map((task) => (
                <TaskBlock key={task.task} task={task} current={null} />
              ))}
            </div>
          )}
          <TestResults report={ready} />
        </div>
      )}

      {actions.testPhoto && (
        <TestPanel data={data} run={actions.testPhoto} onDone={() => void load()} />
      )}
    </section>
  );
}

function TaskBlock({ task, current }: { task: AiTaskStats; current: string | null }) {
  const t = useT();
  return (
    <div className="rounded-xl border border-border p-2.5" data-ai-stats-task={task.task}>
      <p className="text-caption font-semibold">
        {t(`aiStats.task.${task.task}`) === `aiStats.task.${task.task}`
          ? task.task
          : t(`aiStats.task.${task.task}`)}
      </p>
      <div className="mt-1.5 space-y-2">
        {task.models.map((m) => (
          <ModelRow key={m.model} m={m} isCurrent={m.model === current} />
        ))}
      </div>
    </div>
  );
}

function ModelRow({ m, isCurrent }: { m: AiModelStat; isCurrent: boolean }) {
  const t = useT();
  const cost = usd(m.costUsd);
  return (
    <div className="space-y-0.5 text-caption leading-snug">
      <p className="break-all font-semibold">
        {m.model}
        {isCurrent && (
          <span className="ml-1.5 inline-block whitespace-nowrap rounded-full bg-primary/15 px-1.5 py-0.5 text-[0.7rem] font-semibold text-primary">
            {t("aiStats.current")}
          </span>
        )}
      </p>
      {m.calls > 0 && (
        <p className="text-muted-foreground tabular-nums">
          {t("aiStats.speed", {
            n: String(m.calls),
            ok: m.okPct == null ? "—" : String(m.okPct),
            p50: sec(m.p50),
            p90: sec(m.p90),
          })}
          {m.timeouts > 0 && ` · ${t("aiStats.timeouts", { n: String(m.timeouts) })}`}
          {m.failed > 0 && ` · ${t("aiStats.failed", { n: String(m.failed) })}`}
          {m.cancelled > 0 && ` · ${t("aiStats.cancelled", { n: String(m.cancelled) })}`}
        </p>
      )}
      {m.picks && (
        <p className="tabular-nums">
          {t("aiStats.picks", {
            top1: m.picks.top1Pct == null ? "—" : String(m.picks.top1Pct),
            top3: m.picks.top3Pct == null ? "—" : String(m.picks.top3Pct),
            n: String(m.picks.n),
          })}
        </p>
      )}
      {m.unusable && (
        <p className="tabular-nums">
          {t("aiStats.unusable", {
            p: m.unusable.pct == null ? "—" : String(m.unusable.pct),
            n: String(m.unusable.n),
            of: String(m.unusable.of),
          })}
        </p>
      )}
      {(m.avgIn != null || cost) && (
        <p className="text-muted-foreground tabular-nums">
          {cost && `${t("aiStats.cost", { c: cost })} · `}
          {t("aiStats.tokens", { i: int(m.avgIn), o: int(m.avgOut) })}
        </p>
      )}
    </div>
  );
}

function TestResults({ report }: { report: AiModelStatsReport }) {
  const t = useT();
  if (report.tests.length === 0) return null;
  return (
    <div className="space-y-2" data-ai-stats-tests="">
      <p className="text-footnote font-semibold">{t("aiStats.testsHeading")}</p>
      {report.tests.map((x) => {
        const cost = usd(x.costUsd);
        return (
          <div
            key={`${x.task}:${x.model}:${x.variant ?? ""}`}
            className="rounded-xl border border-border p-2.5"
          >
            <p className="break-all text-caption font-semibold">
              {x.model}
              {x.variant && ` · ${t(`aiStats.variant.${x.variant}`)}`}
            </p>
            <p className="text-caption tabular-nums">
              {t("aiStats.testScore", {
                top1: x.top1Pct == null ? "—" : String(x.top1Pct),
                top3: x.top3Pct == null ? "—" : String(x.top3Pct),
                n: String(x.n),
              })}
            </p>
            <p className="text-caption text-muted-foreground tabular-nums">
              {t("aiStats.testSpeed", { p50: sec(x.p50), p90: sec(x.p90) })}
              {cost && ` · ${t("aiStats.cost", { c: cost })}`}
            </p>
          </div>
        );
      })}
    </div>
  );
}

type LiveResult = { photo: string; result: AiTestPhotoResult | null; error: string | null };

async function photoDataUrl(id: string): Promise<string> {
  const res = await fetch(aiTestPhotoPath(id));
  if (!res.ok) throw new Error(`photo ${id}: ${res.status}`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

/** 一度に流す枚数（無料枠の1分あたりの上限に当たりにくい数）。 */
const TEST_PARALLEL = 2;

function TestPanel({
  data,
  run,
  onDone,
}: {
  data: ReadyData;
  run: NonNullable<AiStatsActions["testPhoto"]>;
  onDone: () => void;
}) {
  const t = useT();
  const readable = useReadableError();
  const [value, setValue] = useState(AUTO);
  const [lang, setLang] = useState<AiTestLanguage>(DEFAULT_TARGET_LANGUAGE);
  const [noThinking, setNoThinking] = useState(false);
  // Claude 5（Opus 5 系は考える量を切れないので除く）を選んだ時だけ「考えさせない」を選べる。
  const claude = /^anthropic:claude-(?!opus-5)/.test(value);
  const [live, setLive] = useState<LiveResult[]>([]);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);

  async function start() {
    stop.current = false;
    setRunning(true);
    setLive([]);
    const queue = [...AI_TEST_PHOTOS];
    const worker = async () => {
      for (let p = queue.shift(); p && !stop.current; p = queue.shift()) {
        const photo = p;
        try {
          const imageBase64 = await photoDataUrl(photo.id);
          const result = await run({
            value,
            photo: photo.id,
            targetLanguage: lang,
            thinking: claude && noThinking ? "off" : "default",
            imageBase64,
          });
          setLive((l) => [...l, { photo: photo.id, result, error: null }]);
        } catch (e) {
          setLive((l) => [...l, { photo: photo.id, result: null, error: readable(e, "error") }]);
          // 上限・権限の失敗は、残りを流しても同じなので止める。
          if (/AI_TEST_DAILY_LIMIT|Forbidden|鍵/.test(String((e as Error)?.message)))
            stop.current = true;
        }
      }
    };
    await Promise.all(Array.from({ length: TEST_PARALLEL }, worker));
    setRunning(false);
    onDone();
  }

  const done = live.filter((x) => x.result);
  const top1 = done.filter((x) => x.result!.rank === 1).length;
  const top3 = done.filter((x) => x.result!.rank != null && x.result!.rank <= 3).length;

  return (
    <div className="space-y-2 rounded-xl border border-border p-2.5" data-ai-test="">
      <p className="text-footnote font-semibold">{t("aiStats.testHeading")}</p>
      <p className="text-caption leading-snug text-muted-foreground">
        {t("aiStats.testNote", { n: String(AI_TEST_PHOTOS.length) })}
      </p>
      <select
        aria-label={t("aiStats.testModel")}
        value={value}
        disabled={running}
        onChange={(e) => setValue(e.target.value)}
        className={selectCls}
      >
        <option value={AUTO}>{t("aiStats.testAuto")}</option>
        {data.providers
          .filter((p) => p.hasKey && p.visionModels.length > 0)
          .map((p) => (
            <optgroup key={p.id} label={p.name}>
              {p.visionModels.map((m) => (
                <option key={m} value={`${p.id}:${m}`}>
                  {m}
                </option>
              ))}
            </optgroup>
          ))}
      </select>
      <select
        aria-label={t("aiStats.testLanguage")}
        value={lang}
        disabled={running}
        onChange={(e) => setLang(e.target.value as AiTestLanguage)}
        className={selectCls}
      >
        {AI_TEST_LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {t(`aiStats.lang.${l}`)}
          </option>
        ))}
      </select>
      {claude && (
        <div>
          <label className="flex min-h-11 items-center gap-2 text-caption">
            <input
              type="checkbox"
              checked={noThinking}
              disabled={running}
              onChange={(e) => setNoThinking(e.target.checked)}
            />
            {t("aiStats.testThinkingOff")}
          </label>
          <p className="text-caption leading-snug text-muted-foreground">
            {t("aiStats.testThinkingNote")}
          </p>
        </div>
      )}
      <div className="flex gap-2">
        <Button type="button" disabled={running} onClick={() => void start()}>
          {running
            ? t("aiStats.testRunning", {
                i: String(live.length),
                n: String(AI_TEST_PHOTOS.length),
              })
            : t("aiStats.testRun")}
        </Button>
        {running && (
          <Button type="button" variant="outline" onClick={() => (stop.current = true)}>
            {t("aiStats.testStop")}
          </Button>
        )}
      </div>
      {live.length > 0 && (
        <div className="space-y-1">
          <p className="text-caption font-semibold tabular-nums" role="status">
            {t("aiStats.testScore", {
              top1: done.length ? String(Math.round((1000 * top1) / live.length) / 10) : "—",
              top3: done.length ? String(Math.round((1000 * top3) / live.length) / 10) : "—",
              n: String(live.length),
            })}
          </p>
          <ul className="max-h-64 space-y-0.5 overflow-y-auto text-caption tabular-nums">
            {live.map((x) => (
              <li key={x.photo} className="break-all">
                {x.result ? (x.result.rank === 1 ? "◎" : x.result.rank ? "○" : "×") : "!"} {x.photo}{" "}
                — {x.result ? (x.result.heads[0] ?? "—") : x.error}
                {x.result && x.result.rank !== 1 && ` (${t("aiStats.testWant")}: ${x.result.want})`}
                {x.result && ` · ${sec(x.result.ms)}s`}
                {x.result?.code && ` · ${x.result.code}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
