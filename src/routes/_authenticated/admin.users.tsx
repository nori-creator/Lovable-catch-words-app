import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { CompareRow, DayBars, Kpi, Ring, SplitBars } from "@/components/AdminCharts";

/**
 * **開発者だけ: 利用者ごとの詳しい情報**（オーナー指示 2026-09-27）。
 *
 * > 「開発者の私だけ、設定の欄から、それぞれのユーザーの詳しい情報を見れるように
 * > して。…考えられるすべての法律的に、セキュリティ的に開発者が見ていいものだけ
 * > 全て見たい。」
 *
 * 何を見せて何を見せないかは `admin-users.functions.ts` の注。画面の文字は開発者
 * （日本語話者）だけが見るので、翻訳の表を通さない（`hardcoded-japanese.test.ts` の KNOWN）。
 */
export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [{ title: "Users — Catchwords 管理" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (s: Record<string, unknown>): { u?: string } =>
    typeof s.u === "string" && /^[0-9a-f-]{36}$/.test(s.u) ? { u: s.u } : {},
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const adminFn = useServerFn(checkIsAdmin);
  const { data: adm } = useQuery({ queryKey: ["is-admin"], queryFn: () => adminFn() });
  const { u } = Route.useSearch();
  if (adm && !adm.isAdmin) {
    return (
      <AppShell title="Users">
        <p className="text-body text-muted-foreground">このページは管理者専用です。</p>
      </AppShell>
    );
  }
  return (
    <AppShell title="Users">
      {adm?.isAdmin ? u ? <UserDetail id={u} /> : <UserList /> : null}
    </AppShell>
  );
}

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

function UserList() {
  const listFn = useServerFn(listAdminUsers);
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listFn(),
    staleTime: 60_000,
  });
  const [q, setQ] = useState("");
  const rows = useMemo(
    () =>
      (data ?? []).filter(
        (r) => !q || (r.display_name ?? "").includes(q) || r.id.startsWith(q.toLowerCase()),
      ),
    [data, q],
  );
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
      <h2 className="pt-2 text-headline font-bold">ひとりずつ</h2>
      <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="名前 または ID の頭"
          className="min-w-0 flex-1 bg-transparent text-body outline-none"
        />
      </label>
      {isLoading && <div className="h-40 animate-pulse rounded-2xl bg-secondary" />}
      {error && <p className="text-footnote text-destructive-ink">{String(error)}</p>}
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {rows.map((r: AdminUserRow) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => void navigate({ to: "/admin/users", search: { u: r.id } })}
              className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold">
                  {r.display_name || "（名前なし）"}
                </span>
                <span className="block truncate text-caption text-muted-foreground">
                  {r.id.slice(0, 8)} · 登録 {fmtDate(r.created_at)} · {r.target_language ?? "—"} /
                  表示 {r.ui_language ?? "—"}
                  {r.plan ? ` · ${r.plan}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right text-caption text-muted-foreground">
                <span className="block text-body font-bold text-foreground">{r.stickers}語</span>
                最終 {r.last_active ? fmtDate(r.last_active) : "—"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
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

/**
 * **全体の数字**（オーナー指示 2026-09-28「グラフや図チャート、ほかのユーザーとの比較、
 * ユーザー全体の情報など、もっと分析しやすいように」）。上から:
 * いまの規模（KPI）→ 30日の動き（棒）→ 続けて使う割合（輪）→ 内訳（横棒）。
 */
export function AdminOverviewView({ o }: { o: AdminOverview }) {
  const t = o.totals;
  const r = o.retention;
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
      <Card title="30日の動き">
        <div className="grid gap-4">
          <DayBars data={o.series.active} label="使った人（日ごと）" unit="人" />
          <DayBars data={o.series.catches} label="撮った語（日ごと）" unit="語" />
          <DayBars data={o.series.signups} label="新しく登録した人" unit="人" height={48} />
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
          <SplitBars rows={o.catchesBuckets.map((b) => [`${b.bucket}語`, b.n])} />
          <p className="mt-2 text-caption text-muted-foreground">
            中央値: 撮った語 {o.medians.catches ?? "—"} · 復習(30日) {o.medians.reviews30 ?? "—"}回
            · 開いた日(30日) {o.medians.open30 ?? "—"}日
          </p>
        </Card>
        <Card title="学習言語 · プラン">
          <SplitBars rows={o.languages} />
          <div className="mt-3">
            <SplitBars rows={o.plans} />
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

function UserDetail({ id }: { id: string }) {
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
      <h2 className="mb-2 text-footnote font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
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

export function AdminUserDetailView({ d }: { d: AdminUserDetail }) {
  const p = d.profile;
  const maxHour = Math.max(1, ...d.usage.hours);
  return (
    <>
      <h1 className="text-title font-bold">{String(p.display_name ?? "（名前なし）")}</h1>
      <p className="-mt-2 text-caption text-muted-foreground">{String(p.id)}</p>

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

      <Card title="撮った単語">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="合計" value={`${d.catches.total}語`} />
          <Stat label="この30日" value={`${d.catches.last30}語`} />
          <Stat label="切り抜き" value={`${d.catches.cutouts}枚`} />
          <Stat label="続けた日（今）" value={`${d.streak.current}日`} />
          <Stat label="最長" value={`${d.streak.best}日`} />
          <Stat
            label="撮り方"
            value={
              Object.entries(d.catches.captureTypes)
                .map(([k, n]) => `${k} ${n}`)
                .join(" / ") || "—"
            }
          />
        </div>
        <p className="mt-2 text-caption text-muted-foreground">
          最初 {fmtDate(d.catches.first)} · 最後 {fmtDate(d.catches.last)}
        </p>
        <h3 className="mt-3 text-caption font-semibold">よく撮る場所（地名まで）</h3>
        <p className="text-footnote">
          {d.catches.topPlaces.map(([name, n]) => `${name}（${n}）`).join("、") || "—"}
        </p>
        <div className="mt-3">
          <DayBars
            data={[...d.catches.byDay].reverse().map(([day, n]) => ({ day, n }))}
            label="撮った日と枚数（撮った日だけ・古い順）"
            unit="語"
          />
        </div>
        <h3 className="mt-3 text-caption font-semibold">最近の語</h3>
        <p lang="zh-Hant" className="text-footnote">
          {d.catches.recentWords
            .map((w) => w.word)
            .filter(Boolean)
            .join("、") || "—"}
        </p>
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

      <Card title="復習">
        <div className="mb-2 flex justify-center">
          <Ring pct={d.review.correctPct} label="正答率" sub={`直近180日 ${d.review.total180}回`} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat
            label="この30日"
            value={`${d.review.last30}回`}
            sub={`${d.review.activeDays30}日`}
          />
          <Stat
            label="正答率"
            value={d.review.correctPct == null ? "—" : `${d.review.correctPct}%`}
          />
          <Stat label="答えるまで" value={sec(d.review.responseMsMedian)} />
          <Stat label="札の数" value={d.review.cards} />
          <Stat label="いま期限" value={d.review.dueNow} />
          <Stat label="定着（21日以上）" value={d.review.matured} />
        </div>
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
        <h3 className="mt-3 text-caption font-semibold">開く時間帯（台湾時間）</h3>
        <div className="mt-1 flex h-16 items-end gap-0.5" aria-label="開く時間帯">
          {d.usage.hours.map((n, h) => (
            <div key={h} className="flex flex-1 flex-col items-center justify-end">
              <div
                className="w-full rounded-sm bg-primary/70"
                style={{ height: `${(n / maxHour) * 100}%`, minHeight: n ? 2 : 0 }}
                title={`${h}時 ${n}回`}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-caption text-muted-foreground">
          <span>0時</span>
          <span>12時</span>
          <span>23時</span>
        </div>
        <h3 className="mt-3 text-caption font-semibold">離れる直前にいた画面</h3>
        <p className="text-footnote">
          {d.usage.leaves
            .map((l) => `${LEAVE_LABEL[l.screen] ?? l.screen} ${l.count}回`)
            .join("、") || "— （記録は 2026-09-28 から）"}
        </p>
      </Card>

      <Card title="AI の費用（概算）">
        <p className="text-headline font-bold tabular-nums">約 ${d.ai.usd.toFixed(2)}</p>
        <p className="text-caption text-muted-foreground">
          呼び出し回数 × 仮の単価。正確な額は各 AI の管理画面で確かめてください。
        </p>
        <ul className="mt-2 space-y-0.5 text-footnote tabular-nums">
          {d.ai.byKind.map((k) => (
            <li key={k.kind} className="flex justify-between">
              <span>{k.kind}</span>
              <span>
                {k.count}回 · ${k.usd.toFixed(3)}
              </span>
            </li>
          ))}
        </ul>
        {(d.ai.tokensIn > 0 || d.ai.tokensOut > 0) && (
          <p className="mt-1 text-caption text-muted-foreground">
            記録のあるトークン: 入力 {d.ai.tokensIn} / 出力 {d.ai.tokensOut}
          </p>
        )}
      </Card>
    </>
  );
}
