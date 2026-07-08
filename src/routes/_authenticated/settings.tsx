import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { exportMyDeck } from "@/lib/words.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTheme } from "@/components/theme-provider";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Download } from "lucide-react";

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
          <ReviewPrefsToggles />
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
      </div>
    </AppShell>
  );
}

const LIGHT_KEY = "review-light-mode-v1";
const VIDEO_KEY = "review-video-v1";

function ReviewPrefsToggles() {
  const [light, setLight] = useState(false);
  const [video, setVideo] = useState(false);
  useEffect(() => {
    setLight(localStorage.getItem(LIGHT_KEY) === "1");
    setVideo(localStorage.getItem(VIDEO_KEY) === "1");
  }, []);
  function toggle(key: string, val: boolean, setter: (v: boolean) => void) {
    setter(val);
    localStorage.setItem(key, val ? "1" : "0");
  }
  return (
    <div className="mt-4 space-y-3 border-t border-border pt-3">
      <ToggleRow
        label="ライトモード（4択）"
        hint="声を出せない場所用。ONにするとスピーキング復習の代わりに4択が出ます。"
        value={light}
        onChange={(v) => toggle(LIGHT_KEY, v, setLight)}
      />
      <ToggleRow
        label="録画（インカメ）"
        hint="スピーキング復習中、自分の姿を録画してあとで見返せます。"
        value={video}
        onChange={(v) => toggle(VIDEO_KEY, v, setVideo)}
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
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

