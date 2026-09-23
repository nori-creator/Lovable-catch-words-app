import { createFileRoute } from "@tanstack/react-router";
import { FirstCatchEntry } from "@/components/onboarding/FirstCatchFlow";
import { tStatic } from "@/lib/i18n";
export const Route = createFileRoute("/welcome")({
  head: () => ({ meta: [{ title: tStatic("page.onboarding") }] }),
  component: FirstCatchEntry,
});
