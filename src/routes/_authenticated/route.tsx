import { tStatic } from "@/lib/i18n";
import { hasAddedCatch, readFirstCatch, type FirstCatch } from "@/lib/first-catch";
import { FirstCatchTransfer } from "@/components/onboarding/FirstCatchTransfer";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LoadFailed } from "@/components/LoadFailed";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { fillReaderMeanings, getReaderMeanings } from "@/lib/word-explanation.functions";
import { setReaderMeaningFiller, setReaderMeaningLoader } from "@/lib/reader-meanings";
import { reportBackgroundFailure } from "@/lib/background-failure";
import { normalizeUiLang } from "@/lib/i18n";
import { getDueReviews } from "@/lib/reviews.functions";
import { packBatch, readBatch, REVIEW_CACHE_KEY, REVIEW_CACHE_USER_KEY } from "@/lib/review-cache";
import { warmCachedImages } from "@/lib/image-cache";
import { stickerPhotoUrl } from "@/lib/sticker-photo";

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
  const fillMeanings = useServerFn(fillReaderMeanings);
  // 図鑑などの意味を、読む人の言語の解説から引けるようにする（`ReaderMeaning`）。
  // 無い語は意味だけを埋めに行く（2026-10-02「英語・繁體中文の表示で図鑑に意味が出ない」）。
  useEffect(() => {
    setReaderMeaningLoader((ids, lang) =>
      fetchMeanings({ data: { word_ids: ids, explain_lang: lang } }),
    );
    setReaderMeaningFiller(
      (ids, lang) => fillMeanings({ data: { word_ids: ids, explain_lang: normalizeUiLang(lang) } }),
      (e) => reportBackgroundFailure("reader_meaning", e),
    );
    return () => {
      setReaderMeaningLoader(null);
      setReaderMeaningFiller(null);
    };
  }, [fetchMeanings, fillMeanings]);
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
          // 剥がした1枚は、案内を最後まで見ていなくても引き継ぐ（`hasAddedCatch`）。
          if (draft && hasAddedCatch(draft)) {
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

  /**
   * **復習の束を、アプリを開いた時点で裏で用意しておく**（R17「復習の問題もいつもラクが
   * あって、今日の問題を準備中と出てストレス…ユーザーが復習をタップしたら瞬間的に表示して」）。
   *
   * 復習を開いた時に端末の束（`review-cache.ts`）があれば、その場で出る。無い（初めて・
   * 20時間より古い）か1時間より古い時だけ、画面が落ち着いてから1本だけ読んで書き留める。
   * 見ている画面には触らない（束を入れ替えない。`review.tsx` の注）。
   */
  const fetchDue = useServerFn(getDueReviews);
  useEffect(() => {
    if (state !== "ready") return;
    let off = false;
    const run = () => {
      if (off) return;
      try {
        const uid = localStorage.getItem(REVIEW_CACHE_USER_KEY);
        if (!uid) return;
        const have = readBatch(localStorage.getItem(REVIEW_CACHE_KEY), uid, null, Date.now());
        if (have && Date.now() - have.at < 60 * 60_000) return;
        void fetchDue()
          .then((cards) => {
            if (off || !cards?.length) return;
            const packed = packBatch(cards, uid, null, Date.now());
            if (packed) localStorage.setItem(REVIEW_CACHE_KEY, JSON.stringify(packed));
            void warmCachedImages(cards.map((c) => stickerPhotoUrl(c, { prefer: "cutout" })));
          })
          .catch(() => undefined);
      } catch {
        // 端末に書けない時は、復習を開いた時に読むだけ（前と同じ）。
      }
    };
    // 起動直後の描画・ホームの写真の読み込みと取り合わないよう、落ち着いてから。
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    };
    const timer = window.setTimeout(() => {
      if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 });
      else run();
    }, 2500);
    return () => {
      off = true;
      window.clearTimeout(timer);
    };
  }, [state, fetchDue]);

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
