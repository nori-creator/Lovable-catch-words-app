import { describe, expect, it } from "vitest";
import {
  NATIVE_AI_FEATURES,
  NATIVE_AI_MAX_PROMPT_CHARS,
  NATIVE_AI_ROUTING,
  NATIVE_AI_USAGE_KIND,
  NativeAiRequest,
  bearerToken,
  isDailyCapError,
} from "./native-ai";

describe("native-ai request", () => {
  it("accepts a text-only request", () => {
    expect(NativeAiRequest.parse({ feature: "card", prompt: "芒果" }).feature).toBe("card");
  });

  it("accepts a JPEG data URL", () => {
    const r = NativeAiRequest.parse({
      feature: "scan",
      prompt: "detect",
      imageBase64: "data:image/jpeg;base64,/9j/4AAQ==",
    });
    expect(r.imageBase64).toContain("base64");
  });

  it("rejects unknown features, empty prompts, huge prompts and non-image URLs", () => {
    expect(() => NativeAiRequest.parse({ feature: "admin", prompt: "x" })).toThrow();
    expect(() => NativeAiRequest.parse({ feature: "text", prompt: "" })).toThrow();
    expect(() =>
      NativeAiRequest.parse({
        feature: "text",
        prompt: "x".repeat(NATIVE_AI_MAX_PROMPT_CHARS + 1),
      }),
    ).toThrow();
    expect(() =>
      NativeAiRequest.parse({
        feature: "scan",
        prompt: "x",
        imageBase64: "https://evil.example/a.jpg",
      }),
    ).toThrow();
  });

  it("maps every feature to a model route and a usage kind", () => {
    for (const f of NATIVE_AI_FEATURES) {
      expect(NATIVE_AI_ROUTING[f]).toBeDefined();
      expect(NATIVE_AI_USAGE_KIND[f]).toBeTruthy();
    }
  });
});

describe("bearerToken", () => {
  it("extracts the token", () => {
    expect(bearerToken("Bearer abc.def")).toBe("abc.def");
  });
  it("rejects missing or malformed headers", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("Bearer ")).toBeNull();
  });
});

describe("isDailyCapError", () => {
  it("recognises the daily-cap message only", () => {
    expect(isDailyCapError(new Error("1日の利用上限(300回)に達しました。"))).toBe(true);
    expect(isDailyCapError(new Error("network"))).toBe(false);
  });
});
