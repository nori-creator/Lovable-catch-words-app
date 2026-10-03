import type { ReactNode } from "react";
import { useState } from "react";
import { FirstCatchFlow } from "@/components/onboarding/FirstCatchFlow";
import { AuthView } from "@/components/screens/AuthScreen";
import { initialUiLang } from "@/lib/i18n";
import { getTargetLang } from "@/lib/target-lang-pref";
import { CardSchema } from "@/lib/card-schema";
import { createFirstCatchServices } from "@/lib/first-catch-ai-client";
import { FirstCatchSchema, type FirstCatch } from "@/lib/first-catch";
import type { FirstCatchAIRequest } from "@/lib/first-catch-ai-schema";
import { FirstCatchSuggestionsSchema } from "@/lib/first-catch-ai-schema";
import { readySpeech } from "../speech";

async function previewRequest(data: FirstCatchAIRequest): Promise<unknown> {
  const response = await fetch("/api/first-catch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(55_000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "FIRST_CATCH_PREVIEW_UNAVAILABLE");
  return body;
}
async function preparePreview() {
  // `?fail=guest` / `?fail=network`: 登録前の分析が使えない時の札（「見本で体験を続ける」が
  // 出て、押すと見本の写真と単語で続く）を、撮る・写真を選ぶだけで確かめられるように。
  const fail = new URLSearchParams(location.search).get("fail");
  if (fail === "guest") throw new Error("FIRST_CATCH_GUEST_UNAVAILABLE");
  if (fail === "network") throw new Error("FIRST_CATCH_NETWORK");
  const response = await fetch("/api/first-catch", { signal: AbortSignal.timeout(8000) });
  if (!response.ok || !(await response.json()).available)
    throw new Error("FIRST_CATCH_PREVIEW_UNAVAILABLE");
}
// Explicit direct-link visual samples only. NEVER returned from a photo analysis.
function sampleCard(target: FirstCatch["targetLanguage"], ui: FirstCatch["uiLanguage"]) {
  const meaning = { ja: "コーヒー", en: "coffee", "zh-TW": "咖啡" }[ui];
  return CardSchema.parse({
    headword_zh: target === "en" ? "coffee" : "咖啡",
    meaning_ja: meaning,
    reading_zhuyin: target === "en" ? "/ˈkɔːfi/" : "ㄎㄚ ㄈㄟ",
    pinyin: target === "en" ? "" : "kā fēi",
    part_of_speech: "N",
    level: "",
    category_key: "drink",
    example_sentence: target === "en" ? "I'd like a coffee, please." : "我想要一杯咖啡。",
    example_translation: {
      ja: "コーヒーを1杯お願いします。",
      en: "I'd like a coffee, please.",
      "zh-TW": "我想要一杯咖啡。",
    }[ui],
    // 本番のカード（`first-catch-ai.server.ts` の card）と同じく、チャンクと追加の例文も
    // 1回の返事に入っている。単語の詳細の段で、例文の下にチャンクが並ぶのを見る。
    extras: {
      usage_chunks:
        target === "en"
          ? [
              {
                parts: [
                  { text: "grab", pos: "V" },
                  { text: "a coffee", pos: "O" },
                ],
                ja: { ja: "コーヒーを買う", en: "get a coffee", "zh-TW": "買杯咖啡" }[ui],
              },
              {
                parts: [
                  { text: "a cup of", pos: "M" },
                  { text: "coffee", pos: "O" },
                ],
                ja: { ja: "コーヒー1杯", en: "one cup of coffee", "zh-TW": "一杯咖啡" }[ui],
              },
            ]
          : [
              {
                parts: [
                  { text: "喝", pos: "V" },
                  { text: "咖啡", pos: "O" },
                ],
                ja: { ja: "コーヒーを飲む", en: "drink coffee", "zh-TW": "喝咖啡" }[ui],
              },
              {
                parts: [
                  { text: "一杯", pos: "M" },
                  { text: "咖啡", pos: "O" },
                ],
                ja: { ja: "コーヒー1杯", en: "a cup of coffee", "zh-TW": "一杯咖啡" }[ui],
              },
            ],
    },
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
/**
 * 見本の写真（カフェ）の候補 — `?step=pick` の画面の見本だけに使う。
 * 撮った写真の解析結果として出すことは無い（撮る画面は本物の分析へ行き、見本では失敗を出す）。
 */
function sampleSuggestions(target: FirstCatch["targetLanguage"], ui: FirstCatch["uiLanguage"]) {
  const zh = target !== "en";
  const rows: Array<[string, string, string, Record<FirstCatch["uiLanguage"], string>, string]> = [
    [
      zh ? "咖啡" : "coffee",
      zh ? "ㄎㄚ ㄈㄟ" : "/ˈkɔːfi/",
      zh ? "kāfēi" : "",
      { ja: "コーヒー", en: "coffee", "zh-TW": "咖啡" },
      "drink",
    ],
    [
      zh ? "杯子" : "cup",
      zh ? "ㄅㄟ ㄗ˙" : "/kʌp/",
      zh ? "bēizi" : "",
      { ja: "カップ", en: "cup", "zh-TW": "杯子" },
      "kitchenware",
    ],
    [
      zh ? "花" : "flower",
      zh ? "ㄏㄨㄚ" : "/ˈflaʊər/",
      zh ? "huā" : "",
      { ja: "花", en: "flower", "zh-TW": "花" },
      "flower",
    ],
    [
      zh ? "桌子" : "table",
      zh ? "ㄓㄨㄛ ㄗ˙" : "/ˈteɪbəl/",
      zh ? "zhuōzi" : "",
      { ja: "テーブル", en: "table", "zh-TW": "桌子" },
      "furniture",
    ],
  ];
  return FirstCatchSuggestionsSchema.parse({
    suggestions: rows.map(([headword, reading_zhuyin, pinyin, meaning, category_key]) => ({
      headword,
      reading_zhuyin,
      pinyin,
      meaning_ja: meaning[ui],
      category_key,
    })),
  }).suggestions;
}

export function FirstCatchScene({ q }: { q: URLSearchParams }) {
  const pickStep = q.get("step") === "pick";
  const [draft, setDraft] = useState<FirstCatch>(() => {
    const step = FirstCatchSchema.shape.stage.safeParse(pickStep ? "camera" : q.get("step"));
    const stage = step.success ? step.data : "intro";
    const targetLanguage =
      q.get("target") === "en" ? "en" : q.get("target") === "zh-TW" ? "zh-TW" : getTargetLang();
    // 本番のウェルカムと同じ決め方（選んでいなければブラウザの言語。`?browser=en-US`）。
    const uiLanguage = initialUiLang();
    const sample =
      pickStep ||
      ["card", "added", "dex", "explore", "review", "complete", "account"].includes(stage);
    // 発音の釦は「鳴らせるようになってから」出る（本番）。見本では音の支度が済んだことにする。
    readySpeech(
      targetLanguage === "en"
        ? ["coffee", "cup", "flower", "table"]
        : ["咖啡", "杯子", "花", "桌子"],
      targetLanguage,
    );
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
      reviewCompleted: ["complete", "account"].includes(stage),
      photo: sample ? "/first-catch-cafe.webp" : null,
      card: sample && !pickStep ? sampleCard(targetLanguage, uiLanguage) : null,
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
          initialSettingsOpen={q.get("settings") === "1"}
          initialSuggestions={
            pickStep ? sampleSuggestions(draft.targetLanguage, draft.uiLanguage) : undefined
          }
          services={services}
          persist={async (next) => {
            if (q.get("fail") === "storage" && next.stage === "added")
              throw new Error("Storage full");
            // 最初の画面の「はじめる」で保存できない端末（`?fail=start`）。理由と再試行が出るか。
            if (q.get("fail") === "start" && next.stage === "questions")
              throw new Error("Storage full");
            setDraft(next);
          }}
          onAccount={() => setAccount(true)}
        />
      )}
      {q.get("tour") === "1" && <TourChapters q={q} />}
    </>
  );
}

/**
 * **見本の帯の下に、チュートリアルを本物の画面の大きさで開く**（オーナー報告 2026-10-03
 * 「ギャラリーを表示するが上のデモのバーに隠れて見えない」）。
 *
 * 見比べの帯（`ReviewBar`）と章の帯は画面の一番上に重なっていた。本物の画面は上端から
 * 始まる（図鑑の表示の切替・上の帯）ので、案内が指す物と札がその下に隠れ、押しても帯が
 * 受けていた。チュートリアルは**帯の下の iframe の中**で開く — 中は帯の無い1つの画面
 * （`innerHeight`・固定の物・安全領域が本物と同じ）なので、何も隠れない。
 * 最初の画面（`step` 無し / `intro`）は今まで通り（並べ方の帯がそちらを扱う）。
 */
export function embedsTutorial(q: URLSearchParams, wanted: string, showReviewBar: boolean) {
  return (
    wanted === "first-catch" &&
    (q.get("step") ?? "intro") !== "intro" &&
    q.get("embedded") !== "1" &&
    (showReviewBar || q.get("tour") === "1")
  );
}
export function TutorialHarnessFrame({ q, bar }: { q: URLSearchParams; bar: ReactNode }) {
  const inner = new URLSearchParams(q);
  inner.delete("review");
  inner.delete("tour");
  inner.set("embedded", "1");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      {bar}
      {q.get("tour") === "1" && <TourChapters q={q} />}
      <iframe
        title="tutorial"
        src={`?${inner.toString()}`}
        style={{ flex: "1 1 auto", width: "100%", border: 0, display: "block" }}
      />
    </div>
  );
}

/**
 * **チュートリアルのコマ割りを見る帯**（`?scene=first-catch&step=home&tour=1`）。
 *
 * 章ごとに最初のコマから開き直せる（開き直すと、画面だけを見せる → 枠が広がる → 札、の
 * 順をもう一度見られる）。アプリの画面の**外**（上）に置く — 中に重ねると案内を隠す。
 * 見本の帯なので本番には無い。
 */
const CHAPTERS: Array<[string, string]> = [
  ["home", "1 ホーム → カメラ"],
  ["camera", "2 撮る"],
  ["pick", "2 候補を選ぶ"],
  ["card", "2 意味と発音 → はがす"],
  ["dex", "3 図鑑（めくる → ギャラリー → 開く）"],
  ["explore", "4 単語の詳細"],
  ["review", "5 復習"],
  ["complete", "完了"],
];
function TourChapters({ q }: { q: URLSearchParams }) {
  const go = (step: string) => {
    const next = new URLSearchParams(location.search);
    next.set("step", step);
    location.search = next.toString();
  };
  return (
    <div
      style={{
        flex: "none",
        display: "flex",
        gap: 6,
        alignItems: "center",
        padding: "6px 10px",
        background: "#1e293b",
        color: "#fff",
        fontSize: 12,
      }}
    >
      <span style={{ opacity: 0.75 }}>章</span>
      <select
        aria-label="章"
        value={q.get("step") ?? "home"}
        onChange={(e) => go(e.target.value)}
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          padding: "4px 6px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.14)",
          color: "#fff",
          border: "none",
        }}
      >
        {CHAPTERS.map(([step, label]) => (
          <option key={step} value={step} style={{ color: "#111827" }}>
            {label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => go(q.get("step") ?? "home")}
        style={{
          flex: "none",
          whiteSpace: "nowrap",
          padding: "4px 12px",
          borderRadius: 999,
          background: "#2563eb",
          color: "#fff",
        }}
      >
        もう一度
      </button>
    </div>
  );
}
