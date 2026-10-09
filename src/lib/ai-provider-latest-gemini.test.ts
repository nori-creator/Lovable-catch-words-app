import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  concreteModelId,
  describeModel,
  forFeature,
  getAi,
  getAiAttemptChain,
} from "./ai-provider.server";
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

describe("記録に残すモデル名は版付きの ID（合言葉のまま残さない）", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetGeminiLatestCache();
  });

  function stubModelList() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) =>
        String(url).includes("generativelanguage.googleapis.com")
          ? new Response(
              JSON.stringify({
                models: ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.5-pro"].map(
                  (id) => ({
                    name: `models/${id}`,
                    supportedGenerationMethods: ["generateContent"],
                  }),
                ),
              }),
            )
          : new Response("{}", { status: 500 }),
      ),
    );
  }

  it("concreteModelId: Google の合言葉は版へ、それ以外はそのまま", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    stubModelList();
    expect(await concreteModelId({ name: "google" }, "latest-flash")).toBe("gemini-3.5-flash");
    expect(await concreteModelId({ name: "google" }, "latest-pro")).toBe("gemini-3.5-pro");
    expect(await concreteModelId({ name: "google" }, "gemini-2.5-pro")).toBe("gemini-2.5-pro");
    expect(await concreteModelId({ name: "openai" }, "latest-pro")).toBe("latest-pro");
  });

  it("撮影の候補の各回の名前（ai_runs の label）は版付き", async () => {
    vi.stubEnv("AI_PROVIDER", "google");
    vi.stubEnv("GEMINI_API_KEY", "k");
    vi.stubEnv("LOVABLE_API_KEY", "");
    for (const k of [
      "OPENROUTER_API_KEY",
      "OPENROUTER_KEY",
      "OPEN_ROUTER_API_KEY",
      "OPENROUTER_TOKEN",
    ])
      vi.stubEnv(k, "");
    vi.stubEnv("AI_MODEL_FAST", "");
    vi.stubEnv("AI_MODEL_RICH", "");
    stubModelList();
    const chain = await getAiAttemptChain("scan");
    expect(chain.map((t) => t.label)).toEqual([
      "google:gemini-3.5-flash-lite",
      "google:gemini-3.1-flash-lite",
    ]);
    // 呼ぶ物は合言葉のまま（ゲートウェイが呼ぶ時に解く・404 なら固定の版へ落とす）。
    expect(chain[0].model.modelId).toBe("latest-flash-lite");
  });

  it("日記の添削は journal_entries.model に版付きの ID を残す", () => {
    const src = readFileSync(new URL("./journal.functions.ts", import.meta.url), "utf8");
    expect(src).toMatch(/model: await concreteModelId\(ai, richModel\)/);
    expect(src).not.toMatch(/model: richModel,/);
  });
});
