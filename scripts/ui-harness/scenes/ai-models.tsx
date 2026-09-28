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
import { tStatic as t } from "@/lib/i18n";

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
  // 本物の設定（`AiModelPanel`）と同じ並び: ①動いているか ②機能ごと（何に使うかの1行つき）
  // ③詳しい設定は閉じたまま（オーナー指示 2026-09-27「もっと見やすく、簡潔に機能ごとに」）。
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-body font-semibold">{t("settings.aiSwitch")}</p>
      <p className="mt-2 rounded-xl bg-ok/10 p-2 text-caption font-semibold text-ok-ink">
        {t("settings.aiOk", { p: "gemini" })}
      </p>
      <p className="mt-1 text-caption text-muted-foreground">
        {t("settings.aiDefaultModels", { f: "gemini-2.5-flash", r: "gemini-2.5-pro" })}
      </p>
      <div className="mt-3 space-y-3">
        {FEATURES.map(([id]) => (
          <div key={id} data-picker={id} className="rounded-xl border border-border p-2.5">
            <div>
              <ModelPicker
                label={t(`settings.aiFeature.${id}`)}
                value={v[id] ?? ""}
                onChange={(spec) => setV((p) => ({ ...p, [id]: spec }))}
                models={MODELS}
                visionOnly={id === "scan"}
              />
            </div>
            <p className="mt-1 px-1 text-caption leading-snug text-muted-foreground">
              {t(`settings.aiFeatureDesc.${id}`)}
            </p>
            {v[id] && (
              <button
                type="button"
                onClick={() =>
                  setV((p) => {
                    const n = { ...p };
                    delete n[id];
                    return n;
                  })
                }
                className="mt-1 inline-flex min-h-11 items-center text-caption font-semibold text-primary"
              >
                {t("settings.aiReset")}
              </button>
            )}
          </div>
        ))}
      </div>
      <details className="mt-3 rounded-xl border border-border p-2">
        <summary className="min-h-11 cursor-pointer list-none content-center text-footnote font-semibold">
          {t("settings.aiAdvanced")}
        </summary>
      </details>
    </div>
  );
}
