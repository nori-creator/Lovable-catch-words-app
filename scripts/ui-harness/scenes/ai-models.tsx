/**
 * 開発者だけの設定: 機能ごとに使う AI を OpenRouter の一覧から選ぶ。
 * （オーナー指示 2026-09-22「これみたいに簡単に設定したい」）
 *
 * 通信はしないので、一覧は OpenRouter の返事と同じ形の見本を渡す
 * （`parseOpenRouterModels` を通す — 実物と同じ読み方）。
 * スキャンの行は開いた形（画像を読めるモデルだけが出る）。
 */
import { useEffect, useState } from "react";
import { ModelPicker } from "@/components/ModelPicker";
import { parseOpenRouterModels } from "@/lib/openrouter-models";

const MODELS = parseOpenRouterModels({
  data: [
    ["google/gemini-2.5-flash", "Google: Gemini 2.5 Flash", "0.0000003", "0.0000025", true],
    ["google/gemini-2.5-pro", "Google: Gemini 2.5 Pro", "0.00000125", "0.00001", true],
    ["anthropic/claude-sonnet-4.5", "Anthropic: Claude Sonnet 4.5", "0.000003", "0.000015", true],
    ["openai/gpt-4o-mini", "OpenAI: GPT-4o-mini", "0.00000015", "0.0000006", true],
    ["deepseek/deepseek-chat-v3:free", "DeepSeek V3 (free)", "0", "0", false],
    ["moonshotai/kimi-k2", "MoonshotAI: Kimi K2", "0.0000006", "0.0000025", false],
  ].map(([id, name, p, c, vision]) => ({
    id,
    name,
    pricing: { prompt: p, completion: c },
    architecture: { input_modalities: vision ? ["text", "image"] : ["text"] },
  })),
});

const FEATURES = [
  ["scan", "スキャン(速さ優先)"],
  ["card", "単語カード生成"],
  ["review", "復習の添削・ヒント"],
  ["journal", "日記の添削"],
  ["audit", "自己改善の点検"],
] as const;

export function AiModelsScene() {
  const [v, setV] = useState<Record<string, string>>({
    card: "openrouter:anthropic/claude-sonnet-4.5",
    review: "openrouter:deepseek/deepseek-chat-v3:free",
  });
  // スキャンの行を開いた形で撮る。
  useEffect(() => {
    const id = window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>("[data-picker=scan] button")?.click();
    }, 50);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
      <p className="text-footnote font-semibold">機能ごとのAI</p>
      {FEATURES.map(([id, label]) => (
        <div key={id} data-picker={id}>
          <ModelPicker
            label={label}
            value={v[id] ?? ""}
            onChange={(spec) => setV((p) => ({ ...p, [id]: spec }))}
            models={MODELS}
            visionOnly={id === "scan"}
          />
        </div>
      ))}
    </div>
  );
}
