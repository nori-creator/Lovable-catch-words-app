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
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">ページが見つかりません</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          指定されたページは存在しないか、移動された可能性があります。
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            ホームへ
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          読み込みに失敗しました
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          少し時間を置いてもう一度お試しください。
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            再試行
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            ホームへ
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
      { title: "CatchWords — 街で出会う、台湾華語" },
      { name: "description", content: "撮って、切り抜いて、覚える。街で出会った言葉をステッカーに変えて自分だけの図鑑を作るSNS型言語学習アプリ。" },
      { name: "author", content: "Catchwords" },
      { property: "og:site_name", content: "Catchwords" },
      { property: "og:title", content: "CatchWords — 街で出会う、台湾華語" },
      { property: "og:description", content: "撮って、切り抜いて、覚える。街で出会った言葉をステッカーに変えて自分だけの図鑑を作るSNS型言語学習アプリ。" },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "ja_JP" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "CatchWords — 街で出会う、台湾華語" },
      { name: "twitter:description", content: "撮って、切り抜いて、覚える。街で出会った言葉をステッカーに変えて自分だけの図鑑を作るSNS型言語学習アプリ。" },
      { name: "theme-color", content: "#ff6f61" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Catchwords" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=no" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/cizz4ZipqXVKzlS6YTpT9XYRQml1/social-images/social-1784209931658-Gemini_Generated_Image_.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/cizz4ZipqXVKzlS6YTpT9XYRQml1/social-images/social-1784209931658-Gemini_Generated_Image_.webp" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-512.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+TC:wght@500;700&display=swap" },
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
              url: "https://word-snap-journey.lovable.app",
              logo: "https://word-snap-journey.lovable.app/icon-512.png",
            },
            {
              "@type": "WebSite",
              name: "Catchwords",
              url: "https://word-snap-journey.lovable.app",
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
