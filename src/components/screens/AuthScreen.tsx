import { FirstCatchPhotoStack } from "@/components/onboarding/FirstCatchPages";
import { sampleStickers } from "@/components/onboarding/first-catch-samples";
import { useTargetLang } from "@/lib/target-lang-pref";
import { LearningPreferencesSchema } from "@/lib/learning-preferences";
import { readFirstCatch, canRequestAccount, type FirstCatch } from "@/lib/first-catch";
import { trackTutorialStep } from "@/lib/tutorial-funnel-client";
import "@/components/onboarding/first-catch.css";
import { useNavigate, getRouteApi } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { useT } from "@/lib/i18n";
import { authErrorText } from "@/lib/errors";
import { inAppBrowser } from "@/lib/camera-access";
import { rememberReturningSignin } from "@/lib/returning-signin";

/** この画面の検索条件・パラメータ（`Route` は route のファイルにだけ置く）。 */
const routeApi = getRouteApi("/auth");

/** Only accept a same-origin absolute path (no scheme, no protocol-relative). */
function sanitizeNext(raw: string | undefined | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.includes("\\")) return null;
  return raw;
}

export function AuthPage() {
  const t = useT();
  const navigate = useNavigate();
  const search = routeApi.useSearch();
  const nextPath = sanitizeNext(search.next);
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  /** 押した後、Google・Apple の画面へ移るまでの間（押したボタンに回る印を出す）。 */
  const [pending, setPending] = useState<"google" | "apple" | null>(null);
  const [draft, setDraft] = useState<FirstCatch | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    void readFirstCatch()
      .then((saved) => {
        if (saved && canRequestAccount(saved)) {
          setDraft(saved);
          if (!search.mode) setMode("signup");
          // チュートリアルから来た人が登録の画面を見た（人を特定しない日ごとの数）。
          trackTutorialStep("signup_view");
        }
      })
      .catch(() => {});
  }, [search.mode]);
  useEffect(() => {
    // 戻るボタンで Google・Apple の画面から戻ると、押した時の「待ち」のままの画面が
    // そのまま出る（iPhone の Safari の bfcache）。押せる状態に戻す。
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setLoading(false);
      setPending(null);
    };
    window.addEventListener("pageshow", onShow);
    // ログインの窓口から失敗で戻ってきた時は、理由を見せる（黙ってログイン画面に戻らない）。
    const back = new URLSearchParams(
      `${window.location.search.slice(1)}&${window.location.hash.slice(1)}`,
    );
    const failure = back.get("error_description") || back.get("error");
    if (failure) toast.error(authErrorText(new Error(failure), t("auth.failed"), t));
    return () => window.removeEventListener("pageshow", onShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function leaveAnonymousSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user.is_anonymous) {
      const result = await supabase.auth.signOut({ scope: "local" });
      if (result.error) throw result.error;
    }
  }

  function goPostAuth(userId: string) {
    if (search.mode === "signin") rememberReturningSignin(userId);
    if (nextPath) {
      // Full page navigation so consent/loader/beforeLoad re-run cleanly.
      window.location.replace(nextPath);
    } else {
      navigate({ to: "/home", replace: true });
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user && !data.user.is_anonymous) goPostAuth(data.user.id);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session && !session.user.is_anonymous) {
        if (_e === "SIGNED_IN" && modeRef.current === "signin")
          rememberReturningSignin(session.user.id);
        goPostAuth(session.user.id);
      }
    });
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextPath, search.mode]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await leaveAnonymousSession();
      if (mode === "signup") {
        const emailRedirectTo = nextPath
          ? `${window.location.origin}${nextPath}`
          : window.location.origin;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo,
            ...(draft
              ? {
                  data: {
                    learning_preferences: LearningPreferencesSchema.parse(draft),
                    notification_preferences: draft.reminders ?? { morning: false, evening: false },
                  },
                }
              : {}),
          },
        });
        if (error) throw error;
        setConfirmed(true);
        toast.success(t("auth.confirmSent"));
        // With email confirmation enabled there is no session yet. Let a new
        // learner answer the questions now; their draft survives confirmation.
        if (!draft && !nextPath) void navigate({ to: "/welcome", replace: true });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) {
          rememberReturningSignin(data.user.id);
          goPostAuth(data.user.id);
        }
      }
    } catch (err) {
      toast.error(authErrorText(err, t("auth.failed"), t));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    setPending("google");
    let redirected = false;
    try {
      await leaveAnonymousSession();
      // redirect_uri MUST be a full same-origin URL. Append the sanitized
      // `next` as a query param on /auth so this same route consumes it after
      // the provider round-trip and forwards to the consent URL.
      const redirectUri = `${window.location.origin}/auth?mode=${mode}${nextPath ? `&next=${encodeURIComponent(nextPath)}` : ""}`;
      const res = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: redirectUri,
        // **毎回アカウントを選ぶ画面を出す**（2026-10-07 の報告: Google の画面を経ずに、
        // ブラウザで入っていた試験用のアカウントで勝手にログインした。Google は、入っている
        // アカウントが1つで前に許可していると、何も聞かずに戻す）。
        extraParams: { prompt: "select_account" },
      });
      redirected = "redirected" in res && !!res.redirected;
      if (res.error) {
        toast.error(authErrorText(res.error, t("auth.googleFailed"), t));
      }
    } catch (err) {
      toast.error(authErrorText(err, t("auth.failed"), t));
    } finally {
      // 画面が移るまでは押した印を残す（すぐ戻すと「押しても反応しない」に見える）。
      if (!redirected) {
        setLoading(false);
        setPending(null);
      }
    }
  }

  async function handleApple() {
    setLoading(true);
    setPending("apple");
    let redirected = false;
    try {
      await leaveAnonymousSession();
      // redirect_uri MUST be a full same-origin URL. Append the sanitized
      // `next` as a query param on /auth so this same route consumes it after
      // the provider round-trip and forwards to the consent URL.
      const redirectUri = `${window.location.origin}/auth?mode=${mode}${nextPath ? `&next=${encodeURIComponent(nextPath)}` : ""}`;
      const res = await lovable.auth.signInWithOAuth("apple", {
        redirect_uri: redirectUri,
      });
      redirected = "redirected" in res && !!res.redirected;
      if (res.error) {
        toast.error(authErrorText(res.error, t("auth.appleFailed"), t));
      }
    } catch (err) {
      toast.error(authErrorText(err, t("auth.failed"), t));
    } finally {
      // 画面が移るまでは押した印を残す（すぐ戻すと「押しても反応しない」に見える）。
      if (!redirected) {
        setLoading(false);
        setPending(null);
      }
    }
  }

  return (
    <AuthView
      mode={mode}
      setMode={setMode}
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      loading={loading}
      pending={pending}
      onEmail={handleEmail}
      onGoogle={handleGoogle}
      onApple={handleApple}
      draft={draft}
      confirmed={confirmed}
    />
  );
}

