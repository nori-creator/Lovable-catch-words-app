import { FirstCatchHome } from "@/components/onboarding/FirstCatchHome";
import { readFirstCatch, canRequestAccount, type FirstCatch } from "@/lib/first-catch";
import "@/components/onboarding/first-catch.css";
import { siteUrlFor } from "@/lib/site-url";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { useT } from "@/lib/i18n";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  // Preserve a same-origin `next` path so OAuth consent (or any protected
  // deep-link) can round-trip through sign-in and return to the original URL.
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : "",
  }),
  head: () => ({
    meta: [
      { title: tStatic("page.auth") },
      {
        name: "description",
        content:
          "Catchwordsにサインインして、街で出会う言葉をステッカーに変えて自分だけの台湾華語の図鑑を作りましょう。",
      },
      { property: "og:title", content: "ログイン — Catchwords" },
      {
        property: "og:description",
        content:
          "Catchwordsにサインインして、街で出会う言葉をステッカーに変えて自分だけの台湾華語の図鑑を作りましょう。",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: siteUrlFor("/auth") },
    ],
    links: [{ rel: "canonical", href: siteUrlFor("/auth") }],
  }),
  component: AuthPage,
});

/** Only accept a same-origin absolute path (no scheme, no protocol-relative). */
function sanitizeNext(raw: string | undefined | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.includes("\\")) return null;
  return raw;
}

function AuthPage() {
  const t = useT();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const nextPath = sanitizeNext(search.next);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<FirstCatch | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    void readFirstCatch()
      .then((saved) => {
        if (saved && canRequestAccount(saved)) {
          setDraft(saved);
          setMode("signup");
        }
      })
      .catch(() => {});
  }, []);
  async function leaveAnonymousSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user.is_anonymous) {
      const result = await supabase.auth.signOut({ scope: "local" });
      if (result.error) throw result.error;
    }
  }

  function goPostAuth() {
    if (nextPath) {
      // Full page navigation so consent/loader/beforeLoad re-run cleanly.
      window.location.replace(nextPath);
    } else {
      navigate({ to: "/home", replace: true });
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user && !data.user.is_anonymous) goPostAuth();
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session && !session.user.is_anonymous) goPostAuth();
    });
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextPath]);

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
          options: { emailRedirectTo },
        });
        if (error) throw error;
        setConfirmed(true);
        toast.success(t("auth.confirmSent"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.failed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      await leaveAnonymousSession();
      // redirect_uri MUST be a full same-origin URL. Append the sanitized
      // `next` as a query param on /auth so this same route consumes it after
      // the provider round-trip and forwards to the consent URL.
      const redirectUri = nextPath
        ? `${window.location.origin}/auth?next=${encodeURIComponent(nextPath)}`
        : window.location.origin;
      const res = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: redirectUri,
      });
      if (res.error) {
        toast.error(res.error.message ?? t("auth.googleFailed"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.failed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleApple() {
    setLoading(true);
    try {
      await leaveAnonymousSession();
      const redirectUri = nextPath
        ? `${window.location.origin}/auth?next=${encodeURIComponent(nextPath)}`
        : window.location.origin;
      const res = await lovable.auth.signInWithOAuth("apple", {
        redirect_uri: redirectUri,
      });

      if (res.error) {
        toast.error(res.error.message ?? t("auth.appleFailed"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.failed"));
    } finally {
      setLoading(false);
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
      onEmail={handleEmail}
      onGoogle={handleGoogle}
      onApple={handleApple}
      draft={draft}
      confirmed={confirmed}
    />
  );
}

/** Account sheet over the real Home components; no illustrative marketing hero. */
export function AuthView({
  mode,
  setMode,
  email,
  setEmail,
  password,
  setPassword,
  loading,
  onEmail,
  onGoogle,
  onApple,
  draft = null,
  confirmed = false,
}: {
  mode: "signin" | "signup";
  setMode: (m: "signin" | "signup") => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  loading: boolean;
  onEmail: (e: React.FormEvent) => void;
  onGoogle: () => void;
  onApple: () => void;
  draft?: FirstCatch | null;
  confirmed?: boolean;
}) {
  const t = useT();
  /** メールの欄は**押すまで出さない**（見本の絵と同じ。既定は2つのボタン）。 */
  const [showEmail, setShowEmail] = useState(false);
  return (
    <div className="first-run">
      <div inert aria-hidden="true">
        <FirstCatchHome draft={draft} />
      </div>
      <div className="first-account">
        <div
          className="first-account-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="first-account-title"
        >
          <h1 id="first-account-title">{draft ? t("first.account") : t("auth.signin")}</h1>
          <p className="first-sub">{draft ? t("first.accountHint") : t("auth.tagline")}</p>
          {confirmed && (
            <p role="status" className="first-sub mb-4">
              {t("first.confirm")}
            </p>
          )}
          <div className="auth-card">
            <button type="button" className="auth-oauth" onClick={onGoogle} disabled={loading}>
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
              {t("auth.google")}
            </button>
            <button
              type="button"
              className="auth-oauth auth-oauth--apple"
              onClick={onApple}
              disabled={loading}
            >
              <svg className="auth-oauth__icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M16.4 12.8c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.9-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-2.9.9-3.7 2.3-1.6 2.8-.4 6.9 1.1 9.1.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.6zM14.2 5.3c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3z"
                />
              </svg>
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
            <span aria-hidden="true">・</span>
            <a href="/privacy">{t("auth.privacy")}</a>
          </p>
        </div>
      </div>
    </div>
  );
}
