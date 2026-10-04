import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAiConsent } from "@/lib/ai-consent.functions";
import {
  AI_CONSENT_EVENT,
  askAiConsent,
  localConsentDeclined,
  setAiConsentHost,
  writeLocalConsent,
  type ConsentAsk,
} from "@/lib/ai-consent-client";

/** 確認の画面の中身は、開く時に初めて読む（最初に読む塊を太らせない）。 */
const AiConsentDialog = lazy(() =>
  import("./AiConsentDialog").then((m) => ({ default: m.AiConsentDialog })),
);

/** 登録した（匿名でない）人か。 */
async function signedInMode(): Promise<ConsentAsk["mode"]> {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    return user && !user.is_anonymous ? "account" : "guest";
  } catch {
    return "guest";
  }
}

/**
 * **外部の AI へ送る前の確認の画面を出す所**（アプリに1つ、`__root.tsx`）。
 * `askAiConsent` で開かれるほか、AI の関数が「同意が無い」で断った時（`errors.ts` の合図）
 * にも開く — iOS が止まった AI の機能を開いた時に同意の画面を出すのと同じ。
 */
export function AiConsentHost() {
  const [ask, setAsk] = useState<ConsentAsk | null>(null);
  useEffect(() => {
    setAiConsentHost((a) => setAsk(a));
    const onRequired = () => {
      void signedInMode().then((mode) => askAiConsent(mode));
    };
    window.addEventListener(AI_CONSENT_EVENT, onRequired);
    return () => {
      setAiConsentHost(null);
      window.removeEventListener(AI_CONSENT_EVENT, onRequired);
    };
  }, []);
  if (!ask) return null;
  return (
    <Suspense fallback={null}>
      <AiConsentDialog ask={ask} onClose={() => setAsk(null)} />
    </Suspense>
  );
}

/** 今の人の同意の状態（設定の画面と同じ問い合わせ）。 */
export function useAiConsentStatus(enabled = true) {
  const fetchConsent = useServerFn(getAiConsent);
  return useQuery({
    queryKey: ["ai-consent"],
    queryFn: () => fetchConsent(),
    staleTime: 5 * 60_000,
    enabled,
  });
}

/**
 * **登録した人に、アプリに入った所で1回だけ聞く**（iOS の RootView と同じ: ログインと初回の
 * 案内の後、カメラや AI の機能より前）。登録前（チュートリアル）に端末で同意していても、
 * ここでもう一度聞いてサーバに記録する。
 *
 * - サーバに今の版の同意があれば聞かない（端末にも写す）。
 * - この端末で「同意しない」を選んでいれば、開くたびには聞かない（AI の機能を使おうと
 *   した時と、設定から開ける）。
 * - 表がまだ無い（移行待ち）時は記録できないので聞かない。
 */
export function AiConsentAccountGate({ userId }: { userId: string }) {
  const { data } = useAiConsentStatus();
  const asked = useRef(false);
  useEffect(() => {
    if (!data || asked.current) return;
    if (data.agreed) {
      writeLocalConsent(`user:${userId}`, "granted");
      return;
    }
    if (!data.recorded) return;
    if (localConsentDeclined(`user:${userId}`)) return;
    asked.current = true;
    void askAiConsent("account");
  }, [data, userId]);
  return null;
}
