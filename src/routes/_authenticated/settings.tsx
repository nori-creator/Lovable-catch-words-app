import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTheme } from "@/components/theme-provider";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "設定 — Catchwords" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
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
        </div>

        <Button className="w-full" onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>
    </AppShell>
  );
}
