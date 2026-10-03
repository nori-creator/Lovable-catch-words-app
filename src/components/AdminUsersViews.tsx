/**
 * 開発者だけの「利用者ごとの情報」の中身（`/admin/users` の画面と、確認用ページの
 * `admin-users` の場面が同じ物を使う）。
 *
 * 2026-10-03（初回の読み込みを軽くする）: もとは route のファイルの中にあったが、route の
 * ファイルから名前を出す（export する）と、その部品が使うグラフの部品（recharts）まで
 * 最初に読む塊（entry）に入っていた。中身をここへ移し、route は画面を開いた時にだけ読む。
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, Search, ShieldCheck, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { checkIsAdmin } from "@/lib/admin.functions";
import {
  getAdminOverview,
  getAdminUserDetail,
  listAdminUsers,
  type AdminOverview,
  type AdminUserDetail,
  type AdminUserRow,
} from "@/lib/admin-users.functions";
import { adminUserList, md, mdw } from "@/lib/admin-user-stats";
import { MEMORY_LEVELS } from "@/lib/memory";
import {
  BarList,
  ColumnChart,
  CompareRow,
  Kpi,
  RangeTabs,
  Ring,
  TrendLine,
  type ChartRow,
} from "@/components/AdminCharts";

/**
 * **開発者だけ: 利用者ごとの詳しい情報**（オーナー指示 2026-09-27）。
 *
 * > 「開発者の私だけ、設定の欄から、それぞれのユーザーの詳しい情報を見れるように
 * > して。…考えられるすべての法律的に、セキュリティ的に開発者が見ていいものだけ
 * > 全て見たい。」
 *
 * 何を見せて何を見せないかは `admin-users.functions.ts` の注。画面の文字は開発者
 * （日本語話者）だけが見るので、翻訳の表を通さない（`hardcoded-japanese.test.ts` の KNOWN）。
 *
 * 2026-10-02「チャートやグラフをもっと詳しく、細かく、見やすいように…名前なしのユーザーは
 * 消して、ユーザーの名前一覧は最も最近利用した人順に」: ひとりの画面は、上に要点の数字、
 * その下に日ごとの動き（期間を切り替えられる）、復習・使い方・撮った物・AI の順に、
 * 目盛りと触れると値の出るグラフで並べ直した。一覧は名前なしを外し、最後に使った順。
 */

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("ja-JP", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/**
 * 「3時間前」のような相対の時刻。一覧は最後に使った順なので、日時より「どのくらい前か」が
 * 先に目に入る方が並びの意味が分かる（正確な日時は横に小さく残す）。
 */
function ago(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "記録なし";
  const min = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60000));
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.round(h / 24);
  if (d < 60) return `${d}日前`;
  return `${Math.round(d / 30)}か月前`;
}

export function UserList() {
  const listFn = useServerFn(listAdminUsers);
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listFn(),
    staleTime: 60_000,
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-title font-semibold tracking-tight">
          <Users className="h-5 w-5 text-primary" /> 利用者ごとの情報
        </h1>
        <Link to="/admin/metrics" className="text-footnote text-primary underline">
          KPI へ
        </Link>
      </div>
      <Privacy />
      <OverviewSection />
      {isLoading && <div className="h-40 animate-pulse rounded-2xl bg-secondary" />}
      {error && <p className="text-footnote text-destructive-ink">{String(error)}</p>}
      {data && (
        <AdminUserListView
          rows={data}
          onOpen={(id) => void navigate({ to: "/admin/users", search: { u: id } })}
        />
      )}
    </div>
  );
}

/**
 * **ひとりずつの一覧**（見本の画面からも同じ物を描く）。並べ方と名前なしの外し方は
 * `adminUserList`（テスト済み）。検索はその後に掛ける。
 */
