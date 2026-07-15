import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// Beta typed wrapper: @supabase/supabase-js's auth.oauth namespace isn't in
// the public types yet. Keep this narrow, local, and only for these three
// managed methods.
type OAuthAuthorization = {
  redirect_url?: string;
  redirect_to?: string;
  client?: { name?: string; client_id?: string };
  redirect_uri?: string;
  scope?: string;
};
type OAuthNamespace = {
  getAuthorizationDetails(id: string): Promise<{ data: OAuthAuthorization | null; error: Error | null }>;
  approveAuthorization(id: string): Promise<{ data: OAuthAuthorization | null; error: Error | null }>;
  denyAuthorization(id: string): Promise<{ data: OAuthAuthorization | null; error: Error | null }>;
};
function oauthNs(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Supabase reads its session from localStorage — no SSR pass or getSession()
  // would return null on the server and bounce signed-in users to login.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthNs().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    // Already-approved client resolves immediately.
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-lg font-semibold mb-2">認証リクエストを読み込めませんでした</h1>
      <p className="text-sm text-muted-foreground break-all">
        {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "外部クライアント";

  async function decide(approve: boolean) {
    setBusy(true);
    setErr(null);
    const ns = oauthNs();
    const { data, error } = approve
      ? await ns.approveAuthorization(authorization_id)
      : await ns.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setErr("認証サーバーからリダイレクト先が返されませんでした。");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">
          {clientName} を Catchwords に接続
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          このクライアントは、あなたとしてサインインした状態で Catchwords の
          有効なツールを呼び出せるようになります。
        </p>
        {details?.redirect_uri && (
          <p className="mt-3 text-xs text-muted-foreground break-all">
            リダイレクト先: <span className="font-mono">{details.redirect_uri}</span>
          </p>
        )}
        <ul className="mt-4 space-y-1 text-sm">
          <li>・あなたの Catchwords プロフィール(表示名・アバター)</li>
          <li>・あなたのステッカー(単語カード・キャプション・撮影地)</li>
          <li>・あなたの SRS 復習の予定</li>
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          このアプリの権限とバックエンドポリシー(RLS)は引き続き適用されます。
          他ユーザーのデータは公開されません。
        </p>
        {err && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {err}
          </p>
        )}
        <div className="mt-6 flex gap-2">
          <Button disabled={busy} onClick={() => decide(true)} className="flex-1">
            許可する
          </Button>
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => decide(false)}
            className="flex-1"
          >
            拒否する
          </Button>
        </div>
      </div>
    </main>
  );
}
