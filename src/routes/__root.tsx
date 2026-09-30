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
import { initPwa } from "@/lib/pwa";
import { initChunkRecovery, isChunkLoadError, reloadOnceForChunkError } from "@/lib/chunk-reload";

import appCss from "../styles.css?url";
// 見た目パック。すべてのセレクタが [data-ui-pack] の下にあるので、
// 現行(origin)では属性が付かず1つも当たらない = 現行デザインは不変。
import packCss from "../pack-styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider, DEFAULT_THEME, THEME_STORAGE_KEY } from "@/components/theme-provider";
import { DEFAULT_MOTION, MOTION_ATTR, MOTION_STORAGE_KEY } from "@/lib/motion-pref";
import { MotionProvider } from "@/components/motion-provider";
import { REVIEW_CACHE_USER_KEY } from "@/lib/review-cache";
import { initUiTheme } from "@/lib/ui-theme";
import { initUiPack } from "@/lib/ui-pack";
import { htmlLangOf, UI_LANG_STORAGE_KEY, UI_LANGS, useT } from "@/lib/i18n";

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

function ErrorComponent({ error: caught, reset }: { error: unknown; reset: () => void }) {
  const error = caught instanceof Error ? caught : new Error(String(caught));
  const t = useT();
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  // 画面の部品を取りに行けなかっただけなら、1回だけ読み直して立ち直る（`lib/chunk-reload.ts`）。
  const chunk = isChunkLoadError(error);
  useEffect(() => {
    if (chunk) reloadOnceForChunkError();
  }, [chunk]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-title font-semibold tracking-tight text-foreground">
          {t("root.loadFailed")}
        </h1>
        <p className="mt-2 text-body text-muted-foreground">{t("root.loadFailedHint")}</p>
        {/* **何が起きたかを画面に残す**（オーナー報告 2026-09-29 の画面には理由が無く、
            開発者の手元で再現するまで原因が分からなかった）。 */}
        <details className="mt-3 text-left text-caption text-muted-foreground">
          <summary className="cursor-pointer text-center">{t("root.errorDetail")}</summary>
          <p className="mt-1 break-all">{error.message}</p>
        </details>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (chunk) {
                window.location.reload();
                return;
              }
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
      /**
       * **ブラウザの自動翻訳を出さない**（オーナー報告 2026-09-30「設定言語を台湾華語に
       * しているのに、台湾人の彼女が開くと Google 翻訳がこのアプリを日本語と判断し、
       * もともと台湾華語のものを日本語から翻訳して変な文字になる」）。
       *
       * このアプリは表示言語を自分で持つ（日本語・英語・繁體中文）うえ、学ぶ語そのもの
       * （台湾華語・注音）が画面に並ぶ。機械翻訳が掛かると、学ぶ語まで書き換えられる。
       * Google の公式の指定（`<meta name="google" content="notranslate">`）と
       * HTML 標準の `translate="no"` の両方で止める。
       */
      { name: "google", content: "notranslate" },
      { title: "CatchWords" },
      {
        name: "description",
        content: "街で出会った言葉を集める、言語学習アプリ。\nCapture words. Build your world.",
      },
      { name: "author", content: "CatchWords" },
      { property: "og:site_name", content: "CatchWords" },
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
      // **上の帯（端末の状態バー）の色は画面の地と同じに**（オーナー報告
      // 2026-09-27「アプリの上部のオレンジ色おかしい」）。前は昔の
      // ブランド色（#ff6f61）が残っていた。実際の色は下の `syncThemeColor` が
      // 画面の地から毎回写す。ここは最初の一瞬のための値。
      { name: "theme-color", content: "#f8fbfe" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "CatchWords" },
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
      // 繁體中文の手書き（芫荽）。字の切り分けごとに `unicode-range` が付いているので、
      // 読むのは CSS だけで、字の本体はその字が画面に出た時にだけ取る。
      { rel: "stylesheet", href: "/fonts/iansui/iansui.css" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      // フォントは public/fonts から自前で配る(styles.css の @font-face)。
      // 以前は Google Fonts から読んでいたが、ネイティブアプリではオフラインで
      // 落ちるうえ、起動ごとに外部通信が入って初回描画が遅れていた。
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
    scripts: [
      // **最初の1枚を正しい色で描くための、描画前スクリプト。**
      //
      // `.dark` は `ThemeProvider` の `useEffect` でしか付いていなかった。
      // つまり効くのは**水和が終わってから**で、それまでの絵は明るい地の
      // まま描かれる。既定は dark なので、ほぼ全員が読み込みのたびに
      // 「白く光ってから暗くなる」を見ていた。
      //
      // 実測(開発サーバ / iPhone 14 相当):
      //     55ms 最初の描画 … <html class="">   ← 明るい
      //    630ms            … <html class="">   ← まだ明るい
      //   1531ms            … <html class="dark">
      // 本番は水和が速いので短くなるが、**1枚も間違えない保証にはならない**
      // — 効く時刻が水和に結びついている限り、必ず間に合わない絵が出る。
      //
      // 直し方は昔から決まっていて、`<head>` の中で**同期的に**当てる。
      // ここに置いたものは CSS より先、最初の描画より前に走る。
      // `children` は文字列なので、`theme-provider.tsx` の値と**手で
      // 揃える**ことになる。ずれると最初の1枚だけ色が違う画面に戻るので、
      // 鍵と既定を定数から埋め込む。
      {
        children: `(function(){try{
  var k=${JSON.stringify(THEME_STORAGE_KEY)},d=${JSON.stringify(DEFAULT_THEME)};
  var v=null; try{v=localStorage.getItem(k)}catch(e){}
  if(v!=="light"&&v!=="dark"&&v!=="system")v=d;
  var dark = v==="dark" || (v==="system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark",dark);
}catch(e){}
try{
  var mk=${JSON.stringify(MOTION_STORAGE_KEY)},md=${JSON.stringify(DEFAULT_MOTION)};
  var mv=null; try{mv=localStorage.getItem(mk)}catch(e){}
  if(mv!=="full"&&mv!=="reduce"&&mv!=="system")mv=md;
  var osr=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.dataset.${MOTION_ATTR}=mv==="system"?(osr?"reduce":"full"):mv;
}catch(e){document.documentElement.dataset.${MOTION_ATTR}="full"}
try{if(window.matchMedia("(pointer: coarse)").matches)document.documentElement.dataset.scrollRoot="shell"}catch(e){}
try{
  var ul=null; try{ul=localStorage.getItem(${JSON.stringify(UI_LANG_STORAGE_KEY)})}catch(e){}
  var m=${JSON.stringify(Object.fromEntries(UI_LANGS.map((l) => [l, htmlLangOf(l)])))};
  document.documentElement.lang = (ul && m[ul]) || "ja";
}catch(e){}})()`,
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "CatchWords",
              url: siteUrl(),
              logo: siteUrlFor("/icon-512.png"),
            },
            {
              "@type": "WebSite",
              name: "CatchWords",
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
    // `lang` は描画前のスクリプトが表示言語に合わせて書き換える（最初の1枚から正しい
    // 言語を名乗る。ブラウザの言語の判定と、繁体字の字形選びのため）。その書き換えを
    // 水和の食い違いと数えないよう `suppressHydrationWarning`。
    <html lang="ja" translate="no" className="notranslate" suppressHydrationWarning>
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
    // スマホにアプリとして入れる準備（インストールの合図・サービスワーカー。`lib/pwa.ts`）。
    initPwa();
    initChunkRecovery();
  }, []);

  /**
   * 状態バーの色（`theme-color`）を**いまの画面の地**に合わせる。
   * 明暗・UIテーマ・画面（図鑑の展示室など）で地が変わるので、html の
   * 印（class / data-*）が変わるたびと、画面を移るたびに写し直す。
   */
  useEffect(() => {
    const sync = () => {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (!meta) return;
      const pick = (el: Element | null) => (el ? getComputedStyle(el).backgroundColor : "");
      const clear = (c: string) => !c || c === "transparent" || c === "rgba(0, 0, 0, 0)";
      let c = pick(document.body);
      if (clear(c)) c = pick(document.documentElement);
      if (!clear(c)) meta.content = c;
    };
    sync();
    const mo = new MutationObserver(() => requestAnimationFrame(sync));
    mo.observe(document.documentElement, { attributes: true });
    const off = router.subscribe("onResolved", () => requestAnimationFrame(sync));
    return () => {
      mo.disconnect();
      off();
    };
  }, [router]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      /**
       * **いま入っている人の id を写しておく。**
       *
       * 復習の束を端末に書き留めるようにしたので(`lib/review-cache.ts`)、
       * 「これは誰の束か」を**最初の描画で**判じられないといけない。
       * `supabase.auth.getUser()` は待つ形なので、そこでは間に合わない。
       * 入った/出た/変わったの度にここへ写しておけば、次に開いたときに
       * 同期で確かめられる。出たときは消す — **別の人の束を出さない**。
       */
      let before: string | null = null;
      try {
        before = localStorage.getItem(REVIEW_CACHE_USER_KEY);
        const uid = session?.user?.id;
        if (uid) localStorage.setItem(REVIEW_CACHE_USER_KEY, uid);
        else localStorage.removeItem(REVIEW_CACHE_USER_KEY);
      } catch {
        // 内緒のタブなどで書けなくても、束が出ないだけ（今までと同じ）。
      }
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      /**
       * **同じ人のまま届いた SIGNED_IN では何も読み直さない**（R17「復習の画面を開くと４択が
       * 表示され、すぐ消え新しい４択が表示されるバグ」「起動までが極端に遅くなった」）。
       *
       * supabase-js は、保存済みのセッションを戻した時やアプリに戻った時にも SIGNED_IN を
       * 送ってくる。前はそのたびに全部の問い合わせを捨てて読み直していたので、起動直後に
       * 全画面の読み込みがもう一度走り、復習では端末に用意してあった4択が、読み直した別の
       * 4択に差し替わっていた。人が変わった時（別の人が入った・初めて入った）だけ読み直す。
       */
      const same = event === "SIGNED_IN" && !!before && before === session?.user?.id;
      if (same) return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MotionProvider>
          <Outlet />
          <Toaster position="top-center" richColors />
        </MotionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