/** Full-screen account page, using the same generated photographs as Home. */
export function AuthView({
  mode,
  setMode,
  email,
  setEmail,
  password,
  setPassword,
  loading,
  pending = null,
  onEmail,
  onGoogle,
  onApple,
  draft = null,
  confirmed = false,
  initialShowEmail = false,
}: {
  mode: "signin" | "signup";
  setMode: (m: "signin" | "signup") => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  loading: boolean;
  /** 押した後、Google・Apple の画面へ移るまでの間（そのボタンに回る印を出す）。 */
  pending?: "google" | "apple" | null;
  onEmail: (e: React.FormEvent) => void;
  onGoogle: () => void;
  onApple: () => void;
  draft?: FirstCatch | null;
  confirmed?: boolean;
  /** 見本の画面集で、メールの欄を開いた形を描くときだけ使う（アプリでは使わない）。 */
  initialShowEmail?: boolean;
}) {
  const t = useT();
  const target = useTargetLang();
  const lang = draft?.targetLanguage ?? target;
  const labels = sampleStickers(draft, t, target).map((sample) => sample.word.headword);
  /** メールの欄は**押すまで出さない**（見本の絵と同じ。既定は2つのボタン）。 */
  const [showEmail, setShowEmail] = useState(initialShowEmail);
  /**
   * **LINE などアプリの中のブラウザでは、Google のログインが断られる**
   * （Google の方針で、埋め込みの画面からの Google ログインは 2021-09-30 から拒否。
   * 「403 disallowed_useragent」）。押してから失敗させず、先に理由とメール・Apple を案内する。
   */
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    setEmbedded(!!inAppBrowser(navigator.userAgent));
  }, []);
  return (
    <div className="first-run first-auth">
      <main className="first-auth-page" aria-labelledby="first-account-title">
        <div className="first-auth-brand">
          <img src="/icon-192.png" alt="" />
          <strong>CatchWords</strong>
        </div>
        {/* 最初の画面と同じ写真の束（ホームのアルバムと同じ紙）。 */}
        <FirstCatchPhotoStack labels={labels} lang={lang} className="first-auth-photos" />
        <div className="first-auth-content">
          <h1 id="first-account-title">
            {mode === "signup" ? (draft ? t("first.account") : t("auth.signup")) : t("auth.signin")}
          </h1>
          {confirmed && (
            <div role="status" className="first-sub mb-4 space-y-3">
              <p>{t("first.confirm")}</p>
              {/* **確認メールのリンクは、別のアプリの中で開かれることが多い**（Gmail・LINE など）。
                  写真と単語はこのブラウザにしか無いので、確認が終わったらここへ戻って
                  ログインしてもらう（ログインした所で引き継ぎが走る。`FirstCatchTransfer`）。 */}
              {mode === "signup" && (
                <button
                  type="button"
                  className="first-primary"
                  onClick={() => {
                    setMode("signin");
                    setShowEmail(true);
                  }}
                >
                  {t("auth.confirmedSignin")}
                </button>
              )}
            </div>
          )}
          <div className="auth-card">
            {embedded && (
              <p role="note" className="rounded-2xl bg-secondary px-4 py-3 text-footnote">
                {t("auth.googleInApp")}
              </p>
            )}
            <button
              type="button"
              className="auth-oauth"
              onClick={onGoogle}
              disabled={loading || embedded}
              aria-busy={pending === "google"}
            >
              {pending === "google" ? (
                <Loader2 className="auth-oauth__icon animate-spin" aria-hidden="true" />
              ) : (
                <svg className="auth-oauth__icon" viewBox="0 0 48 48" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.6 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.6 3-2.3 5.5-4.9 7.2l7.6 5.9c4.4-4.1 7.2-10.2 7.2-17.4z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.4 0 20.1 0 24s1 7.6 2.6 10.8l7.8-6.1z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.3 0-11.7-3.9-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
                  />
                </svg>
              )}
              {t("auth.google")}
            </button>
            <button
              type="button"
              className="auth-oauth auth-oauth--apple"
              onClick={onApple}
              disabled={loading}
              aria-busy={pending === "apple"}
            >
              {pending === "apple" ? (
                <Loader2 className="auth-oauth__icon animate-spin" aria-hidden="true" />
              ) : (
                <svg className="auth-oauth__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M16.4 12.8c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.9-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-2.9.9-3.7 2.3-1.6 2.8-.4 6.9 1.1 9.1.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.6zM14.2 5.3c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3z"
                  />
                </svg>
              )}
              {t("auth.apple")}
            </button>

            <div className="auth-or">
              <span />
              {t("auth.or")}
              <span />
            </div>

            {showEmail ? (
              <form onSubmit={onEmail} className="auth-form">
                <div className="auth-field">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="auth-field">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  />
                  {/* **パスワードを忘れた人の出口**（オーナー指示 2026-09-30「パスワード忘れた時に
                      リセットできるようにして」）。再設定の画面は在ったのに、どこからも辿れな
                      かった。打ったメールアドレスは引き継ぐ（もう一度打たせない）。 */}
                  {mode === "signin" && (
                    <a
                      href={`/reset-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}
                      className="auth-forgot"
                    >
                      {t("auth.forgot")}
                    </a>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "…" : mode === "signup" ? t("auth.signup") : t("auth.signin")}
                </Button>
              </form>
            ) : (
              <button
                type="button"
                className="auth-oauth auth-oauth--mail"
                onClick={() => setShowEmail(true)}
              >
                <Mail aria-hidden className="h-5 w-5" />
                {mode === "signup" ? t("auth.signup") : t("auth.emailLogin")}
              </button>
            )}

            <p className="auth-switch">
              {mode === "signin" ? t("auth.noAccount") : t("auth.haveAccount")}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setShowEmail(true);
                }}
                className="auth-switch__link"
              >
                {mode === "signin" ? t("auth.signup") : t("auth.signin")}
              </button>
            </p>
          </div>

          <p className="auth-legal">
            <a href="/terms">{t("auth.terms")}</a>
            <span aria-hidden="true">·</span>
            <a href="/privacy">{t("auth.privacy")}</a>
            {/* 名前が長いので、いつも2行目に1つで置く（行末に「·」だけ残さない）。 */}
            <a href="/legal/tokushoho" className="auth-legal__own-line">
              {t("legal.tokushoho")}
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
