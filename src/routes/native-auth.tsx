import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { tStatic, useT } from "@/lib/i18n";
import {
  clearLocalSupabaseSession,
  nativeAuthPath,
  nativeCallbackUrl,
  sanitizeNativeProvider,
  sanitizeNativeState,
  type NativeProvider,
} from "@/lib/native-auth";

/**
 * **iPhone アプリの Google / Apple ログインの橋渡し**（`lib/native-auth.ts`）。
 *
 * iOS 版はこのページをアプリ内の安全なブラウザで開く:
 *   `/native-auth?provider=google|apple&state=<アプリの乱数>`
 *  1. セッションが無く `provider` があれば、Web 版と同じ `signInWithOAuth` で
 *     Google / Apple へ（戻り先は `/native-auth?state=…`、`provider` は付けない —
 *     戻ってきたページはセッションを待つだけで、二度目のログインを始めない）。
 *  2. セッション（匿名でない）ができたら、ブラウザの控えを消してアプリへ戻る
 *     （`catchwords://auth-callback#…`）。自動で戻れない時のために「アプリに戻る」
 *     も出す。
 *  3. しばらく待ってもセッションが無ければ、やり直しのリンク。
 */
export const Route = createFileRoute("/native-auth")({
  // セッションはブラウザの保存から読む — サーバーでは描かない（oauth/consent と同じ）。
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    state: sanitizeNativeState(s.state),
    provider: sanitizeNativeProvider(s.provider),
  }),
  head: () => ({
    meta: [{ title: tStatic("page.nativeAuth") }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: NativeAuthPage,
});

type Phase = "waiting" | "starting" | "returning" | "failed";

/** セッションを待つ上限（OAuth から戻った直後は supabase-js が URL から読むのに少しかかる）。 */
const WAIT_MS = 8000;

function NativeAuthPage() {
  const t = useT();
  const { state, provider } = Route.useSearch();
  const [phase, setPhase] = useState<Phase>("waiting");
  const [appUrl, setAppUrl] = useState<string | null>(null);
  const started = useRef(false);
  const handed = useRef(false);

  useEffect(() => {
    if (!state) return;
    let cancelled = false;

    const handOff = (session: {
      access_token: string;
      refresh_token: string;
      expires_at?: number;
      expires_in?: number;
    }) => {
      if (handed.current || cancelled) return;
      handed.current = true;
      const url = nativeCallbackUrl(session, state);
      clearLocalSupabaseSession(window.localStorage);
      setAppUrl(url);
      setPhase("returning");
      window.location.replace(url);
    };

    const startProvider = async (p: NativeProvider) => {
      if (started.current) return;
      started.current = true;
      setPhase("starting");
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user.is_anonymous) await supabase.auth.signOut({ scope: "local" });
        const res = await lovable.auth.signInWithOAuth(p, {
          redirect_uri: `${window.location.origin}${nativeAuthPath("", state)}`,
        });
        if (res.error) setPhase("failed");
      } catch {
        setPhase("failed");
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !session.user.is_anonymous) handOff(session);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const session = data.session;
      if (session && !session.user.is_anonymous) {
        handOff(session);
      } else if (provider) {
        void startProvider(provider);
      }
    });

    const timer = window.setTimeout(() => {
      if (!handed.current && !started.current) setPhase("failed");
    }, WAIT_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, [state, provider]);

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      {!state ? (
        <p className="text-body text-muted-foreground">{t("native.badLink")}</p>
      ) : phase === "returning" && appUrl ? (
        <>
          <p className="text-body text-muted-foreground">{t("native.returning")}</p>
          <a
            href={appUrl}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-primary px-6 text-body font-semibold text-primary-foreground"
          >
            {t("native.openApp")}
          </a>
        </>
      ) : phase === "failed" ? (
        <>
          <p className="text-body text-muted-foreground">{t("native.failed")}</p>
          <a
            href={nativeAuthPath("google", state)}
            className="inline-flex h-12 items-center justify-center rounded-2xl border border-border bg-card px-6 text-body font-semibold"
          >
            {t("native.retryGoogle")}
          </a>
          <a
            href={nativeAuthPath("apple", state)}
            className="inline-flex h-12 items-center justify-center rounded-2xl border border-border bg-card px-6 text-body font-semibold"
          >
            {t("native.retryApple")}
          </a>
        </>
      ) : (
        <p className="text-body text-muted-foreground" aria-live="polite">
          {phase === "starting" ? t("native.starting") : t("native.returning")}
        </p>
      )}
    </main>
  );
}
