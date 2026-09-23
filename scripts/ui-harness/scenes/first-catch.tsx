import { useState } from "react";
import { FirstCatchFlow } from "@/components/onboarding/FirstCatchFlow";
import { AuthView } from "@/routes/auth";
import { getUiLang, useT } from "@/lib/i18n";
import { getTargetLang } from "@/lib/target-lang-pref";
import { CardSchema } from "@/lib/card-schema";
import { supabase } from "@/integrations/supabase/client";
import { ensureFirstCatchSession } from "@/lib/first-catch-services";
import { createFirstCatchServices } from "@/lib/first-catch-ai-client";
import { FirstCatchSchema, type FirstCatch } from "@/lib/first-catch";
import type { FirstCatchAIRequest } from "@/lib/first-catch-ai-schema";

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
// Explicit direct-link visual samples only. NEVER returned from a photo analysis.
function sampleCard(target: FirstCatch["targetLanguage"], ui: FirstCatch["uiLanguage"]) {
  const meaning = { ja: "コーヒー", en: "coffee", "zh-TW": "咖啡" }[ui];
  return CardSchema.parse({
    headword_zh: target === "en" ? "coffee" : "咖啡",
    meaning_ja: meaning,
    reading_zhuyin: target === "en" ? "/ˈkɔːfi/" : "ㄎㄚ ㄈㄟ",
    pinyin: target === "en" ? "" : "kā fēi",
    part_of_speech: "noun",
    level: "",
    category_key: "drink",
    example_sentence: target === "en" ? "I'd like a coffee, please." : "我想要一杯咖啡。",
    example_translation: {
      ja: "コーヒーを1杯お願いします。",
      en: "I'd like a coffee, please.",
      "zh-TW": "我想要一杯咖啡。",
    }[ui],
  });
}
// Only for explicitly labelled direct-link screen samples, never for a captured photograph.
function sampleLesson(
  target: FirstCatch["targetLanguage"],
  ui: FirstCatch["uiLanguage"],
): NonNullable<FirstCatch["lesson"]> {
  const meaning = {
    ja: ["コーヒー（飲み物）", "コーヒー（豆・粉）"],
    en: ["coffee as a drink", "coffee beans or ground coffee"],
    "zh-TW": ["作為飲品的咖啡", "咖啡豆或咖啡粉"],
  }[ui];
  const sentence = target === "en" ? "I bought coffee for the train ride." : "我買了咖啡帶上火車。";
  const translation = {
    ja: "列車で飲むためにコーヒーを買いました。",
    en: "I bought coffee for the train ride.",
    "zh-TW": "我買了咖啡帶上火車。",
  }[ui];
  return {
    senses: meaning.map((value) => ({ meaning: value, note: "" })),
    examples: [
      {
        sentence,
        translation,
        situation: {
          ja: "旅先のカフェ",
          en: "A cafe while traveling",
          "zh-TW": "旅行途中的咖啡廳",
        }[ui],
        explanation: {
          ja: "移動中に飲む一杯を買う場面です。",
          en: "Use this for a drink you buy before a journey.",
          "zh-TW": "描述旅途中買來喝的飲品。",
        }[ui],
      },
      {
        sentence:
          target === "en" ? "These coffee beans smell wonderful." : "這些咖啡豆聞起來很香。",
        translation: {
          ja: "このコーヒー豆はとてもいい香りがします。",
          en: "These coffee beans smell wonderful.",
          "zh-TW": "這些咖啡豆聞起來很香。",
        }[ui],
        situation: { ja: "豆を選ぶとき", en: "Choosing coffee beans", "zh-TW": "挑選咖啡豆時" }[ui],
        explanation: {
          ja: "豆や粉を指す場合は、後ろに豆などを添えると明確です。",
          en: "Add ‘beans’ when you mean the ingredient rather than the drink.",
          "zh-TW": "指咖啡豆時，加上「豆」更清楚。",
        }[ui],
      },
    ],
  };
}
export function FirstCatchScene({ q }: { q: URLSearchParams }) {
  const t = useT();
  const [draft, setDraft] = useState<FirstCatch>(() => {
    const step = FirstCatchSchema.shape.stage.safeParse(q.get("step"));
    const stage = step.success ? step.data : "questions";
    const targetLanguage =
      q.get("target") === "en" ? "en" : q.get("target") === "zh-TW" ? "zh-TW" : getTargetLang();
    const uiLanguage = getUiLang();
    const sample = ["card", "added", "explore", "account"].includes(stage);
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
      photo: sample ? "/first-catch-cafe.webp" : null,
      card: sample ? sampleCard(targetLanguage, uiLanguage) : null,
      lesson: stage === "explore" ? sampleLesson(targetLanguage, uiLanguage) : undefined,
      capturedAt: sample ? "2026-09-23T09:00:00.000Z" : null,
    };
  });
  const [account, setAccount] = useState(draft.stage === "account");
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const services = createFirstCatchServices(previewRequest, preparePreview);
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
