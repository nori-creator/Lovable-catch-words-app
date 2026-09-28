import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { useT } from "@/lib/i18n";
import { getMyProfile } from "@/lib/profile.functions";

/** Retired scan-only introduction: old links resolve to the current first-run flow. */
export const Route = createFileRoute("/_authenticated/onboarding")({
  component: LegacyOnboardingRedirect,
});

function LegacyOnboardingRedirect() {
  const navigate = useNavigate();
  const t = useT();
  const fetchProfile = useServerFn(getMyProfile);
  useEffect(() => {
    let active = true;
    void fetchProfile()
      .then((profile) => {
        if (active) void navigate({ to: profile?.onboarded ? "/home" : "/welcome", replace: true });
      })
      .catch(() => {
        if (active) void navigate({ to: "/welcome", replace: true });
      });
    return () => {
      active = false;
    };
  }, [navigate, fetchProfile]);
  return <div className="min-h-screen" role="status" aria-label={t("common.loading")} />;
}