export function AdminUserListView({
  rows: all,
  onOpen,
  nowMs = Date.now(),
}: {
  rows: AdminUserRow[];
  onOpen: (id: string) => void;
  nowMs?: number;
}) {
  const [q, setQ] = useState("");
  const { rows: ordered, hiddenNoName } = useMemo(() => adminUserList(all), [all]);
  const rows = useMemo(
    () =>
      ordered.filter(
        (r) => !q || (r.display_name ?? "").includes(q) || r.id.startsWith(q.toLowerCase()),
      ),
    [ordered, q],
  );
  return (
    <section className="space-y-2">
      <h2 className="pt-2 text-headline font-bold">ひとりずつ</h2>
      <p className="text-caption text-muted-foreground">
        最後に使った順（開いた・撮った・復習した、のいちばん新しい時刻）。
        {hiddenNoName > 0 &&
          `名前のない${hiddenNoName}人は出していません（全体の数には入っています）。`}
      </p>
      <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="名前 または ID の頭"
          className="min-w-0 flex-1 bg-transparent text-body outline-none"
        />
      </label>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onOpen(r.id)}
              className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold">{r.display_name}</span>
                <span className="block truncate text-caption text-muted-foreground">
                  {r.id.slice(0, 8)} · 登録 {fmtDate(r.created_at)} · {r.target_language ?? "—"} /
                  表示 {r.ui_language ?? "—"}
                  {r.plan ? ` · ${r.plan}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right text-caption text-muted-foreground">
                <span className="block text-footnote font-bold text-foreground">
                  {ago(r.last_active, nowMs)}
                </span>
                <span className="tabular-nums">{r.stickers}語</span>
              </span>
            </button>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="px-3 py-4 text-footnote text-muted-foreground">該当する人はいません。</li>
        )}
      </ul>
    </section>
  );
}

function OverviewSection() {
  const fn = useServerFn(getAdminOverview);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });
  if (isLoading) return <div className="h-72 animate-pulse rounded-2xl bg-secondary" />;
  if (error) return <p className="text-footnote text-destructive-ink">{String(error)}</p>;
  return data ? <AdminOverviewView o={data} /> : null;
}

const PRIMARY = "var(--primary)";
const one = (key: string, label: string, color = PRIMARY) => [{ key, label, color }];
const dayRows = (xs: Array<{ day: string; n: number }>): ChartRow[] =>
  xs.map((x) => ({ x: x.day, tip: mdw(x.day), n: x.n }));
/** 「計 86 · 平均 2.9/日 · 最多 7（9/27）」。 */
function sumUp(rows: ChartRow[], key: string, unit: string, opts: { total?: boolean } = {}) {
  const fmt = (n: number) => `${n}`;
  const vals = rows.map((r) => Number(r[key]) || 0);
  const total = Math.round(vals.reduce((s, n) => s + n, 0) * 10) / 10;
  const max = Math.max(0, ...vals);
  const at = rows[vals.indexOf(max)]?.x;
  const avg = rows.length ? Math.round((total / rows.length) * 10) / 10 : 0;
  // 「使った人」のように日ごとに重なる数は、足すと意味が無いので計を出さない。
  const head =
    opts.total === false ? `平均 ${avg}${unit}/日` : `計 ${fmt(total)}${unit} · 平均 ${avg}/日`;
  return `${head}${max > 0 && at ? ` · 最多 ${fmt(max)}（${md(at)}）` : ""}`;
}

/**
 * **全体の数字**（オーナー指示 2026-09-28「グラフや図チャート、ほかのユーザーとの比較、
 * ユーザー全体の情報など、もっと分析しやすいように」）。上から:
 * いまの規模（KPI）→ 30日の動き（棒）→ 続けて使う割合（輪）→ 内訳（横棒）。
 */
export function AdminOverviewView({ o }: { o: AdminOverview }) {
  const t = o.totals;
  const r = o.retention;
  const active = dayRows(o.series.active);
  const catches = dayRows(o.series.catches);
  const signups = dayRows(o.series.signups);
  return (
    <section className="space-y-3">
      <h2 className="text-headline font-bold">全体</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="利用者" value={t.users} sub={`この7日で +${t.new7}`} />
        <Kpi label="今日使った人" value={t.active1} sub={`7日 ${t.active7} · 30日 ${t.active30}`} />
        <Kpi
          label="Pro"
          value={t.pro}
          sub={t.users ? `${Math.round((100 * t.pro) / t.users)}%` : "—"}
        />
        <Kpi label="撮った語（全体）" value={t.catches} sub={`復習 30日 ${t.reviews30}回`} />
      </div>
      <Card title="30日の動き（棒に触れるとその日の数）">
        <div className="grid gap-5">
          <ColumnChart
            data={active}
            series={one("n", "使った人")}
            title="使った人（日ごと）"
            summary={sumUp(active, "n", "人", { total: false })}
            fmt={(n) => `${n}人`}
            syncId="admin-overview"
          />
          <ColumnChart
            data={catches}
            series={one("n", "撮った語")}
            title="撮った語（日ごと）"
            summary={sumUp(catches, "n", "語")}
            fmt={(n) => `${n}語`}
            syncId="admin-overview"
          />
          <ColumnChart
            data={signups}
            series={one("n", "新しく登録")}
            title="新しく登録した人"
            summary={sumUp(signups, "n", "人")}
            fmt={(n) => `${n}人`}
            height={104}
            syncId="admin-overview"
          />
        </div>
      </Card>
      <Card title="続けて使っている割合（登録から N 日後にも使った人）">
        <div className="grid grid-cols-3 gap-2">
          <Ring pct={r.d1.rate} label="翌日" sub={`${r.d1.eligible}人中`} />
          <Ring pct={r.d7.rate} label="7日後" sub={`${r.d7.eligible}人中`} />
          <Ring pct={r.d30.rate} label="30日後" sub={`${r.d30.eligible}人中`} />
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card title="1人あたりの撮った語（分布）">
          <BarList
            rows={o.catchesBuckets.map((b) => ({ label: `${b.bucket}語`, n: b.n }))}
            unit="人"
          />
          <p className="mt-2 text-caption text-muted-foreground">
            中央値: 撮った語 {o.medians.catches ?? "—"} · 復習(30日) {o.medians.reviews30 ?? "—"}回
            · 開いた日(30日) {o.medians.open30 ?? "—"}日
          </p>
        </Card>
        <Card title="学習言語 · プラン">
          <BarList rows={o.languages.map(([label, n]) => ({ label, n }))} unit="人" />
          <div className="mt-3">
            <BarList rows={o.plans.map(([label, n]) => ({ label, n }))} unit="人" />
          </div>
        </Card>
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <p className="flex gap-2 rounded-xl bg-secondary/60 p-2 text-caption leading-relaxed text-muted-foreground">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>
        見せるのは改善に要る数字だけです。メールアドレス、正確な位置（緯度経度）、写真、
        日記や一言の本文は出しません。プライバシーポリシー（2026-09-28 改定）の「利用目的」に、
        運営者がサービス改善のために利用状況の数値を閲覧・分析することを書いてあります。
      </span>
    </p>
  );
}

const LEAVE_LABEL: Record<string, string> = {
  home: "ホーム",
  dex: "図鑑",
  capture: "撮る",
  scan: "スキャン",
  review: "復習",
  settings: "設定",
  other: "その他",
};
/** AI の種類の名前（`AI_UNIT_COST_USD` の鍵）。知らない鍵はそのまま出す。 */
const AI_LABEL: Record<string, string> = {
  scan_detect: "スキャン（物を見つける）",
  scan_parts: "スキャン（部分）",
  suggest: "候補の提案",
  card: "単語の解説",
  phrase_card: "フレーズの解説",
  speaking_feedback: "話す練習の評価",
  correction: "添削",
  journal_prompt: "日記のお題",
  wordbook: "単語帳",
  quests: "クエスト",
  tts: "発音の音声",
  tts_pregen: "発音の作り置き",
  removebg: "切り抜き",
};
const CAPTURE_LABEL: Record<string, string> = { photo: "写真", text: "文字", scan: "スキャン" };
const PROFILE_LABEL: Record<string, string> = {
  native_language: "母語",
  ui_language: "表示言語",
  target_language: "学習言語",
  level_goal: "目標レベル",
  current_level: "今のレベル",
  pronunciation_strictness: "発音の厳しさ",
  review_mode: "復習の形",
  review_daily_limit: "1日の復習数",
  review_stage_focus: "復習の重点",
  plan: "プラン",
  album_bg: "壁紙",
  onboarded: "初回設定済み",
  created_at: "登録日",
};

export function UserDetail({ id }: { id: string }) {
  const detailFn = useServerFn(getAdminUserDetail);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-user", id],
    queryFn: () => detailFn({ data: { userId: id } }),
    staleTime: 60_000,
  });
  return (
    <div className="space-y-3 pb-10">
      <Link
        to="/admin/users"
        search={{}}
        className="inline-flex min-h-11 items-center gap-1 text-footnote text-primary"
      >
        <ChevronLeft className="h-4 w-4" /> 一覧へ
      </Link>
      {isLoading && <div className="h-64 animate-pulse rounded-2xl bg-secondary" />}
      {error && <p className="text-footnote text-destructive-ink">{String(error)}</p>}
      {data && <AdminUserDetailView d={data} />}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-3">
      <h2 className="mb-3 text-body font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <h3 className="mb-1.5 mt-5 text-footnote font-semibold">{children}</h3>;
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl bg-secondary/50 p-2">
      <div className="text-caption text-muted-foreground">{label}</div>
      <div className="text-headline font-bold tabular-nums">{value}</div>
      {sub && <div className="text-caption text-muted-foreground">{sub}</div>}
    </div>
  );
}

const sec = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)}秒`);
const RANGES = [14, 30, 90];
const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

export function AdminUserDetailView({
  d,
  nowMs = Date.now(),
}: {
  d: AdminUserDetail;
  /** 「何時間前」の基準。見本の画面は決まった時刻を渡す（描くたびに変わらないように）。 */
  nowMs?: number;
}) {
  const p = d.profile;
  const [range, setRange] = useState(30);

  // 日ごと: 選んだ期間だけ。復習は正解と間違いを積み上げる（量と出来を1本で見る）。
  const days = d.daily.slice(-range);
  const dailyRows: ChartRow[] = days.map((x) => ({
    x: x.day,
    tip: mdw(x.day),
    catches: x.catches,
    correct: x.correct,
    wrong: x.reviews - x.correct,
    opens: x.opens,
    minutes: x.minutes,
    accNote: x.reviews ? `正答率 ${Math.round((100 * x.correct) / x.reviews)}%` : undefined,
  }));
  const reviewsInRange = days.reduce((s, x) => s + x.reviews, 0);
  const correctInRange = days.reduce((s, x) => s + x.correct, 0);
  const activeDays = days.filter((x) => x.catches || x.reviews || x.opens || x.minutes);

  const weekly: ChartRow[] = d.weekly.map((w) => ({
    x: w.to,
    tip: `${md(w.from)}〜${md(w.to)}`,
    accuracy: w.accuracy,
    sec: w.responseSec,
    note: w.reviews ? `${w.reviews}回中 ${w.correct}回正解` : "復習なし",
  }));
  const lastWeeks = d.weekly.filter((w) => w.accuracy != null);

  const schedule: ChartRow[] = [
    {
      x: "overdue",
      tip: "期限切れ（今日より前）",
      n: d.memory.schedule.overdue,
      fill: "var(--mem-0)",
    },
    ...d.memory.schedule.byDay.map((x, i) => ({
      x: x.day,
      tip: i === 0 ? `今日 ${mdw(x.day)}` : mdw(x.day),
      n: x.n,
    })),
  ];
  const sched = d.memory.schedule.byDay;

  const hourRows: ChartRow[] = d.usage.hours.map((n, h) => ({
    x: String(h),
    tip: `${h}:00〜${h}:59`,
    n,
  }));
  const weekdayRows: ChartRow[] = d.usage.weekdays.map((n, i) => ({
    x: WEEKDAYS[i],
    tip: `${WEEKDAYS[i]}曜日`,
    n,
  }));
  const ai30 = d.daily.slice(-30);
  const aiRows: ChartRow[] = ai30.map((x) => ({
    x: x.day,
    tip: mdw(x.day),
    n: x.aiCalls,
    note: x.aiCalls ? `約 $${x.aiUsd.toFixed(3)}` : undefined,
  }));
  const aiUsd30 = ai30.reduce((s, x) => s + x.aiUsd, 0);

  return (
    <>
      <div>
        <h1 className="text-title font-bold">{String(p.display_name ?? "（名前なし）")}</h1>
        <p className="text-caption text-muted-foreground">
          {String(p.id)} · 登録 {fmtDate(String(p.created_at ?? ""))}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Kpi label="最後に使った" value={ago(d.lastActive, nowMs)} sub={fmtDate(d.lastActive)} />
        <Kpi
          label="撮った語"
          value={`${d.catches.total}語`}
          sub={`この30日 ${d.catches.last30}語`}
        />
        <Kpi
          label="続けた日（今）"
          value={`${d.streak.current}日`}
          sub={`最長 ${d.streak.best}日`}
        />
        <Kpi
          label="復習の正答率"
          value={d.review.correctPct == null ? "—" : `${d.review.correctPct}%`}
          sub={`直近180日 ${d.review.total180}回`}
        />
      </div>

      <Card title="日ごとの動き">
        <RangeTabs
          value={range}
          options={RANGES}
          onChange={setRange}
          label="期間"
          fmt={(n) => `${n}日`}
        />
        <p className="mt-2 text-caption text-muted-foreground">
          棒に触れると、4つのグラフの同じ日の数が出ます（台湾時間で日を区切ります）。
        </p>
        <div className="mt-3 grid gap-5">
          <ColumnChart
            data={dailyRows}
            series={one("catches", "撮った語")}
            title="撮った語"
            summary={sumUp(dailyRows, "catches", "語")}
            fmt={(n) => `${n}語`}
            syncId="admin-daily"
          />
          <ColumnChart
            data={dailyRows}
            series={[
              { key: "correct", label: "正解", color: PRIMARY },
              { key: "wrong", label: "間違い", color: "var(--mem-0)" },
            ]}
            title="復習した回数"
            summary={`計 ${reviewsInRange}回${
              reviewsInRange
                ? ` · 正答率 ${Math.round((100 * correctInRange) / reviewsInRange)}%`
                : ""
            }`}
            fmt={(n) => `${n}回`}
            noteKey="accNote"
            syncId="admin-daily"
          />
          <ColumnChart
            data={dailyRows}
            series={one("opens", "開いた回数")}
            title="アプリを開いた回数"
            summary={sumUp(dailyRows, "opens", "回")}
            fmt={(n) => `${n}回`}
            height={112}
            syncId="admin-daily"
          />
          <ColumnChart
            data={dailyRows}
            series={one("minutes", "使った時間")}
            title="使った時間（分）"
            summary={sumUp(dailyRows, "minutes", "分")}
            fmt={(n) => `${n}分`}
            height={112}
            syncId="admin-daily"
          />
        </div>
        <details className="mt-4 rounded-xl bg-secondary/50 p-2 text-footnote">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">
            数字の表で見る（使った日だけ・{activeDays.length}日）
          </summary>
          <table className="mt-1 w-full text-right tabular-nums">
            <thead className="text-caption text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-medium">日</th>
                <th className="font-medium">撮った</th>
                <th className="font-medium">復習(正解)</th>
                <th className="font-medium">開いた</th>
                <th className="font-medium">分</th>
              </tr>
            </thead>
            <tbody>
              {[...activeDays].reverse().map((x) => (
                <tr key={x.day} className="border-t border-border">
                  <td className="py-1 text-left">{mdw(x.day)}</td>
                  <td>{x.catches}</td>
                  <td>
                    {x.reviews}({x.correct})
                  </td>
                  <td>{x.opens}</td>
                  <td>{x.minutes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      <Card title="復習">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="札の数" value={d.review.cards} />
          <Stat label="いま期限" value={d.review.dueNow} />
          <Stat label="定着" value={d.review.matured} sub="間隔21日以上" />
          <Stat
            label="この30日"
            value={`${d.review.last30}回`}
            sub={`${d.review.activeDays30}日`}
          />
          <Stat label="答えるまで" value={sec(d.review.responseMsMedian)} sub="中央値" />
          <Stat
            label="正答率"
            value={d.review.correctPct == null ? "—" : `${d.review.correctPct}%`}
            sub="180日"
          />
        </div>
        <p className="mt-4 text-caption text-muted-foreground">
          折れ線は週ごと（26週）。線に触れると、その週の回数と正解の数が出ます。
        </p>
        <div className="mt-2" />
        <TrendLine
          data={weekly}
          series={{ key: "accuracy", label: "正答率", color: PRIMARY }}
          title="週ごとの正答率"
          summary={
            lastWeeks.length
              ? `最近の週 ${lastWeeks[lastWeeks.length - 1].accuracy}%`
              : "復習の記録なし"
          }
          fmt={(n) => `${n}%`}
          domain={[0, 100]}
          yTicks={[0, 25, 50, 75, 100]}
        />
        <div className="mt-5" />
        <TrendLine
          data={weekly}
          series={{ key: "sec", label: "答えるまで", color: PRIMARY }}
          title="答えるまでの秒（中央値）"
          summary="下がるほど速く思い出せている"
          fmt={(n) => `${n}秒`}
          height={120}
        />
        <Sub>いまの記憶の段（札の数）</Sub>
        <BarList
          rows={[...MEMORY_LEVELS].reverse().map((lv) => ({
            label: lv.label,
            n: d.memory.levels[lv.level] ?? 0,
            color: `var(--mem-${lv.level})`,
          }))}
          unit="枚"
          empty="札がありません"
        />
        <p className="mt-1 text-caption text-muted-foreground">
          本人の画面と同じ「いま思い出せる見込み」で分けています。
        </p>
        <div className="mt-5" />
        <ColumnChart
          data={schedule}
          series={one("n", "期限の札")}
          title="復習の予定（これから14日）"
          legend={[
            { key: "overdue", label: "左端: 期限切れ", color: "var(--mem-0)" },
            { key: "n", label: "その日に期限が来る札", color: PRIMARY },
          ]}
          summary={`期限切れ ${d.memory.schedule.overdue}枚 · 14日で ${sched.reduce((s, x) => s + x.n, 0)}枚`}
          fmt={(n) => `${n}枚`}
          xLabel={(x) => (x === "overdue" ? "切れ" : x === sched[0]?.day ? "今日" : md(x))}
          // 「切れ」と「今日」は隣どうしで字が重なるので、期限切れは色と凡例で示す。
          ticks={[sched[0]?.day, sched[7]?.day, sched[13]?.day].filter((x): x is string => !!x)}
          height={112}
        />
      </Card>

      <Card title="使い方（直近180日）">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="開いた日" value={`${d.usage.openDays}日`} />
          <Stat
            label="1回の滞在"
            value={d.usage.sessions.medianMin == null ? "—" : `${d.usage.sessions.medianMin}分`}
            sub={`${d.usage.sessions.sessions}回 · 計${d.usage.sessions.totalMin}分`}
          />
          <Stat
            label="解説の作り直し"
            value={`${d.usage.regenerations}回`}
            sub={`報告 ${d.usage.reportFixes}回`}
          />
        </div>
        <div className="mt-5" />
        <ColumnChart
          data={hourRows}
          series={one("n", "開いた回数")}
          title="開く時間帯（台湾時間）"
          summary="開いた回数"
          fmt={(n) => `${n}回`}
          xLabel={(x) => `${x}時`}
          ticks={["0", "6", "12", "18", "23"]}
          height={112}
        />
        <div className="mt-5" />
        <ColumnChart
          data={weekdayRows}
          series={one("n", "開いた回数")}
          title="開く曜日"
          summary="開いた回数"
          fmt={(n) => `${n}回`}
          xLabel={(x) => x}
          ticks={WEEKDAYS}
          height={104}
        />
        <Sub>1回の滞在の長さ</Sub>
        <BarList
          rows={d.usage.sessionBuckets.map((b) => ({ label: b.label, n: b.n }))}
          unit="回"
          empty="記録なし"
        />
        <Sub>離れる直前にいた画面</Sub>
        <BarList
          rows={d.usage.leaves.map((l) => ({
            label: LEAVE_LABEL[l.screen] ?? l.screen,
            n: l.count,
          }))}
          unit="回"
          empty="— （記録は 2026-09-28 から）"
        />
        <Sub>写真の保存の失敗</Sub>
        <p className="text-footnote tabular-nums">
          {`撮影 ${d.usage.saveFailures.catch}回、再会 ${d.usage.saveFailures.reencounter}回、登録前の1枚の引き継ぎ ${d.usage.saveFailures.firstTransfer}回`}
          <span className="text-caption text-muted-foreground">（記録は 2026-09-30 から）</span>
        </p>
        <Sub>裏の処理の失敗</Sub>
        <p className="text-footnote tabular-nums">
          {`発音 ${d.usage.backgroundFailures.tts}回、写真の上げ直し ${d.usage.backgroundFailures.photoUpload}回、縮小写真 ${d.usage.backgroundFailures.thumbUpload}回、復習の採点 ${d.usage.backgroundFailures.reviewGrade}回、最初の1枚の分析 ${d.usage.backgroundFailures.firstCatchAi}回`}
          <span className="text-caption text-muted-foreground">
            （記録は 2026-10-01 から・同じ種類は1分に1回まで数える）
          </span>
        </p>
      </Card>

      <Card title="撮った単語">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="合計" value={`${d.catches.total}語`} />
          <Stat label="この30日" value={`${d.catches.last30}語`} />
          <Stat label="切り抜き" value={`${d.catches.cutouts}枚`} />
        </div>
        <p className="mt-2 text-caption text-muted-foreground">
          最初 {fmtDate(d.catches.first)} · 最後 {fmtDate(d.catches.last)}
        </p>
        <Sub>よく撮る場所（地名まで）</Sub>
        <BarList
          rows={d.catches.topPlaces.map(([label, n]) => ({ label, n }))}
          unit="語"
          empty="場所の記録なし"
        />
        <Sub>撮り方</Sub>
        <BarList
          rows={Object.entries(d.catches.captureTypes)
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => ({ label: CAPTURE_LABEL[k] ?? k, n }))}
          unit="語"
        />
        <Sub>最近の語</Sub>
        <p lang="zh-Hant" className="text-footnote">
          {d.catches.recentWords
            .map((w) => w.word)
            .filter(Boolean)
            .join("、") || "—"}
        </p>
      </Card>

      <Card title="AI の費用（概算）">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="合計（記録のある分）" value={`約 $${d.ai.usd.toFixed(2)}`} />
          <Stat label="この30日" value={`約 $${aiUsd30.toFixed(2)}`} />
        </div>
        <p className="mt-2 text-caption text-muted-foreground">
          呼び出し回数 × 仮の単価。正確な額は各 AI の管理画面で確かめてください。
        </p>
        <div className="mt-3">
          <ColumnChart
            data={aiRows}
            series={one("n", "呼び出し")}
            title="AI の呼び出し（日ごと・30日）"
            summary={sumUp(aiRows, "n", "回")}
            fmt={(n) => `${n}回`}
            height={112}
          />
        </div>
        <Sub>種類ごとの費用</Sub>
        <BarList
          rows={d.ai.byKind.map((k) => ({
            label: AI_LABEL[k.kind] ?? k.kind,
            n: k.usd,
            value: `$${k.usd.toFixed(3)} · ${k.count}回`,
          }))}
          empty="AI の記録なし"
        />
        {(d.ai.tokensIn > 0 || d.ai.tokensOut > 0) && (
          <p className="mt-2 text-caption text-muted-foreground">
            記録のあるトークン: 入力 {d.ai.tokensIn} / 出力 {d.ai.tokensOut}
          </p>
        )}
      </Card>

      <Card title="速さ（直近180日）">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="スキャン回数" value={d.speed.scans} />
          <Stat label="見つけるまで（中央値）" value={sec(d.speed.detectMsMedian)} />
          <Stat label="押して音が出るまで" value={sec(d.speed.tapToAudioMsMedian)} />
          <Stat
            label="スキャン→図鑑に入るまで"
            value={d.speed.scanToDexSecMedian == null ? "—" : `${d.speed.scanToDexSecMedian}秒`}
          />
          <Stat
            label="候補を押した割合"
            value={d.speed.tapRate == null ? "—" : `${d.speed.tapRate}%`}
          />
        </div>
      </Card>

      {d.compare && d.compare.length > 0 && (
        <Card title={`ほかの利用者と比べて（${d.compareBase ?? 0}人の中）`}>
          <div className="grid gap-3">
            {d.compare.map((c) => (
              <CompareRow key={c.label} {...c} />
            ))}
          </div>
          <p className="mt-2 text-caption text-muted-foreground">
            丸がこの人、縦の線が全体の真ん中（中央値）。ほかの人の中身は出しません。
          </p>
        </Card>
      )}

      <Card title="設定">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-footnote">
          {Object.entries(PROFILE_LABEL).map(([k, label]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="truncate font-medium">
                {k === "created_at" ? fmtDate(String(p[k] ?? "")) : String(p[k] ?? "—")}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}
