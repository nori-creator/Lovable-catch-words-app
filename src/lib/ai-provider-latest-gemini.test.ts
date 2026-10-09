import { afterEach, describe, expect, it, vi } from "vitest";
import { describeModel, forFeature, getAi } from "./ai-provider.server";
import { resetGeminiLatestCache } from "./gemini-latest.server";

describe("Google の既定は「いつも最新」の合言葉", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetGeminiLatestCache();
  });

  it("env が無ければ latest-flash-lite / latest-flash / latest-pro、あれば固定", () => {
    vi.stubEnv("AI_PROVIDER", "google");
    vi.stubEnv("GEMINI_API_KEY", "k");
    vi.stubEnv("AI_MODEL_FAST", "");
    vi.stubEnv("AI_MODEL_RICH", "");
    vi.stubEnv("AI_MODEL_RICH_PREMIUM", "");
    const ai = getAi();
    expect([ai.modelFast, ai.modelRich, ai.modelRichPremium]).toEqual([
      "latest-flash-lite",
      "latest-flash",
      "latest-pro",
    ]);
    // 合言葉はゲートウェイが受け取り、版付きでない ID はそのまま。
    expect(ai.gateway("latest-flash").modelId).toBe("latest-flash");
    expect(ai.gateway("gemini-2.5-flash").modelId).toBe("gemini-2.5-flash");

    vi.stubEnv("AI_MODEL_FAST", "gemini-3.1-flash-lite");
    expect(getAi().modelFast).toBe("gemini-3.1-flash-lite");
  });

  it("画面の確認用に「合言葉 → 版」を出す", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              models: [
                {
                  name: "models/gemini-3.5-flash-lite",
                  supportedGenerationMethods: ["generateContent"],
                },
              ],
            }),
          ),
      ),
    );
    expect(await describeModel({ name: "google" }, "latest-flash-lite")).toBe(
      "latest-flash-lite → gemini-3.5-flash-lite",
    );
    expect(await describeModel({ name: "google" }, "gemini-2.5-pro")).toBe("gemini-2.5-pro");
    expect(await describeModel({ name: "openai" }, "latest-pro")).toBe("latest-pro");
  });
});

describe("速い方(Flash-Lite)はスキャンだけ", () => {
  it("スキャン以外の機能は速い方も丁寧な方(Flash)に揃う", () => {
    const ai = {
      provider: "google" as const,
      name: "google",
      gateway: (() => null) as never,
      modelFast: "latest-flash-lite",
      modelRich: "latest-flash",
      modelRichPremium: "latest-pro",
    };
    expect(forFeature(ai, "scan").modelFast).toBe("latest-flash-lite");
    for (const f of ["card", "review", "journal", "audit"] as const) {
      expect(forFeature(ai, f).modelFast).toBe("latest-flash");
      expect(forFeature(ai, f).modelRich).toBe("latest-flash");
      expect(forFeature(ai, f).modelRichPremium).toBe("latest-pro");
    }
  });
});
