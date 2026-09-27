import { useState } from "react";
import { FirstCatchFlow } from "@/components/onboarding/FirstCatchFlow";
import { AuthView } from "@/routes/auth";
import { getUiLang, useT } from "@/lib/i18n";
import { getTargetLang } from "@/lib/target-lang-pref";
import { supabase } from "@/integrations/supabase/client";
import { ensureFirstCatchSession } from "@/lib/first-catch-services";
import { createFirstCatchServices } from "@/lib/first-catch-ai-client";
import { FirstCatchSchema, type FirstCatch } from "@/lib/first-catch";
import type { FirstCatchAIRequest } from "@/lib/first-catch-ai-schema";
import { sampleCard, sampleLesson, SAMPLE_PHOTO } from "@/lib/first-catch-sample";

async function previewRequest(data: FirstCatchAIRequest): Promise<unknown> {
  const { data: session } = await supabase.auth.getSession();
  const response = await fetch("/api/first-catch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.session?.access_token ?? ""}`,
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(55_000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "FIRST_CATCH_PREVIEW_UNAVAILABLE");
  return body;
}
async function preparePreview() {
  const response = await fetch("/api/first-catch", { signal: AbortSignal.timeout(8000) });
  if (!response.ok || !(await response.json()).available)
    throw new Error("FIRST_CATCH_PREVIEW_UNAVAILABLE");
  await ensureFirstCatchSession();
}
export function FirstCatchScene({ q }: { q: URLSearchParams }) {
  const t = useT();
  const [draft, setDraft] = useState<FirstCatch>(() => {
    const step = FirstCatchSchema.shape.stage.safeParse(q.get("step"));
    const stage = step.success ? step.data : "intro";
    const targetLanguage =
      q.get("target") === "en" ? "en" : q.get("target") === "zh-TW" ? "zh-TW" : getTargetLang();
    const uiLanguage = getUiLang();
    const sample = ["card", "added", "explore", "account"].includes(stage);
    // 登録前にAIが使えない回（匿名ログインが切れている）。撮った写真が
    // 残っている所から始め、「もう一度試す」で見本の道が出る。
    const guestOff = q.get("fail") === "guest" && stage === "camera";
    return {
      version: 1,
      id: crypto.randomUUID(),
      uiLanguage,
      targetLanguage,
      dailyMinutes: 10,
      goals: stage === "explore" ? ["travel"] : [],
      interests: stage === "explore" ? ["food"] : [],
      questionIndex: Math.max(0, Math.min(4, Number(q.get("question")) || 0)),
      stage,
      photo: sample ? SAMPLE_PHOTO : guestOff ? "/first-catch-cat.webp" : null,
      card: sample ? sampleCard(targetLanguage, uiLanguage) : null,
      lesson: stage === "explore" ? sampleLesson(targetLanguage, uiLanguage) : undefined,
      capturedAt: sample || guestOff ? "2026-09-23T09:00:00.000Z" : null,
    };
  });
  const [account, setAccount] = useState(draft.stage === "account");
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const services = createFirstCatchServices(
    previewRequest,
    q.get("fail") === "guest"
      ? async () => {
          throw new Error("FIRST_CATCH_GUEST_UNAVAILABLE");
        }
      : preparePreview,
  );
  return (
    <>
      {q.has("step") && (
        <div className="first-sample-label" role="note">
          {t("first.visualSample")}
        </div>
      )}
      {account ? (
        <AuthView
          draft={draft}
          mode={mode}
          setMode={setMode}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          loading={false}
          confirmed={confirmed}
          onEmail={(e) => {
            e.preventDefault();
            setConfirmed(true);
          }}
          onGoogle={() => setConfirmed(true)}
          onApple={() => setConfirmed(true)}
        />
      ) : (
        <FirstCatchFlow
          initialDraft={draft}
          services={services}
          persist={async (next) => {
            if (q.get("fail") === "storage" && next.stage === "added")
              throw new Error("Storage full");
            setDraft(next);
          }}
          onAccount={() => setAccount(true)}
        />
      )}
    </>
  );
}
