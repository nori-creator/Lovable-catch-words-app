import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  ADMIN_ONLY_MESSAGE,
  BadRequestError,
  getAdminAiSettings,
  resolveAdminImageTest,
  setAdminAiFeature,
  setAdminImageConfig,
  setAdminTtsVoice,
  type AdminAiDeps,
  type AppConfigKey,
} from "./admin-ai.server";
import { AI_FEATURE_IDS } from "./ai-features";
import { statusForError } from "./native-fn";

const SECRET = "sk-THIS-IS-A-SECRET-VALUE";

/** 偽物の道具。DB は手元の表、鍵は「ある・ない」だけを知っている。 */
function fakeDeps(opts: { admin: boolean; config?: Partial<Record<AppConfigKey, unknown>> }) {
  const db: Partial<Record<AppConfigKey, unknown>> = { ...(opts.config ?? {}) };
  const writes: Array<{ key: AppConfigKey; value: unknown }> = [];
  const afterWrite = vi.fn();
  const aiKeys: Record<string, boolean> = { google: true, openai: true, anthropic: false };
  const deps: AdminAiDeps = {
    isAdmin: async () => opts.admin,
    readConfig: async (key) => db[key] ?? null,
    writeConfig: async (key, value) => {
      db[key] = value;
      writes.push({ key, value });
    },
    aiProviders: async () =>
      ["google", "openai", "anthropic"].map((id) => ({
        id,
        name: id,
        hasKey: aiKeys[id],
        models: aiKeys[id]
          ? id === "google"
            ? ["latest-flash", "gemini-3.8-flash"]
            : ["gpt-5-mini", "gpt-3.5-turbo"]
          : [],
        visionModels: aiKeys[id]
          ? id === "google"
            ? ["latest-flash", "gemini-3.8-flash"]
            : ["gpt-5-mini"]
          : [],
        error: null,
      })),
    describeFeature: async (feature) => {
      const v = ((db.ai_models as { features?: Record<string, string> } | null)?.features ?? {})[
        feature
      ];
      if (v && v.includes(":")) {
        const [p, m] = v.split(":");
        return { provider: p, model: m, resolved: m };
      }
      return feature === "scan"
        ? { provider: "google", model: "latest-flash-lite", resolved: "gemini-3.8-flash-lite" }
        : { provider: "google", model: "latest-flash", resolved: "gemini-3.8-flash" };
    },
    aiStatus: () => ({ ok: true, provider: "google", error: null }),
    imageKeys: () => ({
      lovable: true,
      openrouter: false,
      google: true,
      openai: false,
      higgsfield: false,
    }),
    // 本物の env には鍵の値がある。返事に混ざらないことを確かめるため、わざと入れておく。
    imageEnv: () => ({ LOVABLE_API_KEY: SECRET, GEMINI_API_KEY: SECRET }),
    ttsHasKey: (id) => id === "azure" || id === "gemini",
    ttsDefaultEngine: () => "OpenAI-compatible TTS",
    afterWrite,
  };
  return { deps, db, writes, afterWrite };
}

describe("権限: 管理者だけ", () => {
  it("管理者でない人の読み取りは { isAdmin: false } だけ（何も読まない）", async () => {
    const { deps } = fakeDeps({ admin: false });
    const read = vi.spyOn(deps, "readConfig");
    const providers = vi.spyOn(deps, "aiProviders");
    expect(await getAdminAiSettings(deps)).toEqual({ isAdmin: false });
    expect(read).not.toHaveBeenCalled();
    expect(providers).not.toHaveBeenCalled();
  });

  it("管理者でない人の書き込みは Forbidden（native-fn では 403）で、何も保存しない", async () => {
    const { deps, writes } = fakeDeps({ admin: false });
    const calls = [
      () => setAdminAiFeature(deps, { feature: "card", value: "openai:gpt-5-mini" }),
      () => setAdminImageConfig(deps, { provider: "google", model: "" }),
      () =>
        setAdminTtsVoice(deps, { language: "en", provider: "azure", voice: "en-US-JennyNeural" }),
    ];
    for (const call of calls) {
      const err = await call().catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe(ADMIN_ONLY_MESSAGE);
      expect(statusForError(err)).toBe(403);
    }
    expect(writes).toEqual([]);
  });
});

