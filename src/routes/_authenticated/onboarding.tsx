import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { logAppEvent } from "@/lib/metrics.functions";
import { Camera, ScanLine, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { tStatic } from "@/lib/i18n";

/**
 * Onboarding (roadmap §2): ONE screen only — no slide wizard, no forms.
 * "かざして、タップしてみて" + the camera-permission reason in one line,
 * then straight into the scan screen. Name/level/etc. live in settings.
 */

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: tStatic("page.onboarding") }] }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const t = useT();
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
          display_name: profile?.display_name || t("ob.learner"),
          onboarded: true,
        },
      });
      void logEvent({ data: { kind: "onboarding_done" } }).catch(() => {});
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      // 最初の一回も下タブと同じ入口へ — カメラで撮って図鑑に入るまでを体験する。
      navigate({ to: "/capture", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("ob.startFailed"));
      setStarting(false);
    }
  }

  return <OnboardingCard starting={starting} onStart={() => void start()} />;
}

/**
 * 入れて最初に見る画面。**この app で唯一、上のバーも下タブも無い全画面**。
 *
 * 見た目だけを持つ部品として切り出してある。ルート側は問い合わせと
 * 遷移を持つので、そのままでは検査の雛形から描けなかった —
 * つまり**新しい人が最初に見る画面が、一度も機械の目に入っていなかった**。
 */
export function OnboardingCard({ starting, onStart }: { starting: boolean; onStart: () => void }) {
  const t = useT();
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-primary to-[oklch(0.72_0.18_240)] text-primary-foreground shadow-xl shadow-primary/30">
          <ScanLine className="h-10 w-10" />
        </div>

        <h1 className="text-title font-bold tracking-tight">{t("ob.title")}</h1>
        {/* 中央揃えのまま折り返すと、行頭が毎行ずれて目が戻り道を探す。
            ここは中央に置くと決めた案内文なので、`text-balance` で
            **行の長さを揃える**(決めた印であり、実際に読みやすくもなる)。 */}
        <p className="mt-3 text-balance text-body leading-relaxed text-muted-foreground">
          {t("ob.line1")}
          <br />
          {t("ob.line2before")}
          <span className="font-semibold text-foreground">{t("ob.line2strong")}</span>
          {t("ob.line2after")}
        </p>

        <div className="mx-auto mt-6 space-y-2 text-left">
          {[
            { icon: ScanLine, text: t("ob.f1") },
            { icon: Volume2, text: t("ob.f2") },
            { icon: Camera, text: t("ob.f3") },
          ].map(({ icon: Icon, text }) => (
            <div
              key={text}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-body shadow-sm"
            >
              <Icon className="h-4 w-4 shrink-0 text-primary" />
              {text}
            </div>
          ))}
        </div>

        <button
          onClick={onStart}
          disabled={starting}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-body font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition active:scale-95 disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none"
        >
          <Camera className="h-5 w-5" />
          {t("ob.start")}
        </button>
        <p className="mt-2 text-caption text-muted-foreground">{t("ob.privacy")}</p>
      </div>
    </div>
  );
}
