import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPENROUTER_IMAGE_MODEL,
  pickOpenRouterImage,
  readImageConfig,
  resolveImageConfig,
} from "./image-provider";

describe("readImageConfig", () => {
  it("何も設定しなければ今までどおり（Lovable・写真が先）", () => {
    expect(readImageConfig({})).toMatchObject({ provider: "lovable", mode: "photo-first" });
  });

  it("OpenRouter を選び、型番が無ければ既定の型番", () => {
    const c = readImageConfig({ IMAGE_PROVIDER: "OpenRouter" });
    expect(c.provider).toBe("openrouter");
    expect(c.model).toBe(DEFAULT_OPENROUTER_IMAGE_MODEL);
  });

  it("型番と順番を指定できる", () => {
    const c = readImageConfig({
      IMAGE_PROVIDER: "openrouter",
      IMAGE_MODEL: " google/some-image-model ",
      IMAGE_SEARCH_MODE: "ai-first",
    });
    expect(c).toEqual({
      provider: "openrouter",
      model: "google/some-image-model",
      mode: "ai-first",
    });
  });

  it("打ち間違いは既定に戻す（止めない）", () => {
    expect(readImageConfig({ IMAGE_PROVIDER: "openruoter" }).provider).toBe("lovable");
    expect(readImageConfig({ IMAGE_SEARCH_MODE: "ai" }).mode).toBe("photo-first");
  });

  it("off で作らない", () => {
    expect(readImageConfig({ IMAGE_PROVIDER: "off" }).provider).toBe("off");
  });

  it("Google と OpenAI は専用のモデルを使う", () => {
    expect(readImageConfig({ IMAGE_PROVIDER: "google" }).model).toBe("gemini-2.5-flash-image");
    expect(readImageConfig({ IMAGE_PROVIDER: "openai" }).model).toBe("gpt-image-1-mini");
  });

  it("開発者設定が環境の既定より優先され、別の提供元のモデルは引き継がない", () => {
    expect(
      resolveImageConfig(
        { IMAGE_PROVIDER: "openrouter", IMAGE_MODEL: "old/model" },
        { provider: "google" },
      ),
    ).toMatchObject({ provider: "google", model: "gemini-2.5-flash-image" });
    expect(resolveImageConfig({}, { provider: "openai", model: "gpt-image-1" })).toMatchObject({
      provider: "openai",
      model: "gpt-image-1",
    });
  });
});

describe("pickOpenRouterImage", () => {
  it("絵の専用の口の形", () => {
    expect(pickOpenRouterImage({ data: [{ b64_json: "AAA", media_type: "image/webp" }] })).toBe(
      "data:image/webp;base64,AAA",
    );
  });
  it("会話の口の形", () => {
    expect(
      pickOpenRouterImage({
        choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,BBB" } }] } }],
      }),
    ).toBe("data:image/png;base64,BBB");
  });
  it("何も無ければ null", () => {
    expect(pickOpenRouterImage({})).toBeNull();
    expect(pickOpenRouterImage(null)).toBeNull();
  });
});