describe("読み取り", () => {
  it("全部の機能・会社・画像・発音の声を返し、鍵の値は1つも含めない", async () => {
    const { deps } = fakeDeps({ admin: true });
    const out = await getAdminAiSettings(deps);
    expect(out.isAdmin).toBe(true);
    if (!out.isAdmin) return;
    expect(out.features.map((f) => f.id)).toEqual([...AI_FEATURE_IDS]);
    const scan = out.features.find((f) => f.id === "scan")!;
    expect(scan).toMatchObject({
      tier: "flash-lite",
      value: "auto",
      resolved: "gemini-3.8-flash-lite",
      needsVision: true,
    });
    expect(scan.label.ja).toBe("スキャン");
    expect(out.features.find((f) => f.id === "card")).toMatchObject({
      tier: "flash",
      resolved: "gemini-3.8-flash",
    });
    expect(out.providers.find((p) => p.id === "anthropic")?.hasKey).toBe(false);
    expect(out.image).toMatchObject({ provider: "lovable" });
    expect(out.image.providers.find((p) => p.id === "openai")?.hasKey).toBe(false);
    expect(Object.keys(out.tts.languages)).toEqual(["zh-TW", "en", "ja"]);
    expect(out.tts.providers.map((p) => p.id)).toEqual(["azure", "gemini", "elevenlabs"]);
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });

  it("台湾の声は台湾華語の行にまとまる（性別つき）", async () => {
    const { deps } = fakeDeps({
      admin: true,
      config: { tts_voice: { taiwan: { provider: "azure", gender: "male" } } },
    });
    const out = await getAdminAiSettings(deps);
    if (!out.isAdmin) throw new Error("admin");
    expect(out.tts.languages["zh-TW"]).toMatchObject({
      provider: "azure",
      gender: "male",
      voice: "zh-TW-YunJheNeural",
      incomplete: false,
    });
    expect(out.tts.languages.ja.provider).toBe("default");
  });
});

