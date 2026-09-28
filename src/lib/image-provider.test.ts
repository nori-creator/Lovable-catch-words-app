import { describe, expect, it } from "vitest";
import {
  DEFAULT_HIGGSFIELD_IMAGE_MODEL,
  DEFAULT_OPENROUTER_IMAGE_MODEL,
  pickHiggsfieldResult,
  pickOpenRouterImage,
  readHiggsfieldCredentials,
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

describe("Higgsfield", () => {
  it("公式の名前 HF_CREDENTIALS（鍵ID:鍵の秘密）を拾い、名前だけを出所として返す", () => {
    const c = readHiggsfieldCredentials({ HF_CREDENTIALS: "id1:sec1" });
    expect(c).toEqual({ credentials: "id1:sec1", source: "HF_CREDENTIALS" });
  });

  it("ID と秘密を別々に入れても拾う（SDK の古い形・よくある名前）", () => {
    expect(readHiggsfieldCredentials({ HF_API_KEY: "a", HF_API_SECRET: "b" })?.credentials).toBe(
      "a:b",
    );
    expect(
      readHiggsfieldCredentials({ HIGGSFIELD_API_KEY: "a", HIGGSFIELD_API_SECRET: "b" })?.source,
    ).toBe("HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET");
    // 1つの名前に丸ごと入れた場合も。
    expect(readHiggsfieldCredentials({ HIGGSFIELD_API_KEY: "a:b" })?.credentials).toBe("a:b");
  });

  it("コロンの無い半端な値は鍵と見なさない", () => {
    expect(readHiggsfieldCredentials({ HF_CREDENTIALS: "onlyid" })).toBeNull();
    expect(readHiggsfieldCredentials({})).toBeNull();
  });

  it("鍵があり IMAGE_PROVIDER が空なら Higgsfield を使う。明示の指定が勝つ", () => {
    expect(readImageConfig({ HF_CREDENTIALS: "a:b" })).toMatchObject({
      provider: "higgsfield",
      model: DEFAULT_HIGGSFIELD_IMAGE_MODEL,
    });
    expect(readImageConfig({ HF_CREDENTIALS: "a:b", IMAGE_PROVIDER: "lovable" }).provider).toBe(
      "lovable",
    );
    expect(
      readImageConfig({ HF_CREDENTIALS: "a:b", IMAGE_MODEL: "higgsfield-ai/soul/standard" }).model,
    ).toBe("higgsfield-ai/soul/standard");
  });

  it("状態の返事から絵・動画の URL を取り出す（完了以外は URL を信じない側が判断）", () => {
    expect(
      pickHiggsfieldResult({
        status: "completed",
        request_id: "r",
        images: [{ url: "https://x/i.png" }],
      }),
    ).toEqual({ status: "completed", requestId: "r", url: "https://x/i.png" });
    expect(
      pickHiggsfieldResult({ status: "completed", video: { url: "https://x/v.mp4" } }).url,
    ).toBe("https://x/v.mp4");
    expect(pickHiggsfieldResult({ status: "nsfw" })).toEqual({
      status: "nsfw",
      requestId: null,
      url: null,
    });
    expect(pickHiggsfieldResult(null).status).toBe("unknown");
  });
});
