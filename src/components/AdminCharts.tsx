import type { ReactNode } from "react";

/**
 * **開発者の画面のグラフ**（オーナー指示 2026-09-28「利用者の情報のページはもっと視覚的に
 * 見やすく、グラフや図チャート、ほかのユーザーとの比較」）。
 *
 * 部品を足さず、SVG と CSS だけで描く（図の部品は大きく、この画面は開発者しか見ない）。
 * 色はアプリの青（`--primary`）1色の濃淡。色だけに頼らず、数も必ず字で出す。
 */

/** 日ごとの棒（古い→新しい）。一番上の値と、最初・最後の日付を添える。 */
export function DayBars({
  data,
  label,
  unit = "",
  height = 72,
}: {
  data: Array<{ day: string; n: number }>;
  label: string;
  unit?: string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const total = data.reduce((s, d) => s + d.n, 0);
  return (
    <figure className="m-0">
      <figcaption className="flex items-baseline justify-between text-caption text-muted-foreground">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="tabular-nums">
          最大 {max}
          {unit} · 計 {total}
          {unit}
        </span>
      </figcaption>
      <div
        className="mt-1 flex items-end gap-[2px]"
        style={{ height }}
        role="img"
        aria-label={`${label}: 最大${max}${unit}、合計${total}${unit}`}
      >
        {data.map((d) => (
          <div
            key={d.day}
            title={`${d.day} ${d.n}${unit}`}
            className="flex-1 rounded-t-[3px] bg-primary/75"
            style={{ height: `${(d.n / max) * 100}%`, minHeight: d.n ? 2 : 0 }}
          />
        ))}
      </div>
      <div className="flex justify-between text-caption tabular-nums text-muted-foreground">
        <span>{data[0]?.day.slice(5)}</span>
        <span>{data[data.length - 1]?.day.slice(5)}</span>
      </div>
    </figure>
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

/** 内訳の横棒（言語・プラン・分布）。 */
export function SplitBars({ rows, unit = "人" }: { rows: Array<[string, number]>; unit?: string }) {
  const total = Math.max(
    1,
    rows.reduce((s, [, n]) => s + n, 0),
  );
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {rows.map(([k, n]) => (
        <li key={k} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-2 text-caption">
          <span className="truncate">{k}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-secondary">
            <span
              className="block h-full rounded-full bg-primary/75"
              style={{ width: `${(n / total) * 100}%` }}
            />
          </span>
          <span className="text-right tabular-nums">
            {n}
            {unit}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * **全体との比較**: 横の物差しに、全体の中央値（細い線）と、この人（丸）を置く。
 * 右に「上位 何%」。物差しの右端は、この人と中央値の大きい方の2倍。
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
      <div className="flex items-baseline justify-between text-caption">
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
      <div className="text-title font-extrabold tabular-nums leading-tight">{value}</div>
      {sub && <div className="text-caption text-muted-foreground">{sub}</div>}
    </div>
  );
}