describe("保存と読み戻し", () => {
  it("機能の AI: 会社:モデル を保存 → 読み戻すと同じ値、auto で消える", async () => {
    const { deps, db, afterWrite } = fakeDeps({
      admin: true,
      // 古い全体の上書きは、保存した時に消える。
      config: {
        ai_models: { provider: "openai", fast: "x", features: { journal: "google:latest-flash" } },
      },
    });
    await setAdminAiFeature(deps, { feature: "card", value: "openai:gpt-5-mini" });
    expect(db.ai_models).toEqual({
      features: { journal: "google:latest-flash", card: "openai:gpt-5-mini" },
    });
    expect(afterWrite).toHaveBeenCalledWith("ai_models");
    const out = await getAdminAiSettings(deps);
    if (!out.isAdmin) throw new Error("admin");
    expect(out.features.find((f) => f.id === "card")).toMatchObject({
      value: "openai:gpt-5-mini",
      provider: "openai",
      resolved: "gpt-5-mini",
    });
    await setAdminAiFeature(deps, { feature: "card", value: "auto" });
    expect(db.ai_models).toEqual({ features: { journal: "google:latest-flash" } });
  });

  it("鍵の無い会社・知らない会社・知らない機能・写真を読めないモデルのスキャンは断る", async () => {
    const { deps, writes } = fakeDeps({ admin: true });
    await expect(
      setAdminAiFeature(deps, { feature: "card", value: "anthropic:claude-sonnet-4-5" }),
    ).rejects.toThrow(/鍵/);
    await expect(setAdminAiFeature(deps, { feature: "card", value: "nope:x" })).rejects.toThrow(
      /知らない会社/,
    );
    await expect(setAdminAiFeature(deps, { feature: "dance", value: "auto" })).rejects.toThrow(
      /知らない機能/,
    );
    await expect(
      setAdminAiFeature(deps, { feature: "scan", value: "openai:gpt-3.5-turbo" }),
    ).rejects.toThrow(/写真/);
    await expect(
      setAdminAiFeature(deps, { feature: "scan", value: "gpt-5-mini" }),
    ).rejects.toThrow();
    expect(writes).toEqual([]);
  });

  it("画像: 鍵のある会社だけ。モデルが空ならその会社の既定。off はモデル無し", async () => {
    const { deps, db } = fakeDeps({ admin: true });
    await expect(setAdminImageConfig(deps, { provider: "openai", model: "" })).rejects.toThrow(
      /鍵/,
    );
    await setAdminImageConfig(deps, { provider: "google", model: "" });
    expect(db.image_generation).toEqual({ provider: "google", model: "gemini-2.5-flash-image" });
    const out = await getAdminAiSettings(deps);
    if (!out.isAdmin) throw new Error("admin");
    expect(out.image).toMatchObject({ provider: "google", model: "gemini-2.5-flash-image" });
    await setAdminImageConfig(deps, { provider: "off", model: "whatever" });
    expect(db.image_generation).toEqual({ provider: "off", model: "" });
  });

  it("発音の声: 台湾華語の Azure は台湾の声（性別つき）、英語は言語ごと、default で消える", async () => {
    const { deps, db } = fakeDeps({
      admin: true,
      config: {
        tts_voice: { languages: { "zh-TW": { provider: "azure", voice: "zh-TW-HsiaoYuNeural" } } },
      },
    });
    const r = await setAdminTtsVoice(deps, {
      language: "zh-TW",
      provider: "azure",
      voice: "zh-TW-YunJheNeural",
      gender: "male",
    });
    expect(r.row).toMatchObject({ provider: "azure", gender: "male", voice: "zh-TW-YunJheNeural" });
    expect(db.tts_voice).toEqual({
      taiwan: { provider: "azure", gender: "male", voices: { male: "zh-TW-YunJheNeural" } },
    });
    await setAdminTtsVoice(deps, { language: "en", provider: "azure", voice: "en-US-JennyNeural" });
    expect((db.tts_voice as { languages: unknown }).languages).toEqual({
      en: { provider: "azure", voice: "en-US-JennyNeural" },
    });
    await setAdminTtsVoice(deps, { language: "zh-TW", provider: "default" });
    expect(db.tts_voice).toEqual({
      languages: { en: { provider: "azure", voice: "en-US-JennyNeural" } },
    });
  });

  it("発音の声: 鍵の無い会社・男性に女性の Azure の声・知らない言語は断る", async () => {
    const { deps } = fakeDeps({ admin: true });
    await expect(
      setAdminTtsVoice(deps, { language: "en", provider: "elevenlabs", voice: "abc" }),
    ).rejects.toThrow(/鍵/);
    await expect(
      setAdminTtsVoice(deps, {
        language: "zh-TW",
        provider: "azure",
        voice: "zh-TW-HsiaoChenNeural",
        gender: "male",
      }),
    ).rejects.toThrow();
    await expect(
      setAdminTtsVoice(deps, { language: "fr", provider: "azure", voice: "x" }),
    ).rejects.toThrow();
  });
});

