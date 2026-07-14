import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { deleteMyAccount, getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { getMyScanMetrics } from "@/lib/metrics.functions";
import { checkIsAdmin } from "@/lib/admin.functions";
import { exportMyDeck } from "@/lib/words.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTheme } from "@/components/theme-provider";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Download, Loader2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "設定 — Catchwords" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);
  const updateProfile = useServerFn(updateMyProfile);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const { theme, setTheme } = useTheme();
  const [displayName, setDisplayName] = useState("");
  const [nativeLanguage, setNativeLanguage] = useState("ja");
  const [uiLanguage, setUiLanguage] = useState("ja");
  const [targetLanguage, setTargetLanguage] = useState("zh-TW");
  const [levelGoal, setLevelGoal] = useState("TOCFL-2");
  const [strictness, setStrictness] = useState<"easy" | "normal" | "strict">("normal");
  const [reviewMode, setReviewMode] = useState<"speaking" | "choice">("speaking");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportFn = useServerFn(exportMyDeck);

  async function handleExport() {
    setExporting(true);
    try {
      const { tsv, count } = await exportFn();
      const blob = new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `catchwords-deck-${new Date().toISOString().slice(0, 10)}.tsv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${count}枚のカードを書き出しました`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "エクスポートに失敗しました");
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setNativeLanguage(profile.native_language);
    setUiLanguage(profile.ui_language);
    setTargetLanguage(profile.target_language);
    setLevelGoal(profile.level_goal);
    setStrictness(profile.pronunciation_strictness as "easy" | "normal" | "strict");
    setReviewMode(
      ((profile as { review_mode?: string }).review_mode as "speaking" | "choice") ?? "speaking",
    );
  }, [profile]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateProfile({
        data: {
          display_name: displayName,
          native_language: nativeLanguage,
          ui_language: uiLanguage,
          target_language: targetLanguage,
          level_goal: levelGoal,
          pronunciation_strictness: strictness,
          review_mode: reviewMode,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("保存しました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="設定">
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">プロフィール</h3>
          <div className="space-y-3">
            <div>
              <Label htmlFor="dn">表示名</Label>
              <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">言語</h3>
          <div className="space-y-3">
            <div>
              <Label>学習言語</Label>
              <select className="w-full rounded-md border border-input bg-background p-2 text-sm" value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)}>
                <option value="zh-TW">台湾華語 (zh-TW)</option>
                <option value="en">英語 (en)</option>
              </select>
            </div>
            <div>
              <Label>目標レベル</Label>
              <select className="w-full rounded-md border border-input bg-background p-2 text-sm" value={levelGoal} onChange={(e) => setLevelGoal(e.target.value)}>
                <option value="TOCFL-1">TOCFL Level 1</option>
                <option value="TOCFL-2">TOCFL Level 2</option>
                <option value="TOCFL-3">TOCFL Level 3</option>
                <option value="TOCFL-4">TOCFL Level 4</option>
              </select>
            </div>
            <div>
              <Label>母語</Label>
              <select className="w-full rounded-md border border-input bg-background p-2 text-sm" value={nativeLanguage} onChange={(e) => setNativeLanguage(e.target.value)}>
                <option value="ja">日本語</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <Label>表示言語</Label>
              <select className="w-full rounded-md border border-input bg-background p-2 text-sm" value={uiLanguage} onChange={(e) => setUiLanguage(e.target.value)}>
                <option value="ja">日本語</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">学習設定</h3>
          <Label>復習モード</Label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(["speaking", "choice"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setReviewMode(v)}
                className={`rounded-full border py-1.5 text-sm ${reviewMode === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
              >
                {v === "speaking" ? "🎤 スピーキング" : "👆 4択(ライト)"}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            スピーキング: 写真を見てその時の経験を話す→AIが添削。4択: 声を出せない場所向けのクイズ。
          </p>
          <div className="mt-3">
            <Label>発音判定の厳しさ</Label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(["easy", "normal", "strict"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setStrictness(v)}
                  className={`rounded-full border py-1.5 text-sm ${strictness === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
                >
                  {v === "easy" ? "やさしい" : v === "normal" ? "ふつう" : "きびしい"}
                </button>
              ))}
            </div>
          </div>
          <VideoRecordingToggle />
        </div>


        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">外観</h3>
          <Label>テーマ</Label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {(["light", "dark", "system"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setTheme(v)}
                className={`rounded-full border py-1.5 text-sm ${theme === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
              >
                {v === "light" ? "ライト" : v === "dark" ? "ダーク" : "システム"}
              </button>
            ))}
          </div>
        </div>

        <Button className="w-full" onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </Button>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-1 text-sm font-semibold text-muted-foreground">データ</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            集めた単語をタブ区切りテキストで書き出します（Ankiにそのままインポートでき、Excelでも開けます）。
          </p>
          <Button
            variant="outline"
            className="w-full"
            disabled={exporting}
            onClick={handleExport}
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting ? "書き出し中..." : "デッキをエクスポート（Anki / TSV）"}
          </Button>
        </div>

        <DeveloperPanel />

        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            await queryClient.cancelQueries();
            queryClient.clear();
            await supabase.auth.signOut();
            await router.invalidate();
            navigate({ to: "/auth", replace: true });
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> サインアウト
        </Button>

        <DangerZone />
      </div>
    </AppShell>
  );
}

/**
 * Permanent account deletion (privacy policy §6 / store review requirement).
 * Two-step: open the panel, then type 「削除」 to arm the button — the server
 * re-checks the same string, so nothing short of both steps can wipe data.
 */
function DangerZone() {
  const deleteFn = useServerFn(deleteMyAccount);
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const armed = confirmText.trim() === "削除";

  async function handleDelete() {
    if (!armed || deleting) return;
    setDeleting(true);
    try {
      await deleteFn({ data: { confirm: "削除" } });
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut().catch(() => {}); // user is already gone server-side
      toast.success("アカウントを削除しました。ご利用ありがとうございました。");
      await router.invalidate();
      navigate({ to: "/auth", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "削除に失敗しました。もう一度お試しください。");
      setDeleting(false);
    }
  }

  return (
    <details className="group rounded-2xl border border-destructive/30 bg-card p-4">
      <summary className="cursor-pointer list-none text-sm font-semibold text-destructive [&::-webkit-details-marker]:hidden">
        アカウントを削除
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          集めた単語カード・写真・復習の記録・日記など、すべてのデータが完全に削除されます。
          この操作は取り消せません。カードを残したい場合は、先に上の「デッキをエクスポート」で書き出してください。
        </p>
        <div>
          <Label htmlFor="del-confirm">確認のため「削除」と入力してください</Label>
          <Input
            id="del-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="削除"
            autoComplete="off"
          />
        </div>
        <Button
          variant="destructive"
          className="w-full"
          disabled={!armed || deleting}
          onClick={handleDelete}
        >
          {deleting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 削除しています…
            </>
          ) : (
            <>
              <Trash2 className="mr-2 h-4 w-4" /> アカウントを完全に削除する
            </>
          )}
        </Button>
      </div>
    </details>
  );
}

/** §7: median speeds over the last 20 scans vs. the spec targets. */
function DeveloperPanel() {
  const metricsFn = useServerFn(getMyScanMetrics);
  const adminFn = useServerFn(checkIsAdmin);
  const { data: m } = useQuery({
    queryKey: ["scan-metrics"],
    queryFn: () => metricsFn(),
    staleTime: 60_000,
  });
  const { data: adm } = useQuery({ queryKey: ["is-admin"], queryFn: () => adminFn(), staleTime: 300_000 });

  const row = (label: string, value: number | null | undefined, targetMs: number) => {
    const ok = value != null && value <= targetMs;
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={value == null ? "text-muted-foreground" : ok ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>
          {value == null ? "計測なし" : `${(value / 1000).toFixed(2)}s`}
          <span className="ml-1 font-normal text-muted-foreground">/ 目標 {(targetMs / 1000).toFixed(1)}s</span>
        </span>
      </div>
    );
  };

  return (
    <details className="group rounded-2xl border border-border bg-card p-4">
      <summary className="cursor-pointer list-none text-sm font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
        開発者(速度計測)
      </summary>
      <div className="mt-3 space-y-2">
        {row("スキャン検出(中央値)", m?.detect_ms_median, 2500)}
        {row("タップ→音声再生(中央値)", m?.tap_to_audio_ms_median, 1000)}
        <p className="text-[10px] text-muted-foreground">直近{m?.samples ?? 0}回のスキャンから算出(仕様§9の合格ライン)</p>
        {adm?.isAdmin && (
          <Link to="/admin/metrics" className="block text-xs text-primary underline">
            KPIダッシュボードを開く →
          </Link>
        )}
      </div>
    </details>
  );
}

// Review-mode itself is saved to profiles.review_mode (above); this
// device-local toggle only covers the camera recording, which is a
// per-device preference (main branch's VIDEO_KEY, read by review.tsx).
const VIDEO_KEY = "review-video-v1";

function VideoRecordingToggle() {
  const [video, setVideo] = useState(false);
  useEffect(() => {
    setVideo(localStorage.getItem(VIDEO_KEY) === "1");
  }, []);
  function toggle(val: boolean) {
    setVideo(val);
    localStorage.setItem(VIDEO_KEY, val ? "1" : "0");
  }
  return (
    <div className="mt-4 border-t border-border pt-3">
      <ToggleRow
        label="録画（インカメ）"
        hint="スピーキング復習中、自分の姿を録画してあとで見返せます。この端末のみに保存。"
        value={video}
        onChange={toggle}
      />
    </div>
  );
}

function ToggleRow({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${value ? "bg-primary" : "bg-secondary"}`}
      >
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );
}
