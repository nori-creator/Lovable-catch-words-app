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

import {
  describeTask,
  forgetAiModelOverride,
  getAiAttemptChain,
  getAiFor,
  resolveBackupFor,
} from "./ai-provider.server";

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
  "OPENROUTER_API_KEY",
  "OPENROUTER_KEY",
  "OPEN_ROUTER_API_KEY",
  "OPENROUTER_TOKEN",
  "AI_BASE_URL",
  "AI_API_KEY",
];

describe("用途ごとの AI と控え（2026-10-14）", () => {
  beforeEach(() => {
    for (const n of ENV_NAMES) vi.stubEnv(n, "");
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    vi.stubEnv("LOVABLE_API_KEY", "l-key");
    store.aiModels = null;
    forgetAiModelOverride();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    forgetAiModelOverride();
  });

  it("用途の設定は機能の設定より先に効く（ほかの用途は機能の設定のまま）", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "a-key");
    store.aiModels = {
      features: { card: "google:gemini-3.8-flash" },
      tasks: { section_regen: "anthropic:claude-sonnet-5-5" },
    };
    const regen = await getAiFor("card", "section_regen");
    expect(regen.name).toBe("anthropic");
    expect(regen.modelRichPremium).toBe("claude-sonnet-5-5");
    const card = await getAiFor("card", "card");
    expect(card.name).toBe("google");
    expect(card.modelFast).toBe("gemini-3.8-flash");
  });

  it("用途に選んだ会社の鍵が無ければ、機能の設定・既定で動く", async () => {
    store.aiModels = { tasks: { section_regen: "anthropic:claude-sonnet-5-5" } };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ai = await getAiFor("card", "section_regen");
    expect(ai.name).toBe("google");
  });

  it("既定の控えは別の会社（Google が1番手なら Lovable の Gemini 2.5 Flash）", async () => {
    const b = await resolveBackupFor("card", "section_regen", "google");
    expect(b).toMatchObject({ name: "lovable", model: "google/gemini-2.5-flash" });
    // Lovable が1番手なら Google の最新の版（機能の段の合言葉）。
    const g = await resolveBackupFor("scan", "photo_candidates", "lovable");
    expect(g).toMatchObject({ name: "google", model: "latest-flash-lite" });
  });

  it("控えは選べる・止められる（off）。鍵の無い控えは既定へ落ちる", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "a-key");
    store.aiModels = {
      backups: {
        report_locate: "off",
        section_regen: "anthropic:claude-haiku-5-5",
        card: "openai:gpt-5-mini",
      },
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await resolveBackupFor("audit", "report_locate", "google")).toBeNull();
    expect(await resolveBackupFor("card", "section_regen", "google")).toMatchObject({
      name: "anthropic",
      model: "claude-haiku-5-5",
    });
    expect(await resolveBackupFor("card", "card", "google")).toMatchObject({ name: "lovable" });
  });

  it("2番手を持つ用途（写真の候補など）も、選んだ控えを2番手にする。off なら1回だけ", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "a-key");
    store.aiModels = { backups: { photo_candidates: "anthropic:claude-haiku-5-5", card: "off" } };
    const chain = await getAiAttemptChain("scan", "photo_candidates");
    expect(chain.map((c) => c.label)).toEqual([
      expect.stringMatching(/^google:/),
      "anthropic:claude-haiku-5-5",
    ]);
    expect(await getAiAttemptChain("card", "card")).toHaveLength(1);
  });

  it("管理画面の確認用: いまの AI と控えを返す（鍵の値は含めない）", async () => {
    store.aiModels = { tasks: { card: "lovable:google/gemini-2.5-flash" } };
    const d = await describeTask("card", "card");
    expect(d).toMatchObject({
      provider: "lovable",
      model: "google/gemini-2.5-flash",
      backup: { provider: "google", model: "latest-flash" },
    });
    expect(JSON.stringify(d)).not.toMatch(/g-key|l-key/);
  });
});
