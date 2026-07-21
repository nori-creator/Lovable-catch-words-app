import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { checkIsAdmin } from "@/lib/admin.functions";
import { getAdminDashboard } from "@/lib/metrics.functions";
import { pregenerateDictionaryTts } from "@/lib/tts.functions";
import { getSelfImprovementStatus, runSelfImprovementNow } from "@/lib/selfimprove.functions";
import { BarChart3, Brain, Loader2, Users, Volume2 } from "lucide-react";

/** KPI dashboard (roadmap §3) — admin only, one screen, numbers over charts. */
export const Route = createFileRoute("/_authenticated/admin/metrics")({
  head: () => ({ meta: [{ title: "KPI — Catchwords 管理" }, { name: "robots", content: "noindex" }] }),
  component: AdminMetricsPage,
});

function AdminMetricsPage() {
  const adminFn = useServerFn(checkIsAdmin);
  const dashFn = useServerFn(getAdminDashboard);
  const { data: adm } = useQuery({ queryKey: ["is-admin"], queryFn: () => adminFn() });
  const { data: dash, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => dashFn(),
    enabled: adm?.isAdmin === true,
    staleTime: 60_000,
  });

  if (adm && !adm.isAdmin) {
    return (
      <AppShell title="KPI">
        <p className="text-sm text-muted-foreground">このページは管理者専用です。</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="KPI">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <BarChart3 className="h-5 w-5 text-primary" /> KPIダッシュボード
        </h1>
        <Link to="/admin/dictionary" className="text-xs text-primary underline">
          辞書管理へ
        </Link>
      </div>

      {isLoading || !dash ? (
        <div className="h-48 animate-pulse rounded-2xl bg-secondary" />
      ) : (
        <>
          {/* Funnel */}
          <section className="mb-5 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <Users className="h-4 w-4 text-primary" /> ファネル(累計)
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ["登録", dash.funnel.users_total],
                ["オンボ完了", dash.funnel.users_onboarded],
                ["初スキャン", dash.funnel.users_first_scan],
                ["初キャッチ", dash.funnel.users_first_catch],
                ["D1継続", dash.funnel.d1_retention_pct != null ? `${dash.funnel.d1_retention_pct}%` : "—"],
              ].map(([label, v]) => (
                <div key={String(label)} className="rounded-xl bg-secondary/60 p-3 text-center">
                  <div className="text-lg font-bold">{v}</div>
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              目標(β): 初キャッチ到達 ≥80% / D1 ≥40%(ロードマップ§3)
            </p>
          </section>

          {/* TTS pre-generation (§4.3) — runs server-side where the key lives */}
          <TtsPregenPanel />

          {/* 自己改善システム: 毎日の辞書監査+ニュースコーパス観察 */}
          <SelfImprovePanel />

          {/* Daily table */}
          <section className="overflow-x-auto rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">日次(直近14日)</h2>
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">日付</th>
                  <th className="pb-2 font-medium">アクティブ</th>
                  <th className="pb-2 font-medium">スキャン</th>
                  <th className="pb-2 font-medium">タップ</th>
                  <th className="pb-2 font-medium">キャッチ</th>
                  <th className="pb-2 font-medium">復習添削</th>
                </tr>
              </thead>
              <tbody>
                {dash.days.map((d) => (
                  <tr key={d.day} className="border-t border-border/60">
                    <td className="py-1.5">{d.day.slice(5)}</td>
                    <td className="py-1.5">{d.active_users}</td>
                    <td className="py-1.5">{d.scans}</td>
                    <td className="py-1.5">{d.taps}</td>
                    <td className="py-1.5 font-semibold">{d.catches}</td>
                    <td className="py-1.5">{d.reviews}</td>
                  </tr>
                ))}
                {dash.days.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-muted-foreground">
                      まだデータがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </AppShell>
  );
}

/**
 * 自己改善システムの状態表示+手動実行。通常は誰かの最初のスキャンで
 * 1日1回自動で走る(lexicon.server.ts)ので、このパネルは監視用。
 */
function SelfImprovePanel() {
  const statusFn = useServerFn(getSelfImprovementStatus);
  const runFn = useServerFn(runSelfImprovementNow);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const { data: st, refetch } = useQuery({
    queryKey: ["self-improve-status"],
    queryFn: () => statusFn(),
    staleTime: 60_000,
  });

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      const r = await runFn();
      setResult(
        r.steps
          .map((s) => `${s.ok ? "✅" : "❌"} ${s.step}: ${s.detail}`)
          .join("\n"),
      );
      void refetch();
    } catch (e) {
      setResult(e instanceof Error ? e.message : "実行に失敗しました");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="mb-5 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Brain className="h-4 w-4 text-primary" /> 自己改善(毎日自動)
        </h2>
        <button
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm active:scale-95 disabled:opacity-60"
        >
          {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          今すぐ実行
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        最終実行:{" "}
        {st?.last_run_at
          ? new Date(st.last_run_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
          : "まだ"}
        {" · 人間レビュー待ち "}
        <span className={st?.needs_review ? "font-semibold text-amber-600" : ""}>{st?.needs_review ?? 0}</span> 件
      </p>
      {result && (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-primary/5 p-2 text-[10px] text-primary">{result}</pre>
      )}

      {(st?.runs.length ?? 0) > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] text-muted-foreground">実行ログ(直近)</summary>
          <ul className="mt-1 space-y-0.5 text-[10px]">
            {st!.runs.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span>{r.ok ? "✅" : "❌"}</span>
                <span className="font-medium">{r.step}</span>
                <span className="text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="min-w-0 flex-1 break-all text-muted-foreground">{r.detail}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {(st?.audits.length ?? 0) > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] text-muted-foreground">直近の監査結果</summary>
          <ul className="mt-1 space-y-0.5 text-[11px]">
            {st!.audits.map((a, i) => (
              <li key={i} className="flex items-center gap-2">
                <span>{a.ok ? "✅" : a.applied ? "🔧" : "⚠️"}</span>
                <span className="font-medium">{a.headword}</span>
                <span className="text-muted-foreground">
                  {a.source}
                  {!a.ok && !a.applied && " · 要レビュー"}
                  {a.applied && " · 自動修正済み"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/**
 * §4.3 dictionary audio pre-generation. Batches of 25 words run inside the
 * server (where the TTS key lives); the button keeps re-invoking itself
 * until every TOCFL L1-3 word has cached native audio. ≈0.1円/語.
 */
function TtsPregenPanel() {
  const pregenFn = useServerFn(pregenerateDictionaryTts);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; failed: number; remaining: number | null }>({
    done: 0,
    failed: 0,
    remaining: null,
  });
  const [errors, setErrors] = useState<string[]>([]);
  const cancelRef = useRef(false);

  const { data: status } = useQuery({
    queryKey: ["tts-pregen-status"],
    queryFn: () => pregenFn({ data: { dry_run: true } }),
    staleTime: 60_000,
  });
  const remaining = progress.remaining ?? status?.remaining ?? null;

  async function run() {
    if (running) {
      cancelRef.current = true;
      return;
    }
    setRunning(true);
    cancelRef.current = false;
    let totalDone = progress.done;
    let totalFailed = 0;
    try {
      for (;;) {
        const r = await pregenFn({ data: { batch: 25 } });
        totalDone += r.done;
        totalFailed += r.failed;
        setProgress({ done: totalDone, failed: totalFailed, remaining: r.remaining });
        if (r.errors.length) setErrors(r.errors);
        if (r.remaining <= 0 || cancelRef.current) break;
        // A batch that produced nothing means every word is erroring — stop
        // instead of looping on a broken TTS config (constitution: 異常値で止まる).
        if (r.done === 0) break;
      }
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="mb-5 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Volume2 className="h-4 w-4 text-primary" /> 辞書音声の事前生成(全語)
        </h2>
        <button
          onClick={run}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold active:scale-95 ${
            running ? "bg-red-100 text-red-700 ring-1 ring-red-200" : "bg-primary text-primary-foreground shadow-sm"
          }`}
        >
          {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {running ? "停止する" : remaining === 0 ? "完了済み" : "生成を開始"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {remaining == null
          ? "状態を確認中…"
          : remaining === 0
            ? "すべての検証済み語にネイティブ音声が用意されています。タップ→音声が最速になります。"
            : `残り ${remaining} 語(25語ずつ自動で進みます。目安コスト 約${Math.ceil(remaining * 0.1)}円)`}
        {progress.done > 0 && ` · 今回生成 ${progress.done} 語${progress.failed ? ` / 失敗 ${progress.failed}` : ""}`}
      </p>
      {errors.length > 0 && (
        <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-[11px] text-destructive">
          {errors.some((e) => e.includes("402"))
            ? "音声の一括生成にはクレジット/課金が必要です（402 Payment Required）。Lovableのプラン設定を確認してください。単語の発音は端末の音声で代替されるので、アプリ内の再生は動きます。"
            : errors.join(" / ")}
        </p>
      )}
    </section>
  );
}
