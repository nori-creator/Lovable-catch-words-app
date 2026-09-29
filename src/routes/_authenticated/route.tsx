import { tStatic } from "@/lib/i18n";
import { canRequestAccount, readFirstCatch, type FirstCatch } from "@/lib/first-catch";
import { FirstCatchTransfer } from "@/components/onboarding/FirstCatchTransfer";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LoadFailed } from "@/components/LoadFailed";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { getReaderMeanings } from "@/lib/word-explanation.functions";
import { setReaderMeaningLoader } from "@/lib/reader-meanings";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

/** 初回の体験を終えたかを端末に覚える鍵（起動を速くするため。`AuthenticatedLayout`）。 */
const ONBOARDED_KEY = (userId: string) => `cw:onboarded:${userId}`;

function readOnboarded(userId: string): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY(userId)) === "1";
  } catch {
    return false;
  }
}

function writeOnboarded(userId: string, done: boolean) {
  try {
    if (done) localStorage.setItem(ONBOARDED_KEY(userId), "1");
    else localStorage.removeItem(ONBOARDED_KEY(userId));
  } catch {
    // 覚えられない端末では、毎回サーバに聞くだけ（前と同じ速さ）。
  }
}

/** セッションの確認がこれ以上かかったら、待たせずに理由を出す。 */
const SESSION_TIMEOUT_MS = 8000;

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);
  const fetchMeanings = useServerFn(getReaderMeanings);
  // 図鑑などの意味を、読む人の言語の解説から引けるようにする（`ReaderMeaning`）。
  useEffect(() => {
    setReaderMeaningLoader((ids, lang) =>
      fetchMeanings({ data: { word_ids: ids, explain_lang: lang } }),
    );
    return () => setReaderMeaningLoader(null);
  }, [fetchMeanings]);
  const [state, setState] = useState<"checking" | "ready" | "failed">("checking");
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<{ draft: FirstCatch; userId: string } | null>(null);

  const retry = useCallback(() => {
    setState("checking");
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;

    // セッションの確認には **失敗も遅延もある**。以前はここに .catch も
    // timeout も無く、失敗すると `ready` が false のまま、文字も無い
    // スピナーが回り続けるだけだった — 地下鉄でアプリを開くと必ずこれになる。
    // 何が起きているか言い、やり直させる。
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("session check timed out")), SESSION_TIMEOUT_MS),
    );

    Promise.race([supabase.auth.getSession(), timeout])
      .then(async (res) => {
        if (!active) return;
        const session = (res as Awaited<ReturnType<typeof supabase.auth.getSession>>).data.session;
        if (!session || session.user.is_anonymous) {
          const prior = await readFirstCatch().catch(() => null);
          if (!active) return;
          if (prior?.stage === "done")
            navigate({ to: "/auth", replace: true, search: { next: "" } });
          else navigate({ to: "/welcome", replace: true });
        } else {
          // Complete the photographed word's transfer before entering the app.
          const draft = await readFirstCatch().catch(() => null);
          if (!active) return;
          if (draft && canRequestAccount(draft)) {
            setPending({ draft, userId: session.user.id });
            setState("ready");
            return;
          }
          // Direct email/OAuth signup has no local first-catch draft yet. The old
          // one-screen onboarding skipped the questions and hands-on tutorial.
          // Use the same first-run flow regardless of which entry created the account.
          //
          // **起動をサーバの返事で止めない**（R17「アプリのアイコンをタップしてから…起動する
          // までが極端に遅くなった」「読み込みに失敗しました」）。前は開くたびにプロフィールの
          // 問い合わせ（サーバの往復）が終わるまで何も描かず、失敗すると「読み込みに失敗
          // しました」で止まっていた。一度でも初回の体験を終えた人は、この端末に覚えておいて
          // **すぐ画面を出し**、確認は裏で続ける（終えていなかった時だけ案内へ移す）。
          const known = readOnboarded(session.user.id);
          if (known) setState("ready");
          const profile = await fetchProfile().catch(() => undefined);
          if (!active) return;
          if (profile === undefined) {
            // 問い合わせに失敗: 入れる人（ログイン済み）は入れる。各画面が自分で読み直す。
            if (!known) setState("ready");
            return;
          }
          if (!profile?.onboarded) {
            writeOnboarded(session.user.id, false);
            void navigate({ to: "/welcome", replace: true });
            return;
          }
          writeOnboarded(session.user.id, true);
          if (!known) setState("ready");
        }
      })
      .catch(() => {
        if (!active) return;
        setState("failed");
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (_e === "SIGNED_OUT") navigate({ to: "/auth", replace: true, search: { next: "" } });
      else if (session?.user.is_anonymous) navigate({ to: "/welcome", replace: true });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate, attempt, fetchProfile]);

  if (state === "failed") {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="w-full max-w-sm">
          <LoadFailed onRetry={retry} />
        </div>
      </div>
    );
  }

  if (state === "checking") {
    return (
      <div
        className="grid min-h-screen place-items-center"
        role="status"
        aria-label={tStatic("common.loading")}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (pending) return <FirstCatchTransfer {...pending} onDone={() => setPending(null)} />;
  return <Outlet />;
}
