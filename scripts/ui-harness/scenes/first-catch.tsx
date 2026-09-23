import { useEffect, useState } from "react";
import { FirstCatchFlow, type FirstCatchServices } from "@/components/onboarding/FirstCatchFlow";
import { AuthView } from "@/routes/auth";
import { getUiLang } from "@/lib/i18n";
import { setTargetLang } from "@/lib/target-lang-pref";
import { CardSchema } from "@/lib/card-schema";
import type { FirstCatch } from "@/lib/first-catch";
import { photo } from "./peel-sticker";

export const firstDraft: FirstCatch = {
  version: 1,
  id: "266cbbcd-52ab-4f4a-b96f-2dcd3b71ba10",
  uiLanguage: getUiLang(),
  targetLanguage: "en",
  dailyMinutes: 10,
  stage: "questions",
  photo: null,
  card: null,
  capturedAt: null,
};
const sample = CardSchema.parse({
  headword_zh: "bubble tea",
  meaning_ja: "タピオカミルクティー",
  part_of_speech: "noun",
  level: "",
  category_key: "drink",
  example_sentence: "I'd like a bubble tea, please.",
  example_translation: "タピオカミルクティーを1杯お願いします。",
});
export function FirstCatchScene({ q }: { q: URLSearchParams }) {
  const stage = q.get("step") as FirstCatch["stage"] | null;
  const [draft, setDraft] = useState<FirstCatch>({
    ...firstDraft,
    ...(stage ? { stage } : {}),
    ...(["card", "added", "account"].includes(stage ?? "")
      ? { photo, card: sample, capturedAt: "2026-09-22T10:15:00.000Z" }
      : {}),
  });
  const [account, setAccount] = useState(stage === "account");
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const services: FirstCatchServices = {
    prepare: async () => {},
    suggest: async () => ({
      suggestions: [
        {
          headword: "bubble tea",
          meaning_ja: sample.meaning_ja,
          reading_zhuyin: "",
          pinyin: "",
          category_key: "drink",
          distinction: "",
        },
      ],
    }),
    card: async () => sample,
  };
  useEffect(() => {
    setTargetLang(draft.targetLanguage);
  }, [draft.targetLanguage]);
  return account ? (
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
        if (q.get("fail") === "storage" && next.stage === "added") throw new Error("Storage full");
        setDraft(next);
      }}
      onAccount={() => setAccount(true)}
    />
  );
}
