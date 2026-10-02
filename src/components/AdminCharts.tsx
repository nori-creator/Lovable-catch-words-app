import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { evenTicks, md, niceTicks } from "@/lib/admin-user-stats";

/**
 * **開発者の画面のグラフ**（オーナー指示 2026-09-28「利用者の情報のページはもっと視覚的に
 * 見やすく、グラフや図チャート、ほかのユーザーとの比較」）。
 *
 * 2026-10-02「チャートやグラフをもっと詳しく、細かく、見やすいように…見づらい」で作り直した。
 * 見づらかった理由は3つ: 縦の目盛りが無く高さが何を表すか読めない、日付が両端にしか無い、
 * 1本ずつの値がスマホでは見られない（`title` はマウスを乗せた時しか出ない）。そこで:
 *
 * - 時系列は `recharts`（アプリが既に使っている）で、縦の目盛り・数日おきの日付・横の薄い線を
 *   付ける。**指で触れた日の値が箱で出る**（触れた所に一番近い日を拾うので細い棒でも当たる）。
 * - 割合や内訳は横棒。名前・数・割合を**字で全部出す**ので、触らなくても読める。
 * - 色はアプリのトークン（`--primary`・`--mem-N` など）だけ。明るい・暗いテーマで値が
 *   入れ替わるので、ここで色を分岐させない。字は色を着けず、色の印を横に置く。
 * - 目盛りの字は 12px（11px はスマホで潰れた）。
 *
 * この画面は開発者（日本語話者）しか見ないので、見出しや単位は呼ぶ側から日本語で渡す。
 */

const compact = (n: number) =>
  Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);

const AXIS = {
  tickLine: false,
  stroke: "var(--muted-foreground)",
  fontSize: 12,
} as const;

export type Series = { key: string; label: string; color: string };
export type ChartRow = {
  /** 横軸の値（日付・時刻・曜日など）。 */
  x: string;
  /** 触れた時の箱の見出し（無ければ `x` を `xLabel` で）。 */
  tip?: string;
  /** 箱の2行目に添える補足（「42回中33回正解」など）。 */
  note?: string;
  /** 1本だけ色を変える（「期限切れ」など）。1系列のグラフだけ。 */
  fill?: string;
  [k: string]: string | number | null | undefined;
};

