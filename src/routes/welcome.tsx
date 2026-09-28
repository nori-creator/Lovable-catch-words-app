import { FIRST_CATCH_IMAGES } from "@/lib/first-catch-images";
import { createFileRoute } from "@tanstack/react-router";
import { FirstCatchEntry } from "@/components/onboarding/FirstCatchFlow";
import { tStatic } from "@/lib/i18n";
export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [{ title: tStatic("page.onboarding") }],
    links: FIRST_CATCH_IMAGES.map((href) => ({ rel: "preload", as: "image", href })),
  }),
  component: FirstCatchEntry,
});
