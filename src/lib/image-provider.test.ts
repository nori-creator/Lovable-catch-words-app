import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPENROUTER_IMAGE_MODEL,
  pickOpenRouterImage,
  readImageConfig,
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