/** 触れた時の箱。値を太く先に、何の値かは後に（凡例と逆の重み）。 */
function TipBox({
  active,
  payload,
  series,
  fmt,
  xLabel,
  noteKey = "note",
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
  series: Series[];
  fmt: (n: number) => string;
  xLabel: (x: string) => string;
  noteKey?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const note = row[noteKey];
  // 小さく保つ: 同じ日を4つのグラフで一緒に出すので、大きいと棒が隠れる。
  return (
    <div className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-footnote leading-snug text-foreground shadow-lg">
      <div className="text-caption text-muted-foreground">{row.tip ?? xLabel(row.x)}</div>
      {series.map((s) => {
        const v = row[s.key];
        return (
          <div key={s.key} className="flex items-center gap-1.5 tabular-nums">
            {series.length > 1 && (
              <span className="h-[3px] w-3 rounded-full" style={{ background: s.color }} />
            )}
            <b>{typeof v === "number" ? fmt(v) : "—"}</b>
            {series.length > 1 && <span className="text-muted-foreground">{s.label}</span>}
          </div>
        );
      })}
      {typeof note === "string" && <div className="text-caption text-muted-foreground">{note}</div>}
    </div>
  );
}

/** 2系列以上のときの凡例（棒は四角、線は短い線で、グラフの印と同じ形）。 */
function Legend({ series, line = false }: { series: Series[]; line?: boolean }) {
  if (series.length < 2) return null;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-0.5 p-0 text-caption text-muted-foreground">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1">
          <span
            className={line ? "h-[3px] w-3 rounded-full" : "h-2.5 w-2.5 rounded-[3px]"}
            style={{ background: s.color }}
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** グラフの見出し: 左に何のグラフか、右に要約（合計・平均など）。 */
function ChartHead({ title, summary }: { title: string; summary?: ReactNode }) {
  return (
    <figcaption className="flex flex-wrap items-baseline justify-between gap-x-2 text-footnote">
      <span className="font-semibold text-foreground">{title}</span>
      {summary && (
        <span className="text-caption tabular-nums text-muted-foreground">{summary}</span>
      )}
    </figcaption>
  );
}

/**
 * **縦棒のグラフ**（日ごと・時間帯・曜日・予定）。2系列なら積み上げる。
 * `syncId` が同じグラフどうしは、触れた日が一緒に動く（同じ日の撮った数と復習を見比べる）。
 */
export function ColumnChart({
  data,
  series,
  title,
  summary,
  fmt = String,
  xLabel = md,
  ticks,
  height = 132,
  syncId,
  legend,
  noteKey,
}: {
  data: ChartRow[];
  series: Series[];
  title: string;
  summary?: ReactNode;
  fmt?: (n: number) => string;
  xLabel?: (x: string) => string;
  /** 横軸に字を出す値。省くと等間隔に5つ。 */
  ticks?: string[];
  height?: number;
  syncId?: string;
  /** 1本だけ色を変えた時など、系列とは別に凡例を出す。 */
  legend?: Series[];
  /** 触れた時の箱に添える補足の列（既定は `note`）。同じ行を4つのグラフで使う時に分ける。 */
  noteKey?: string;
}) {
  const stacked = series.length > 1;
  const total = (r: ChartRow) => series.reduce((s, x) => s + (Number(r[x.key]) || 0), 0);
  const yTicks = niceTicks(Math.max(0, ...data.map(total)));
  return (
    <figure className="m-0 grid gap-1">
      <ChartHead title={title} summary={summary} />
      <Legend series={legend ?? series} />
      <div
        style={{ height }}
        role="img"
        aria-label={`${title}: ${data.map((r) => `${xLabel(r.x)} ${fmt(total(r))}`).join("、")}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            syncId={syncId}
            // 右の余白: 最後の日（今日）の目盛りの字が欠けないように。
            margin={{ top: 6, right: 16, bottom: 0, left: 0 }}
            barCategoryGap="18%"
          >
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="x"
              {...AXIS}
              axisLine={{ stroke: "var(--border)" }}
              ticks={ticks ?? evenTicks(data.map((r) => r.x))}
              interval={0}
              tickFormatter={xLabel}
              tickMargin={4}
            />
            <YAxis
              {...AXIS}
              axisLine={false}
              width={34}
              ticks={yTicks}
              domain={[0, yTicks[yTicks.length - 1]]}
              interval={0}
              tickFormatter={(v: number) => compact(v)}
            />
            <Tooltip
              cursor={{ fill: "var(--secondary)", opacity: 0.8 }}
              isAnimationActive={false}
              wrapperStyle={{ outline: "none", zIndex: 20 }}
              content={<TipBox series={series} fmt={fmt} xLabel={xLabel} noteKey={noteKey} />}
            />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId={stacked ? "s" : undefined}
                fill={s.color}
                maxBarSize={24}
                isAnimationActive={false}
                // 角を丸めるのは一番上の段の先だけ（下の段まで丸めると、段の境に隙間が見える）。
                radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
              >
                {!stacked && data.map((r) => <Cell key={r.x} fill={r.fill ?? s.color} />)}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/**
 * **折れ線**（週ごとの正答率・答えるまでの秒）。記録の無い週は線を切る（0 と描かない）。
 * 点は最後の週にだけ打つ（26点に全部打つと点が重なって点線に見えた）。触れた週には大きい点。
 * 点は面の色の輪で囲み、線と重なっても読めるようにする。
 */
export function TrendLine({
  data,
  series,
  title,
  summary,
  fmt = String,
  xLabel = md,
  domain,
  yTicks,
  height = 140,
}: {
  data: ChartRow[];
  series: Series;
  title: string;
  summary?: ReactNode;
  fmt?: (n: number) => string;
  xLabel?: (x: string) => string;
  domain?: [number, number];
  yTicks?: number[];
  height?: number;
}) {
  const vals = data.map((r) => r[series.key]).filter((v): v is number => typeof v === "number");
  const ticks = yTicks ?? niceTicks(Math.max(0, ...vals));
  let lastIdx = -1;
  data.forEach((r, i) => {
    if (typeof r[series.key] === "number") lastIdx = i;
  });
  return (
    <figure className="m-0 grid gap-1">
      <ChartHead title={title} summary={summary} />
      <div
        style={{ height }}
        role="img"
        aria-label={`${title}: ${data
          .map(
            (r) =>
              `${r.tip ?? xLabel(r.x)} ${typeof r[series.key] === "number" ? fmt(r[series.key] as number) : "—"}`,
          )
          .join("、")}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="x"
              {...AXIS}
              axisLine={{ stroke: "var(--border)" }}
              ticks={evenTicks(data.map((r) => r.x))}
              interval={0}
              tickFormatter={xLabel}
              tickMargin={4}
            />
            <YAxis
              {...AXIS}
              axisLine={false}
              width={40}
              domain={domain ?? [0, ticks[ticks.length - 1]]}
              ticks={ticks}
              interval={0}
              tickFormatter={(v: number) => fmt(v)}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              isAnimationActive={false}
              wrapperStyle={{ outline: "none", zIndex: 20 }}
              content={<TipBox series={[series]} fmt={fmt} xLabel={xLabel} />}
            />
            <Line
              dataKey={series.key}
              type="monotone"
              stroke={series.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={(p: { index: number; cx?: number; cy?: number }) =>
                p.index === lastIdx && p.cx != null && p.cy != null ? (
                  <circle
                    key={p.index}
                    cx={p.cx}
                    cy={p.cy}
                    r={4.5}
                    fill={series.color}
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                ) : (
                  <g key={p.index} />
                )
              }
              activeDot={{ r: 6, fill: series.color, stroke: "var(--card)", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/**
 * **横棒の内訳**（記憶の段・離れた画面・場所・滞在の長さ・AI の種類）。
 * 名前の行の右に数と割合を字で出し、その下に棒。棒の長さはいちばん多い行を端にする
 * （合計を端にすると、項目が多い時に全部の棒が短くなって差が見えない）。
 */
export function BarList({
  rows,
  unit = "",
  empty = "—",
}: {
  rows: Array<{ label: string; n: number; color?: string; value?: string }>;
  unit?: string;
  empty?: string;
}) {
  const total = rows.reduce((s, r) => s + r.n, 0);
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length || total === 0)
    return <p className="text-footnote text-muted-foreground">{empty}</p>;
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {rows.map((r) => (
        <li key={r.label} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-2 text-footnote">
            <span className="flex min-w-0 items-center gap-1.5">
              {r.color && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ background: r.color }}
                />
              )}
              <span className="truncate">{r.label}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <b>{r.value ?? `${r.n}${unit}`}</b>
              <span className="ml-1 text-caption text-muted-foreground">
                {Math.round((100 * r.n) / total)}%
              </span>
            </span>
          </div>
          <span className="block h-2 overflow-hidden rounded-full bg-secondary">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${(r.n / max) * 100}%`,
                minWidth: r.n ? 4 : 0,
                background: r.color ?? "var(--primary)",
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 期間の切り替え（14日・30日・90日など）。指で押せる高さ 44px。 */
export function RangeTabs<T extends number>({
  value,
  options,
  onChange,
  label,
  fmt,
}: {
  value: T;
  options: T[];
  onChange: (v: T) => void;
  label: string;
  fmt: (v: T) => string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-secondary p-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={o === value}
          onClick={() => onChange(o)}
          className={`min-h-11 flex-1 rounded-lg text-footnote font-semibold tabular-nums transition-colors ${
            o === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          {fmt(o)}
        </button>
      ))}
    </div>
  );
}

/** 割合の輪（ドーナツ）。真ん中に大きく数字。 */
export function Ring({
  pct,
  label,
  sub,
  size = 84,
}: {
  pct: number | null;
  label: string;
  sub?: string;
  size?: number;
}) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <figure className="m-0 grid justify-items-center gap-1 text-center">
      <svg
        width={size}
        height={size}
        viewBox="0 0 84 84"
        role="img"
        aria-label={`${label} ${pct ?? "—"}%`}
      >
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--secondary)" strokeWidth="10" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`}
          transform="rotate(-90 42 42)"
        />
        <text x="42" y="47" textAnchor="middle" fontSize="18" fontWeight="800" fill="currentColor">
          {pct == null ? "—" : `${pct}%`}
        </text>
      </svg>
      <figcaption className="text-caption font-semibold">{label}</figcaption>
      {sub && <span className="-mt-1 text-caption text-muted-foreground">{sub}</span>}
    </figure>
  );
}

/**
 * **全体との比較**: 横の物差しに、全体の中央値（細い線）と、この人（丸）を置く。
 * 右に「上位 何%」。物差しの右端は、この人と中央値の大きい方の1.6倍。
 */
export function CompareRow({
  label,
  value,
  median,
  pct,
}: {
  label: string;
  value: number;
  median: number | null;
  pct: number | null;
}) {
  const max = Math.max(1, value, median ?? 0) * 1.6;
  const pos = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between text-footnote">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          <b className="text-foreground">{value}</b> / 中央値 {median ?? "—"}
          {pct != null && ` · 上位 ${Math.max(1, 100 - pct)}%`}
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-secondary">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-primary/25"
          style={{ width: pos(value) }}
        />
        {median != null && (
          <span
            className="absolute -top-1 -bottom-1 w-[2px] rounded bg-muted-foreground"
            style={{ left: pos(median) }}
            title={`中央値 ${median}`}
          />
        )}
        <span
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow"
          style={{ left: pos(value) }}
        />
      </div>
    </div>
  );
}

/** 大きな数字の札（KPI）。 */
export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl bg-secondary/50 p-3">
      <div className="text-caption text-muted-foreground">{label}</div>
      <div className="text-title font-extrabold leading-tight">{value}</div>
      {sub && <div className="text-caption text-muted-foreground">{sub}</div>}
    </div>
  );
}