describe("送った値が使えない時は 400（500 にしない）", () => {
  async function statusOf(p: Promise<unknown>) {
    try {
      await p;
    } catch (e) {
      return statusForError(e);
    }
    throw new Error("断られなかった");
  }

  it("機能の AI: 知らない機能・知らない会社・形の違う値・鍵の無い会社・写真を読めないスキャン", async () => {
    const { deps, writes } = fakeDeps({ admin: true });
    for (const input of [
      { feature: "dance", value: "auto" },
      { feature: "card", value: "nope:x" },
      { feature: "card", value: "gpt-5-mini" },
      { feature: "card", value: "open ai:gpt-5" },
      { feature: "card", value: "anthropic:claude-sonnet-4-5" },
      { feature: "scan", value: "openai:gpt-3.5-turbo" },
    ]) {
      expect(await statusOf(setAdminAiFeature(deps, input))).toBe(400);
    }
    await expect(
      setAdminAiFeature(deps, { feature: "dance", value: "auto" }),
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(writes).toEqual([]);
  });

  it("画像: 知らない会社・鍵の無い会社", async () => {
    const { deps, writes } = fakeDeps({ admin: true });
    expect(await statusOf(setAdminImageConfig(deps, { provider: "openai", model: "" }))).toBe(400);
    expect(await statusOf(setAdminImageConfig(deps, { provider: "nope", model: "" }))).toBe(400);
    expect(writes).toEqual([]);
  });

  it("発音の声: 鍵の無い会社・違う性別の声・声の無い Gemini・声の無い英語・知らない言語", async () => {
    const { deps, writes } = fakeDeps({ admin: true });
    for (const input of [
      { language: "en", provider: "elevenlabs", voice: "abc" },
      { language: "zh-TW", provider: "azure", voice: "zh-TW-HsiaoChenNeural", gender: "male" },
      { language: "zh-TW", provider: "gemini", voice: "" },
      { language: "en", provider: "azure", voice: "" },
      { language: "fr", provider: "azure", voice: "x" },
    ]) {
      expect(await statusOf(setAdminTtsVoice(deps, input))).toBe(400);
    }
    expect(writes).toEqual([]);
  });

  it("管理者でない人は 403 のまま（400 にしない）", async () => {
    const { deps } = fakeDeps({ admin: false });
    expect(await statusOf(setAdminAiFeature(deps, { feature: "dance", value: "x" }))).toBe(403);
    expect(await statusOf(resolveAdminImageTest(deps, { provider: "google" }))).toBe(403);
  });
});

describe("「試しに1枚作る」は保存前の選び方で試せる", () => {
  it("何も送らなければ保存してある設定（これまでどおり。iOS は { query? } だけ）", async () => {
    const { deps } = fakeDeps({ admin: true });
    expect(await resolveAdminImageTest(deps, undefined)).toEqual({ query: "柚子", draft: null });
    expect(await resolveAdminImageTest(deps, { query: "芒果" })).toEqual({
      query: "芒果",
      draft: null,
    });
  });

  it("provider（と model）を送るとその選び方。保存はしない。model が空なら会社の既定", async () => {
    const { deps, writes } = fakeDeps({ admin: true });
    expect(
      await resolveAdminImageTest(deps, { provider: "google", model: "gemini-3-pro-image" }),
    ).toEqual({ query: "柚子", draft: { provider: "google", model: "gemini-3-pro-image" } });
    expect(await resolveAdminImageTest(deps, { provider: "google" })).toEqual({
      query: "柚子",
      draft: { provider: "google", model: "gemini-2.5-flash-image" },
    });
    expect(await resolveAdminImageTest(deps, { provider: "off", model: "x" })).toEqual({
      query: "柚子",
      draft: { provider: "off", model: "" },
    });
    expect(writes).toEqual([]);
  });

  it("保存と同じ確かめ: 鍵の無い会社・知らない会社・形の違うモデル・model だけ は 400", async () => {
    const { deps } = fakeDeps({ admin: true });
    for (const input of [
      { provider: "openai" },
      { provider: "nope" },
      { provider: "google", model: "bad model!" },
      { model: "gemini-3-pro-image" },
    ]) {
      let status = 0;
      try {
        await resolveAdminImageTest(deps, input);
      } catch (e) {
        status = statusForError(e);
      }
      expect(status).toBe(400);
    }
  });

  it("Web の欄は画面で選んでいる会社・モデルを送る（保存してある古い設定を試さない）", () => {
    const card = readFileSync(
      new URL("../components/AdminAiSettingsCard.tsx", import.meta.url),
      "utf8",
    );
    expect(card).toMatch(/actions\.testImage\(\{ provider, model: model\.trim\(\) \}\)/);
    expect(card).toMatch(/testImage: \(draft\) => testFn\(\{ data: draft \}\)/);
    const fn = readFileSync(new URL("./images.functions.ts", import.meta.url), "utf8");
    expect(fn).toMatch(/resolveAdminImageTest\(mod\.realAdminAiDeps\(context\), input\)/);
    expect(fn).toMatch(/data\.draft \?\? \(await readImageOverride\(\)\)/);
  });
});
