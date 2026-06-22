import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "パスワード再設定 — Catchwords" },
      { name: "description", content: "Catchwordsのパスワードを再設定します。" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"request" | "update">("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
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
      toast.success("再設定リンクをメールで送りました。");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "送信に失敗しました");
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
      toast.success("パスワードを更新しました。");
      navigate({ to: "/home", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-secondary/60 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-3xl bg-primary text-primary-foreground text-xl font-bold shadow-lg shadow-primary/30">C</div>
          <h1 className="text-2xl font-semibold tracking-tight">パスワード再設定</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "request" ? "登録メールアドレスにリンクを送ります。" : "新しいパスワードを入力してください。"}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {mode === "request" ? (
            <form onSubmit={handleRequest} className="space-y-3">
              <div>
                <Label htmlFor="email">メールアドレス</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "..." : "再設定リンクを送る"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleUpdate} className="space-y-3">
              <div>
                <Label htmlFor="password">新しいパスワード</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "..." : "パスワードを更新"}
              </Button>
            </form>
          )}

          <p className="mt-4 text-center text-xs text-muted-foreground">
            <a href="/auth" className="underline hover:text-foreground">ログイン画面に戻る</a>
          </p>
        </div>
      </div>
    </div>
  );
}
