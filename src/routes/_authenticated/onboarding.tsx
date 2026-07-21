import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { logAppEvent } from "@/lib/metrics.functions";
import { Camera, ScanLine, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Onboarding (roadmap §2): ONE screen only — no slide wizard, no forms.
 * "かざして、タップしてみて" + the camera-permission reason in one line,
 * then straight into the scan screen. Name/level/etc. live in settings.
 */

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "ようこそ — Catchwords" }] }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const updateProfile = useServerFn(updateMyProfile);
  const logEvent = useServerFn(logAppEvent);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (profile?.onboarded) navigate({ to: "/home", replace: true });
  }, [profile, navigate]);

  async function start() {
    if (starting) return;
    setStarting(true);
    try {
      await updateProfile({
        data: {
          display_name: profile?.display_name || "学習者",
          onboarded: true,
        },
      });
      void logEvent({ data: { kind: "onboarding_done" } }).catch(() => {});
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      navigate({ to: "/capture", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "開始に失敗しました");
      setStarting(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-primary to-[oklch(0.72_0.18_240)] text-primary-foreground shadow-xl shadow-primary/30">
          <ScanLine className="h-10 w-10" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight">かざして、タップしてみて</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          街で見たものにカメラをかざすと、
          <br />
          その単語と発音が<span className="font-semibold text-foreground">瞬間的に</span>分かります。
        </p>

        <div className="mx-auto mt-6 space-y-2 text-left">
          {[
            { icon: ScanLine, text: "かざす = 調べる(無制限)" },
            { icon: Volume2, text: "タップ = 発音が聞こえる" },
            { icon: Camera, text: "撮る = 自分の図鑑に残る" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm shadow-sm">
              <Icon className="h-4 w-4 shrink-0 text-primary" />
              {text}
            </div>
          ))}
        </div>

        <button
          onClick={start}
          disabled={starting}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition active:scale-95 disabled:opacity-50"
        >
          <Camera className="h-5 w-5" />
          スキャンをはじめる
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          カメラは「見たものの単語を教えるため」だけに使います
        </p>
      </div>
    </div>
  );
}
