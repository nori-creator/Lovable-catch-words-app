import { describe, expect, it } from "vitest";
import {
  filterModels,
  fromFeatureSpec,
  parseOpenRouterModels,
  priceLabel,
  toFeatureSpec,
} from "./openrouter-models";

const RAW = {
  data: [
    {
      id: "google/gemini-2.5-flash",
      name: "Google: Gemini 2.5 Flash",
      context_length: 1048576,
      architecture: { input_modalities: ["text", "image"] },
      pricing: { prompt: "0.0000003", completion: "0.0000025" },
    },
    {
      id: "deepseek/deepseek-chat-v3:free",
      name: "DeepSeek V3 (free)",
      context_length: 163840,
      architecture: { input_modalities: ["text"] },
      pricing: { prompt: "0", completion: "0" },
    },
    { id: "", name: "壊れた行" },
    { name: "id の無い行" },
    "文字列の行",
  ],
};

describe("OpenRouter のモデル一覧", () => {
  it("SDK と同じ名前（snake_case）で読み、100万トークンあたりに直す。壊れた行は落とす", () => {
    const m = parseOpenRouterModels(RAW);
    expect(m.map((x) => x.id)).toEqual([
      "deepseek/deepseek-chat-v3:free",
      "google/gemini-2.5-flash",
    ]);
    const g = m.find((x) => x.id.startsWith("google"))!;
    expect(g.inPerM).toBeCloseTo(0.3);
    expect(g.outPerM).toBeCloseTo(2.5);
    expect(g.vision).toBe(true);
    expect(g.context).toBe(1048576);
  });

  it("形の違う返事は空の一覧（画面を落とさない）", () => {
    expect(parseOpenRouterModels(null)).toEqual([]);
    expect(parseOpenRouterModels({ data: "x" })).toEqual([]);
  });

  it("探す欄: 語を全部含む物。スキャンは画像を読めるモデルだけ", () => {
    const m = parseOpenRouterModels(RAW);
    expect(filterModels(m, "gemini flash").map((x) => x.id)).toEqual(["google/gemini-2.5-flash"]);
    expect(filterModels(m, "", { visionOnly: true }).map((x) => x.id)).toEqual([
      "google/gemini-2.5-flash",
    ]);
  });

  it("値段の表示", () => {
    const [free, g] = parseOpenRouterModels(RAW);
    expect(priceLabel(free, "無料")).toBe("無料");
    expect(priceLabel(g, "無料")).toBe("$0.30 / $2.50");
  });

  it("保存する値は openrouter:<id>。id の中の : も保つ", () => {
    expect(toFeatureSpec("deepseek/deepseek-chat-v3:free")).toBe(
      "openrouter:deepseek/deepseek-chat-v3:free",
    );
    expect(fromFeatureSpec("openrouter:deepseek/deepseek-chat-v3:free")).toBe(
      "deepseek/deepseek-chat-v3:free",
    );
    expect(fromFeatureSpec("anthropic:claude")).toBeNull();
  });
});
