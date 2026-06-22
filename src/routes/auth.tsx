import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "ログイン — Catchwords" },
      { name: "description", content: "Catchwordsにサインインして、街で出会う言葉をステッカーに変えて自分だけの台湾華語の図鑑を作りましょう。" },
      { property: "og:title", content: "ログイン — Catchwords" },
      { property: "og:description", content: "Catchwordsにサインインして、街で出会う言葉をステッカーに変えて自分だけの台湾華語の図鑑を作りましょう。" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://word-snap-journey.lovable.app/auth" },
    ],
    links: [{ rel: "canonical", href: "https://word-snap-journey.lovable.app/auth" }],
  }),
  component: AuthPage,
});


function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/home", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/home", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("確認メールを送りました。受信トレイをご確認ください。");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "サインインに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      const res = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (res.error) {
        toast.error(res.error.message ?? "Googleサインインに失敗しました");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "サインインに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-secondary/60 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-3xl bg-primary text-primary-foreground text-xl font-bold shadow-lg shadow-primary/30">C</div>
          <h1 className="text-2xl font-semibold tracking-tight">Catchwords</h1>
          <p className="mt-1 text-sm text-muted-foreground">街で出会う言葉を、ステッカーに。</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex gap-2 rounded-full bg-secondary p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-full py-1.5 ${mode === "signin" ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}
            >
              ログイン
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-full py-1.5 ${mode === "signup" ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}
            >
              新規登録
            </button>
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            <div>
              <Label htmlFor="email">メールアドレス</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div>
              <Label htmlFor="password">パスワード</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "..." : mode === "signup" ? "新規登録" : "ログイン"}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            または
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
            Googleでサインイン
          </Button>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          続行すると、
          <a href="/terms" className="underline hover:text-foreground">利用規約</a>
          と
          <a href="/privacy" className="underline hover:text-foreground">プライバシーポリシー</a>
          に同意したものとみなします。
        </p>
      </div>
    </div>
  );
}
