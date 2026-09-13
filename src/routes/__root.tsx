import { siteUrl, siteUrlFor } from "@/lib/site-url";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
// 見た目パック。すべてのセレクタが [data-ui-pack] の下にあるので、
// 現行(origin)では属性が付かず1つも当たらない = 現行デザインは不変。
import packCss from "../pack-styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { initUiTheme } from "@/lib/ui-theme";
import { initUiPack } from "@/lib/ui-pack";
import { useT } from "@/lib/i18n";

function NotFoundComponent() {
  const t = useT();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-title font-semibold text-foreground">{t("root.notFound")}</h2>
        <p className="mt-2 text-body text-muted-foreground">{t("root.notFoundHint")}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-body font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("root.toHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const t = useT();
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-title font-semibold tracking-tight text-foreground">
          {t("root.loadFailed")}
        </h1>
        <p className="mt-2 text-body text-muted-foreground">{t("root.loadFailedHint")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-body font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("root.retry")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-body font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("root.toHome")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "CatchWords" },
      {
        name: "description",
        content: "街で出会った言葉を集める、言語学習アプリ。\nCapture words. Build your world.",
      },
      { name: "author", content: "Catchwords" },
      { property: "og:site_name", content: "Catchwords" },
      { property: "og:title", content: "CatchWords" },
      {
        property: "og:description",
        content: "街で出会った言葉を集める、言語学習アプリ。\nCapture words. Build your world.",
      },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "ja_JP" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "CatchWords" },
      {
        name: "twitter:description",
        content: "街で出会った言葉を集める、言語学習アプリ。\nCapture words. Build your world.",
      },
      { name: "theme-color", content: "#ff6f61" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Catchwords" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=no" },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/cizz4ZipqXVKzlS6YTpT9XYRQml1/social-images/social-1784209931658-Gemini_Generated_Image_.webp",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/cizz4ZipqXVKzlS6YTpT9XYRQml1/social-images/social-1784209931658-Gemini_Generated_Image_.webp",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: packCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      // フォントは public/fonts から自前で配る(styles.css の @font-face)。
      // 以前は Google Fonts から読んでいたが、ネイティブアプリではオフラインで
      // 落ちるうえ、起動ごとに外部通信が入って初回描画が遅れていた。
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "Catchwords",
              url: siteUrl(),
              logo: siteUrlFor("/icon-512.png"),
            },
            {
              "@type": "WebSite",
              name: "Catchwords",
              url: siteUrl(),
              inLanguage: "ja-JP",
              description: "街で出会った言葉をステッカーに変えて学ぶ、台湾華語の学習アプリ。",
            },
          ],
        }),
      },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  // 開発者が選んだUIテーマ(CSS変数)と見た目パックを最初の描画直後に適用する。
  useEffect(() => {
    initUiTheme();
    initUiPack();
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Outlet />
        <Toaster position="top-center" richColors />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
