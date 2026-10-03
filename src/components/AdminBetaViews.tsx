/**
 * **ベータの指標**（開発者だけ、`/admin/beta`。ロードマップ Phase 9.4 / 11、2026-10-03）。
 *
 * 2〜4 週・10〜30 人のベータで次を答えるための画面:
 * - 新しく来た人のうち、何人がチュートリアルを終え、登録したか（ファネル）
 * - 誰が 1 日後・7 日後・30 日後に戻ったか（継続）
 * - 使っている人は週に何枚撮り、何問復習するか（使い方）
 * - 1 人あたり AI と音声にいくらかかるか（費用、推定）
 * - 最初のキャッチの解析はどのくらい成功し、どのくらい待たせるか（解析の確かさ）
 * - 撮る道の4つの待ち時間（p50/p90/p99）と、写真の候補の Top-1 / Top-3（2026-10-03）
 * - North-star「覚えている語 / 週」と 1 人あたりの AI 費用、記憶の見込みの較正（同日）
 *
 * 数はサーバ（`beta-metrics.functions.ts`）で作り、画面は描くだけ（`beta-metrics.ts`）。
 * 確認用ページの `admin-beta` の場面が、決まった見本の数で同じ部品を描く。
 * route のファイルからは `Route` だけを出す（グラフの部品を最初の塊に入れないため）。
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import {
  BarChart3,
  Brain,
  Coins,
  Filter,
  Gauge,
  Repeat,
  Sparkles,
  Star,
  Target,
  Timer,
} from "lucide-react";
import { getBetaMetrics, setBetaUnitCosts } from "@/lib/beta-metrics.functions";
import {
  BETA_WINDOWS,
  DEFAULT_UNIT_COST_USD,
  type BetaMetrics,
  type BetaWindow,
  type RetentionCell,
} from "@/lib/beta-metrics";
import type { CalibrationReport } from "@/lib/calibration";
import { LATENCY_EVENTS } from "@/lib/funnel-events";
import { md } from "@/lib/admin-user-stats";
import { useUiLang, type UiLang } from "@/lib/i18n";
import { ColumnChart, Kpi, RangeTabs } from "@/components/AdminCharts";
import {
  betaLabels,
  MEMBER_EVENT_LABELS,
  SIGNUP_STAGE_LABELS,
  TUTORIAL_STEP_LABELS,
} from "./admin-beta-labels";

const usd = (n: number | null | undefined, digits = 2) =>
  n == null ? "—" : `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(digits)}`;
const sec = (ms: number | null | undefined) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`);
const pctText = (p: number | null | undefined) => (p == null ? "—" : `${p}%`);
const num = (n: number | null | undefined, digits = 3) => (n == null ? "—" : n.toFixed(digits));
const ratio = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);

function Section({
  icon,
  title,
  note,
  children,
}: {
  icon: ReactNode;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-1 flex items-center gap-1.5 text-body font-semibold">
        {icon} {title}
      </h2>
      {note && <p className="mb-3 text-caption text-muted-foreground">{note}</p>}
      <div className={note ? "" : "mt-2"}>{children}</div>
    </section>
  );
}

/** 段ごとの横棒。数と「最初の段から何 %」を字で出す（触らなくても読める）。 */
function FunnelBars({
  rows,
  ofFirst,
  empty,
}: {
  rows: Array<{ key: string; label: string; n: number }>;
  ofFirst: string;
  empty: string;
}) {
  const first = rows[0]?.n ?? 0;
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (rows.every((r) => r.n === 0))
    return <p className="text-footnote text-muted-foreground">{empty}</p>;
  return (
    <ol className="m-0 grid list-none gap-2 p-0">
      {rows.map((r, i) => {
        const prev = i > 0 ? rows[i - 1].n : null;
        return (
          <li key={r.key} className="grid gap-1" data-funnel-step={r.key}>
            <div className="flex items-baseline justify-between gap-2 text-footnote">
              <span className="min-w-0 truncate">{r.label}</span>
              <span className="shrink-0 tabular-nums">
                <b>{r.n}</b>
                <span className="ml-1.5 text-caption text-muted-foreground">
                  {first > 0 ? `${Math.round((100 * r.n) / first)}% ${ofFirst}` : "—"}
                  {prev != null && prev > 0 ? ` · ${Math.round((100 * r.n) / prev)}%↓` : ""}
                </span>
              </span>
            </div>
            <span className="block h-2 overflow-hidden rounded-full bg-secondary">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${(r.n / max) * 100}%`, minWidth: r.n ? 4 : 0 }}
              />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function RetentionText({ cell }: { cell: RetentionCell }) {
  return (
    <span className="tabular-nums">
      {pctText(cell.pct)}
      {cell.eligible > 0 && (
        <span className="ml-1 text-caption text-muted-foreground">
          {cell.kept}/{cell.eligible}
        </span>
      )}
    </span>
  );
}

const TH = "pb-2 pr-2 font-medium";
const TD = "py-1.5 pr-2 tabular-nums";

export function BetaDashboardView({
  data,
  lang,
  initialWindow = 30,
  onSaveCosts,
}: {
  data: BetaMetrics;
  lang?: UiLang;
  initialWindow?: BetaWindow;
  onSaveCosts?: (costs: Record<string, number>) => Promise<void>;
}) {
  const uiLang = useUiLang();
  const L = lang ?? uiLang;
  const lb = betaLabels(L);
  const [w, setW] = useState<BetaWindow>(initialWindow);
  const acc = data.candidateAccuracy[w];
  const rel = data.reliability.filter((r) => r.window === w);
  const sourceLabel = (s: string) =>
    s === "member" ? lb("member") : s === "guest" ? lb("guest") : lb("all");

  return (
    <div className="space-y-4" data-beta-dashboard="">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-title font-semibold tracking-tight">
          <BarChart3 className="h-5 w-5 text-primary" /> {lb("title")}
        </h1>
        <Link to="/admin/metrics" className="text-footnote text-primary underline">
          {lb("toKpi")}
        </Link>
      </div>
      <p className="rounded-xl bg-secondary/60 p-3 text-caption text-muted-foreground">
        {lb("privacy")}
      </p>
      {data.truncated && (
        <p className="rounded-xl bg-destructive/10 p-3 text-caption text-destructive">
          {lb("truncated")}
        </p>
      )}
      <RangeTabs
        value={w}
        options={[...BETA_WINDOWS]}
        onChange={setW}
        label={lb("window")}
        fmt={(v) => `${v}${lb("days")}`}
      />

      <Section icon={<Filter className="h-4 w-4 text-primary" />} title={lb("funnel")}>
        <h3 className="mb-2 text-footnote font-semibold">{lb("tutorialFunnel")}</h3>
        <FunnelBars
          rows={data.tutorial.map((r) => ({
            key: r.step,
            label: TUTORIAL_STEP_LABELS[r.step][L],
            n: r.sessions[w],
          }))}
          ofFirst={lb("ofFirst")}
          empty={lb("noData")}
        />
        <h3 className="mb-2 mt-5 text-footnote font-semibold">{lb("signupFunnel")}</h3>
        <FunnelBars
          rows={data.signup.map((r) => ({
            key: r.stage,
            label: SIGNUP_STAGE_LABELS[r.stage][L],
            n: r.users[w],
          }))}
          ofFirst={lb("ofFirst")}
          empty={lb("noData")}
        />
        <h3 className="mb-2 mt-5 text-footnote font-semibold">{lb("memberFunnel")}</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[300px] text-left text-footnote">
            <tbody>
              {data.memberEvents.map((e) => (
                <tr key={e.kind} className="border-t border-border/60">
                  <td className="py-1.5 pr-2">{MEMBER_EVENT_LABELS[e.kind][L]}</td>
                  <td className={`${TD} text-right`}>
                    <b>{e.users[w]}</b>
                    <span className="ml-1 text-caption text-muted-foreground">{lb("users")}</span>
                  </td>
                  <td className={`${TD} text-right`}>
                    {e.events[w]}
                    <span className="ml-1 text-caption text-muted-foreground">{lb("events")}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        icon={<Timer className="h-4 w-4 text-primary" />}
        title={lb("latency")}
        note={lb("latencyNote")}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[340px] text-left text-footnote" data-beta-latency="">
            <thead className="text-muted-foreground">
              <tr>
                <th className={TH}>{lb("latencyStep")}</th>
                <th className={`${TH} text-right`}>n</th>
                <th className={`${TH} text-right`}>p50</th>
                <th className={`${TH} text-right`}>p90</th>
                <th className={`${TH} text-right`}>p99</th>
              </tr>
            </thead>
            <tbody>
              {LATENCY_EVENTS.map((ev) => {
                const st = data.latency[ev][w];
                return (
                  <tr key={ev} className="border-t border-border/60">
                    <td className="py-1.5 pr-2">{LATENCY_LABELS[ev][L]}</td>
                    <td className={`${TD} text-right`}>{st.n}</td>
                    <td className={`${TD} text-right font-semibold`}>{sec(st.p50)}</td>
                    <td className={`${TD} text-right`}>{sec(st.p90)}</td>
                    <td className={`${TD} text-right`}>{sec(st.p99)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        icon={<Target className="h-4 w-4 text-primary" />}
        title={lb("accuracy")}
        note={lb("accuracyNote")}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-beta-accuracy="">
          <Kpi label="Top-1" value={pctText(acc.top1Pct)} sub={`${acc.top1}/${acc.n}`} />
          <Kpi label="Top-3" value={pctText(acc.top3Pct)} sub={`${acc.top3}/${acc.n}`} />
          <Kpi
            label={lb("nativeSearch")}
            value={pctText(acc.nativeSearchPct)}
            sub={`${acc.nativeSearch}/${acc.n}`}
          />
          <Kpi
            label={lb("picks")}
            value={acc.photoPicks}
            sub={acc.medianCandidates == null ? undefined : `n̄=${acc.medianCandidates}`}
          />
        </div>
      </Section>

      <Section
        icon={<Star className="h-4 w-4 text-primary" />}
        title={lb("northStar")}
        note={lb("northStarNote").replace("{target}", String(data.northStar.targetPct))}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-footnote" data-beta-north-star="">
            <thead className="text-muted-foreground">
              <tr>
                <th className={TH}>{lb("week")}</th>
                <th className={TH}>{lb("activeUsers")}</th>
                <th className={TH}>{lb("retainedWords")}</th>
                <th className={TH}>{lb("retainedPerUser")}</th>
                <th className={TH}>{lb("aiPerUserWeek")}</th>
              </tr>
            </thead>
            <tbody>
              {data.northStar.weeks.map((r) => (
                <tr key={r.from} className="border-t border-border/60">
                  <td className={TD}>
                    {md(r.from)}–{md(r.to)}
                  </td>
                  <td className={TD}>{r.activeUsers}</td>
                  <td className={TD}>{r.retainedWords}</td>
                  <td className={TD}>
                    <b>{r.perActiveUser ?? "—"}</b>
                    {r.medianPerActiveUser != null && (
                      <span className="ml-1 text-caption text-muted-foreground">
                        {lb("median")} {r.medianPerActiveUser}
                      </span>
                    )}
                  </td>
                  <td className={TD}>
                    {usd(r.aiUsdPerActiveUser, 3)}
                    <span className="ml-1 text-caption text-muted-foreground">
                      ({usd(r.aiUsd)})
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        icon={<Repeat className="h-4 w-4 text-primary" />}
        title={lb("retention")}
        note={lb("retentionNote")}
      >
        <div className="grid grid-cols-3 gap-2">
          {(["d1", "d7", "d30"] as const).map((k) => (
            <Kpi
              key={k}
              label={k.toUpperCase()}
              value={<RetentionText cell={data.retention.exact[k]} />}
              sub={`${pctText(data.retention.onOrAfter[k].pct)} ${lb("orLater")}`}
            />
          ))}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-footnote">
            <thead className="text-muted-foreground">
              <tr>
                <th className={TH}>{lb("signupDay")}</th>
                <th className={TH}>{lb("newUsers")}</th>
                <th className={TH}>D1</th>
                <th className={TH}>D7</th>
                <th className={TH}>D30</th>
              </tr>
            </thead>
            <tbody>
              {data.retention.cohorts.map((c) => (
                <tr key={c.day} className="border-t border-border/60">
                  <td className={TD}>{md(c.day)}</td>
                  <td className={TD}>{c.users}</td>
                  <td className={TD}>
                    <RetentionText cell={c.d1} />
                  </td>
                  <td className={TD}>
                    <RetentionText cell={c.d7} />
                  </td>
                  <td className={TD}>
                    <RetentionText cell={c.d30} />
                  </td>
                </tr>
              ))}
              {data.retention.cohorts.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-muted-foreground">
                    {lb("noData")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section icon={<Sparkles className="h-4 w-4 text-primary" />} title={lb("engagement")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[380px] text-left text-footnote">
            <thead className="text-muted-foreground">
              <tr>
                <th className={TH}>{lb("week")}</th>
                <th className={TH}>{lb("activeUsers")}</th>
                <th className={TH}>{lb("catchesPerActive")}</th>
                <th className={TH}>{lb("reviewsPerActive")}</th>
                <th className={TH}>{lb("reviewSessionMin")}</th>
              </tr>
            </thead>
            <tbody>
              {data.engagement.map((e) => (
                <tr key={e.from} className="border-t border-border/60">
                  <td className={TD}>
                    {md(e.from)}–{md(e.to)}
                  </td>
                  <td className={TD}>{e.activeUsers}</td>
                  <td className={TD}>
                    {e.catchesPerActive ?? "—"}
                    <span className="ml-1 text-caption text-muted-foreground">({e.catches})</span>
                  </td>
                  <td className={TD}>
                    {e.reviewsPerActive ?? "—"}
                    <span className="ml-1 text-caption text-muted-foreground">({e.reviews})</span>
                  </td>
                  <td className={TD}>
                    {e.medianReviewSessionMin == null
                      ? "—"
                      : `${e.medianReviewSessionMin}${lb("minutes")}`}
                    {e.reviewSessions > 0 && (
                      <span className="ml-1 text-caption text-muted-foreground">
                        n={e.reviewSessions}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        icon={<Coins className="h-4 w-4 text-primary" />}
        title={lb("cost")}
        note={lb("costNote")}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label={lb("perActiveMonth")} value={usd(data.cost.perActiveUserMonthUsd, 3)} />
          <Kpi label={lb("cost30")} value={usd(data.cost.totalUsd)} sub={lb("estimate")} />
          <Kpi label={lb("active30")} value={data.cost.activeUsers30} />
          <Kpi
            label={lb("guestCost")}
            value={usd(data.cost.guestUsd)}
            sub={`${lb("excludedCost")}: ${usd(data.cost.excludedUsd)}`}
          />
        </div>
        <div className="mt-3">
          <ColumnChart
            data={data.cost.days.map((d) => ({ x: d.day, usd: d.usd, note: `${d.calls}` }))}
            series={[{ key: "usd", label: lb("estimate"), color: "var(--primary)" }]}
            title={lb("dailyCost")}
            fmt={(n) => usd(n)}
          />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-footnote">
            <thead className="text-muted-foreground">
              <tr>
                <th className={TH}>{lb("kind")}</th>
                <th className={`${TH} text-right`}>{lb("calls")}</th>
                <th className={`${TH} text-right`}>{lb("unit")}</th>
                <th className={`${TH} text-right`}>{lb("estimate")}</th>
              </tr>
            </thead>
            <tbody>
              {data.cost.byKind.map((k) => (
                <tr key={k.key} className="border-t border-border/60">
                  <td className="py-1.5 pr-2 font-mono text-caption">{k.key}</td>
                  <td className={`${TD} text-right`}>{k.calls}</td>
                  <td className={`${TD} text-right`}>{usd(k.unit, 4)}</td>
                  <td className={`${TD} text-right font-semibold`}>{usd(k.usd)}</td>
                </tr>
              ))}
              {data.cost.byKind.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-muted-foreground">
                    {lb("noData")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {onSaveCosts && (
          <UnitCostEditor costs={data.cost.unitCosts} onSave={onSaveCosts} lang={L} />
        )}
      </Section>

      <Section
        icon={<Brain className="h-4 w-4 text-primary" />}
        title={lb("calibration")}
        note={lb("calibrationNote")}
      >
        {data.calibration.n === 0 ? (
          <p className="text-footnote text-muted-foreground">{lb("noData")}</p>
        ) : (
          <CalibrationView
            scheduler={data.calibration.scheduler}
            jev={data.calibration.jev}
            models={data.calibration.models}
            lang={L}
          />
        )}
      </Section>

      <Section
        icon={<Gauge className="h-4 w-4 text-primary" />}
        title={lb("reliability")}
        note={lb("reliabilityNote")}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[340px] text-left text-footnote">
            <thead className="text-muted-foreground">
              <tr>
                <th className={TH}>{lb("source")}</th>
                <th className={`${TH} text-right`}>{lb("runs")}</th>
                <th className={`${TH} text-right`}>{lb("success")}</th>
                <th className={`${TH} text-right`}>p50</th>
                <th className={`${TH} text-right`}>p90</th>
              </tr>
            </thead>
            <tbody>
              {rel.map((r) => (
                <tr key={`${r.source}:${r.action}`} className="border-t border-border/60">
                  <td className="py-1.5 pr-2">
                    {r.action === "all" ? sourceLabel(r.source) : r.action}
                  </td>
                  <td className={`${TD} text-right`}>{r.n}</td>
                  <td className={`${TD} text-right font-semibold`}>{pctText(r.pct)}</td>
                  <td className={`${TD} text-right`}>{sec(r.p50)}</td>
                  <td className={`${TD} text-right`}>{sec(r.p90)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

/** 撮る道の4つの待ち時間の名前（QA.md › Performance checks）。 */
const LATENCY_LABELS: Record<(typeof LATENCY_EVENTS)[number], Record<UiLang, string>> = {
  candidates_shown: {
    ja: "撮影 → 候補が並ぶ",
    en: "Capture → candidates shown",
    "zh-TW": "拍照 → 顯示候選字",
  },
  meaning_shown: {
    ja: "候補を選ぶ → 意味が出る",
    en: "Selection → usable meaning",
    "zh-TW": "選擇 → 顯示字義",
  },
  first_audio_played: {
    ja: "発音を頼む → 最初の音",
    en: "Request → first audio",
    "zh-TW": "要求 → 第一個聲音",
  },
  catch_saved: {
    ja: "図鑑に追加 → 保存完了",
    en: "Catch → persisted",
    "zh-TW": "加入圖鑑 → 儲存完成",
  },
};

/** 復習の式と Jev の較正を並べる（数は `calibration.ts`）。 */
function CalibrationView({
  scheduler,
  jev,
  models,
  lang,
}: {
  scheduler: CalibrationReport;
  jev: CalibrationReport;
  models: string[];
  lang: UiLang;
}) {
  const lb = betaLabels(lang);
  return (
    <div className="space-y-3" data-beta-calibration="">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] text-left text-footnote">
          <thead className="text-muted-foreground">
            <tr>
              <th className={TH} />
              <th className={`${TH} text-right`}>n</th>
              <th className={`${TH} text-right`}>Brier</th>
              <th className={`${TH} text-right`}>Log loss</th>
              <th className={`${TH} text-right`}>ECE</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                [lb("scheduler"), scheduler],
                [lb("jev"), jev],
              ] as const
            ).map(([name, r]) => (
              <tr key={name} className="border-t border-border/60">
                <td className="py-1.5 pr-2">{name}</td>
                <td className={`${TD} text-right`}>{r.n}</td>
                <td className={`${TD} text-right font-semibold`}>{num(r.brier)}</td>
                <td className={`${TD} text-right`}>{num(r.logLoss)}</td>
                <td className={`${TD} text-right`}>{num(r.ece)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-caption text-muted-foreground">
        {lb("baseRate")}: {ratio(scheduler.baseRate)}
        {models.length > 0 && ` · ${models.join(", ")}`}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] text-left text-footnote">
          <thead className="text-muted-foreground">
            <tr>
              <th className={TH}>{lb("bin")}</th>
              <th className={`${TH} text-right`}>{lb("scheduler")}</th>
              <th className={`${TH} text-right`}>{lb("jev")}</th>
            </tr>
          </thead>
          <tbody>
            {scheduler.bins.map((b, i) => {
              const j = jev.bins[i];
              const cell = (x: typeof b | undefined) =>
                !x || x.n === 0 ? "—" : `${ratio(x.observed)} (n=${x.n})`;
              return (
                <tr key={b.lo} className="border-t border-border/60">
                  <td className={TD}>
                    {Math.round(b.lo * 100)}–{Math.round(b.hi * 100)}%
                  </td>
                  <td className={`${TD} text-right`}>{cell(b)}</td>
                  <td className={`${TD} text-right`}>{cell(j)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-caption text-muted-foreground">
        {lb("bin")} → {lb("observed")}
      </p>
    </div>
  );
}

function UnitCostEditor({
  costs,
  onSave,
  lang,
}: {
  costs: Record<string, number>;
  onSave: (costs: Record<string, number>) => Promise<void>;
  lang: UiLang;
}) {
  const lb = betaLabels(lang);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, String(v)])),
  );
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const keys = Object.keys(DEFAULT_UNIT_COST_USD).sort();
  const save = async () => {
    const parsed: Record<string, number> = {};
    for (const k of keys) {
      const v = Number(draft[k]);
      if (Number.isFinite(v) && v >= 0 && v <= 10) parsed[k] = v;
    }
    setState("saving");
    try {
      await onSave(parsed);
      setState("saved");
    } catch {
      setState("failed");
    }
  };
  return (
    <details className="mt-3 rounded-xl bg-secondary/40 p-3">
      <summary className="min-h-11 cursor-pointer text-footnote font-semibold leading-[44px]">
        {lb("editCosts")}
      </summary>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {keys.map((k) => (
          <label key={k} className="flex items-center justify-between gap-2 text-footnote">
            <span className="min-w-0 truncate font-mono text-caption">{k}</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.0001"
              min={0}
              max={10}
              value={draft[k] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
              className="h-11 w-28 rounded-lg border border-border bg-background px-2 text-right tabular-nums"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={state === "saving"}
          className="min-h-11 rounded-xl bg-primary px-4 text-footnote font-semibold text-primary-foreground"
        >
          {lb("save")}
        </button>
        {state === "saved" && <span className="text-caption">{lb("saved")}</span>}
        {state === "failed" && (
          <span className="text-caption text-destructive">{lb("saveFailed")}</span>
        )}
      </div>
    </details>
  );
}

/** 本物の画面: サーバから数を読んで描く。 */
export function BetaDashboard() {
  const lang = useUiLang();
  const lb = betaLabels(lang);
  const fetchFn = useServerFn(getBetaMetrics);
  const saveFn = useServerFn(setBetaUnitCosts);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-beta-metrics"],
    queryFn: () => fetchFn(),
    staleTime: 60_000,
  });
  if (isError)
    return (
      <div className="space-y-3 text-body">
        <p>{lb("failed")}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="min-h-11 rounded-xl bg-secondary px-4 text-footnote font-semibold"
        >
          {lb("retry")}
        </button>
      </div>
    );
  if (isLoading || !data)
    return (
      <div className="space-y-3" aria-busy="true">
        <p className="text-footnote text-muted-foreground">{lb("loading")}</p>
        <div className="h-48 animate-pulse rounded-2xl bg-secondary" />
        <div className="h-48 animate-pulse rounded-2xl bg-secondary" />
      </div>
    );
  return (
    <BetaDashboardView
      data={data}
      lang={lang}
      onSaveCosts={async (costs) => {
        await saveFn({ data: { costs } });
        await refetch();
      }}
    />
  );
}
