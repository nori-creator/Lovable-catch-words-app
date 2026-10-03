import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { authErrorText } from "@/lib/errors";

export function ResetPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"request" | "update">("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  /** 送った先。送ったら画面にも残す（トーストは数秒で消えるので、見落とすと何も起きなかったように見える）。 */
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    // ログイン画面で打ったメールアドレスを引き継ぐ（`/reset-password?email=…`）。
    const fromLogin = new URLSearchParams(window.location.search).get("email");
    if (fromLogin) setEmail(fromLogin);
    // If the URL hash contains a recovery token, Supabase auto-establishes a session.
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setMode("update");
    }
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("update");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSentTo(email);
      toast.success(t("rp.sent"));
    } catch (err) {
      toast.error(authErrorText(err, t("rp.sendFailed"), t));
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success(t("rp.updated"));
      navigate({ to: "/home", replace: true });
    } catch (err) {
      toast.error(authErrorText(err, t("rp.updateFailed"), t));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ResetPasswordView
      mode={mode}
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      loading={loading}
      sentTo={sentTo}
      onRequest={handleRequest}
      onUpdate={handleUpdate}
      onResend={() => setSentTo(null)}
    />
  );
}

/**
 * 再設定の面（通信は持たない）。ルート側（`ResetPasswordPage`）が関数を渡す。
 * 見本の画面集（`scripts/ui-harness/scenes/auth.tsx`）も同じ部品を描く。
 */
export function ResetPasswordView({
  mode,
  email,
  setEmail,
  password,
  setPassword,
  loading,
  sentTo,
  onRequest,
  onUpdate,
  onResend,
}: {
  mode: "request" | "update";
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  loading: boolean;
  sentTo: string | null;
  onRequest: (e: React.FormEvent) => void;
  onUpdate: (e: React.FormEvent) => void;
  onResend: () => void;
}) {
  const t = useT();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-secondary/60 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* ログイン画面と同じアプリのアイコン（前は「C」の1文字だった）。 */}
          <img
            src="/icon-192.png"
            alt=""
            className="mx-auto mb-3 h-14 w-14 rounded-3xl shadow-lg shadow-primary/30"
          />
          <h1 className="text-title font-semibold tracking-tight">{t("rp.title")}</h1>
          <p className="mt-1 text-body text-muted-foreground">
            {mode === "request" ? t("rp.hintRequest") : t("rp.hintUpdate")}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {mode === "request" && sentTo ? (
            <div className="space-y-3 text-center" role="status">
              <p className="text-headline font-semibold">{t("rp.sentTitle")}</p>
              <p className="text-body text-muted-foreground">
                {t("rp.sentBody", { email: sentTo })}
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loading}
                onClick={onResend}
              >
                {t("rp.resend")}
              </Button>
            </div>
          ) : mode === "request" ? (
            <form onSubmit={onRequest} className="space-y-3">
              <div>
                <Label htmlFor="email">{t("rp.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "..." : t("rp.sendLink")}
              </Button>
            </form>
          ) : (
            <form onSubmit={onUpdate} className="space-y-3">
              <div>
                <Label htmlFor="password">{t("rp.newPassword")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "..." : t("rp.update")}
              </Button>
            </form>
          )}

          <p className="mt-4 text-center text-footnote text-muted-foreground">
            <a href="/auth" className="inline-block py-3 -my-3 underline hover:text-foreground">
              {t("rp.backToLogin")}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
