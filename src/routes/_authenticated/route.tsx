import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LoadFailed } from "@/components/LoadFailed";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

/** セッションの確認がこれ以上かかったら、待たせずに理由を出す。 */
const SESSION_TIMEOUT_MS = 8000;

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "ready" | "failed">("checking");
  const [attempt, setAttempt] = useState(0);

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
      .then((res) => {
        if (!active) return;
        const session = (res as Awaited<ReturnType<typeof supabase.auth.getSession>>).data.session;
        if (!session) {
          navigate({ to: "/auth", replace: true, search: { next: "" } });
        } else {
          setState("ready");
        }
      })
      .catch(() => {
        if (!active) return;
        setState("failed");
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate({ to: "/auth", replace: true, search: { next: "" } });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate, attempt]);

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
      <div className="grid min-h-screen place-items-center" role="status" aria-label="読み込み中">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <Outlet />;
}
