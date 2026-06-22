import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "ようこそ — Catchwords" }] }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const updateProfile = useServerFn(updateMyProfile);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [target, setTarget] = useState("zh-TW");
  const [level, setLevel] = useState("TOCFL-2");
  const [strictness, setStrictness] = useState<"easy" | "normal" | "strict">("normal");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.onboarded) navigate({ to: "/home", replace: true });
    if (profile?.display_name) setDisplayName(profile.display_name);
  }, [profile, navigate]);

  async function finish() {
    setSaving(true);
    try {
      await updateProfile({
        data: {
          display_name: displayName || "学習者",
          target_language: target,
          level_goal: level,
          pronunciation_strictness: strictness,
          onboarded: true,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      navigate({ to: "/home", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  const steps = [
    {
      title: "ようこそ 👋",
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Catchwordsは、街で出会ったモノを撮ってステッカーにし、自分だけの図鑑を作りながら言語を学ぶアプリです。
          </p>
          <div>
            <Label htmlFor="dn">あなたの名前を教えてください</Label>
            <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例: ゆうき" />
          </div>
        </div>
      ),
    },
    {
      title: "何を学びますか？",
      body: (
        <div className="space-y-3">
          <Label>学習言語</Label>
          <div className="grid gap-2">
            {[
              { v: "zh-TW", label: "台湾華語", sub: "教育部準拠 / TOCFL / 注音 / 台湾人ネイティブ音声" },
              { v: "en", label: "英語", sub: "近日公開" },
            ].map((opt) => (
              <button
                key={opt.v}
                disabled={opt.v !== "zh-TW"}
                onClick={() => setTarget(opt.v)}
                className={`rounded-2xl border p-3 text-left ${target === opt.v ? "border-primary bg-accent/40" : "border-border bg-card"} ${opt.v !== "zh-TW" ? "opacity-50" : ""}`}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className="text-xs text-muted-foreground">{opt.sub}</div>
              </button>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: "目標レベルは？",
      body: (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {["TOCFL-1", "TOCFL-2", "TOCFL-3", "TOCFL-4"].map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`rounded-2xl border p-3 text-center ${level === l ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">いつでも変更できます。</p>
        </div>
      ),
    },
    {
      title: "発音判定の厳しさ",
      body: (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(["easy", "normal", "strict"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setStrictness(v)}
                className={`rounded-2xl border p-3 text-center ${strictness === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
              >
                {v === "easy" ? "やさしい" : v === "normal" ? "ふつう" : "きびしい"}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">後の復習機能で使います。</p>
        </div>
      ),
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-secondary/60 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex justify-center gap-1.5">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full ${i === step ? "bg-primary" : i < step ? "bg-primary/40" : "bg-secondary"}`}
            />
          ))}
        </div>
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <h1 className="mb-3 text-xl font-semibold tracking-tight">{current.title}</h1>
          {current.body}
          <div className="mt-6 flex gap-2">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="flex-1">
                戻る
              </Button>
            )}
            <Button
              onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
              disabled={saving}
              className="flex-1"
            >
              {isLast ? (saving ? "保存中..." : "はじめる") : "次へ"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
