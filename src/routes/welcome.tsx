import { WELCOME_FONTS, WELCOME_IMAGES } from "@/lib/first-catch-images";
import { createFileRoute } from "@tanstack/react-router";
import { FirstCatchEntry } from "@/components/onboarding/FirstCatchFlow";
import { tStatic } from "@/lib/i18n";
export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [{ title: tStatic("page.onboarding") }],
    links: [
      ...WELCOME_IMAGES.map((href) => ({ rel: "preload", as: "image", href })),
      ...WELCOME_FONTS.map((href) => ({
        rel: "preload",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
        href,
      })),
    ],
  }),
  component: FirstCatchEntry,
});
