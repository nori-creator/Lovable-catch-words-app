import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** `app_config.ai_models` の中身（試験ごとに入れ替える）。 */
const store: { aiModels: unknown } = { aiModels: null };

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { value: store.aiModels } }) }),
      }),
    }),
  },
}));

import { forgetAiModelOverride, getAiFor } from "./ai-provider.server";
import { AI_FEATURES, featureTier, normalizeFeatureValue, parseFeatureValue } from "./ai-features";

const ENV_NAMES = [
  "AI_PROVIDER",
  "AI_MODEL_FAST",
  "AI_MODEL_RICH",
  "AI_MODEL_RICH_PREMIUM",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_AI_STUDIO_API_KEY",
  "GEMINI_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "LOVABLE_API_KEY",
  "AI_BASE_URL",
  "AI_API_KEY",
];

describe("機能ごとの AI の優先順位（設定 > env AI_MODEL_* > 合言葉の既定）", () => {
  beforeEach(() => {
    for (const n of ENV_NAMES) vi.stubEnv(n, "");
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    store.aiModels = null;
    forgetAiModelOverride();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    forgetAiModelOverride();
  });

  it("何も無ければ: スキャンは最新の Flash-Lite、ほかは全部最新の Flash", async () => {
    for (const f of AI_FEATURES) {
      const ai = await getAiFor(f.id);
      expect(ai.name).toBe("google");
      expect(ai.modelFast).toBe(f.id === "scan" ? "latest-flash-lite" : "latest-flash");
      expect(featureTier(f.id)).toBe(f.id === "scan" ? "flash-lite" : "flash");
    }
  });

  it("env の AI_MODEL_* は合言葉より勝つ", async () => {
    vi.stubEnv("AI_MODEL_FAST", "gemini-3.1-flash-lite");
    vi.stubEnv("AI_MODEL_RICH", "gemini-3.5-flash");
    expect((await getAiFor("scan")).modelFast).toBe("gemini-3.1-flash-lite");
    expect((await getAiFor("card")).modelFast).toBe("gemini-3.5-flash");
  });

  it("機能ごとの設定は env より勝つ（その機能だけ）", async () => {
    vi.stubEnv("AI_MODEL_RICH", "gemini-3.5-flash");
    vi.stubEnv("OPENAI_API_KEY", "o-key");
    store.aiModels = { features: { card: "openai:gpt-5-mini" } };
    const card = await getAiFor("card");
    expect(card.name).toBe("openai");
    expect([card.modelFast, card.modelRich, card.modelRichPremium]).toEqual([
      "gpt-5-mini",
      "gpt-5-mini",
      "gpt-5-mini",
    ]);
    // ほかの機能は env のまま。
    expect((await getAiFor("journal")).modelFast).toBe("gemini-3.5-flash");
  });

  it('"auto" は既定と同じ', async () => {
    store.aiModels = { features: { scan: "auto", review: "AUTO" } };
    expect((await getAiFor("scan")).modelFast).toBe("latest-flash-lite");
    expect((await getAiFor("review")).modelFast).toBe("latest-flash");
  });

  it("鍵の無い会社を選んでいたら、止めずに既定へ落ちる", async () => {
    store.aiModels = { features: { journal: "anthropic:claude-sonnet-4-5" } };
    const ai = await getAiFor("journal");
    expect(ai.name).toBe("google");
    expect(ai.modelFast).toBe("latest-flash");
  });

  it("古い全体の上書き（provider / fast / rich）は読まない — env が黙って無視される罠を無くした", async () => {
    vi.stubEnv("OPENAI_API_KEY", "o-key");
    vi.stubEnv("AI_MODEL_RICH", "gemini-3.5-flash");
    store.aiModels = { provider: "openai", fast: "gpt-4o-mini", rich: "gpt-4o" };
    const ai = await getAiFor("card");
    expect(ai.name).toBe("google");
    expect(ai.modelFast).toBe("gemini-3.5-flash");
  });

  it("新しく足した機能（読みの突き合わせ・辞書の手入れ）も個別に切り替えられる", async () => {
    vi.stubEnv("OPENAI_API_KEY", "o-key");
    store.aiModels = {
      features: { reading_check: "openai:gpt-5-mini", lexicon: "google:latest-pro" },
    };
    expect((await getAiFor("reading_check")).name).toBe("openai");
    const lex = await getAiFor("lexicon");
    expect(lex.name).toBe("google");
    expect(lex.modelFast).toBe("latest-pro");
    expect((await getAiFor("audit")).name).toBe("google");
  });

  it("古い形の「モデル名だけ」は既定の会社のままモデルを差し替える", async () => {
    store.aiModels = { features: { card: "gemini-3.5-flash" } };
    const ai = await getAiFor("card");
    expect(ai.name).toBe("google");
    expect(ai.modelRich).toBe("gemini-3.5-flash");
  });
});

describe("値の形", () => {
  it("parseFeatureValue", () => {
    expect(parseFeatureValue("auto")).toBeNull();
    expect(parseFeatureValue("")).toBeNull();
    expect(parseFeatureValue(undefined)).toBeNull();
    expect(parseFeatureValue("openrouter:anthropic/claude-sonnet-4.5")).toEqual({
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4.5",
    });
    expect(parseFeatureValue("gpt-5")).toEqual({ provider: "", model: "gpt-5" });
  });

  it("normalizeFeatureValue は auto か 会社:モデル だけを通す", () => {
    expect(normalizeFeatureValue(" Auto ")).toBe("auto");
    expect(normalizeFeatureValue("")).toBe("auto");
    expect(normalizeFeatureValue("openai:gpt-5-mini")).toBe("openai:gpt-5-mini");
    expect(() => normalizeFeatureValue("gpt-5-mini")).toThrow();
    expect(() => normalizeFeatureValue("openai:")).toThrow();
    expect(() => normalizeFeatureValue("open ai:x")).toThrow();
    expect(() => normalizeFeatureValue("openai:a b")).toThrow();
    expect(() => normalizeFeatureValue(42)).toThrow();
  });
});
