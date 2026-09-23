import { describe, expect, it } from "vitest";
import {
  azureSsml,
  choiceFor,
  cleanTtsConfig,
  elevenLabsBody,
  hexToBytes,
  minimaxBody,
  TTS_PROVIDERS,
  voiceTag,
} from "./tts-providers";

describe("発音の声の会社（開発者だけが選ぶ。オーナー指示 2026-09-23）", () => {
  it("5社を並べる。仕様書を取れなかった VoAI と ATEN は未接続（推測で繋がない）", () => {
    expect(TTS_PROVIDERS.map((p) => p.id)).toEqual([
      "azure",
      "elevenlabs",
      "minimax",
      "voai",
      "aten",
    ]);
    expect(TTS_PROVIDERS.filter((p) => !p.implemented).map((p) => p.id)).toEqual(["voai", "aten"]);
  });

  it("保存の前に掃除する: 未接続・知らない会社・空の声・変な字は捨てる", () => {
    expect(
      cleanTtsConfig({
        languages: {
          "zh-TW": { provider: "azure", voice: " zh-TW-HsiaoChenNeural " },
          en: { provider: "voai", voice: "x" },
          fr: { provider: "azure", voice: "fr-FR-X" },
        },
      }),
    ).toEqual({ languages: { "zh-TW": { provider: "azure", voice: "zh-TW-HsiaoChenNeural" } } });
    expect(cleanTtsConfig({ languages: { en: { provider: "azure", voice: "" } } })).toEqual({});
    expect(cleanTtsConfig({ languages: { en: { provider: "azure", voice: "a/../b" } } })).toEqual(
      {},
    );
    expect(cleanTtsConfig(null)).toEqual({});
  });

  it("声の札: 何も選ばなければこれまでの alloy（今ある音をそのまま使う）", () => {
    expect(voiceTag(null)).toBe("alloy");
    expect(choiceFor({}, "zh-TW")).toBeNull();
  });

  it("声の札は英数字と _ - だけ（置き場所の道と絞り込みに入るので）。声・モデルが違えば札も違う", () => {
    const a = voiceTag({ provider: "elevenlabs", voice: "abc.DEF 1", model: "eleven_flash_v2_5" });
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(
      voiceTag({ provider: "elevenlabs", voice: "abc.DEF 1", model: "eleven_v3" }),
    );
    expect(voiceTag({ provider: "azure", voice: "zh-TW-HsiaoChenNeural" })).toBe(
      "azure_zh-TW-HsiaoChenNeural",
    );
  });

  it("Azure: 言語は声の名前から、速さは百分率、字は XML として逃がす", () => {
    const x = azureSsml("A&B<C>", "zh-TW-HsiaoChenNeural", 0.95);
    expect(x).toContain("xml:lang='zh-TW'");
    expect(x).toContain("<prosody rate='-5%'>A&amp;B&lt;C&gt;</prosody>");
  });

  it("ElevenLabs: 言語の固定は Flash / Turbo v2.5 だけに付ける（他は断られる）", () => {
    expect(elevenLabsBody("你好", "eleven_flash_v2_5", 0.95, "zh-TW").language_code).toBe("zh");
    expect("language_code" in elevenLabsBody("你好", "eleven_v3", 0.95, "zh-TW")).toBe(false);
    expect(elevenLabsBody("x", "eleven_v3", 2, "en").voice_settings.speed).toBe(1.2);
  });

  it("MiniMax: 中国語を後押しし、MP3 を hex で受け取る", () => {
    const b = minimaxBody("你好", "speech-2.8-turbo", "v1", 0.95, "zh-TW");
    expect(b.language_boost).toBe("Chinese");
    expect(b.audio_setting.format).toBe("mp3");
    expect(b.output_format).toBe("hex");
    expect([...hexToBytes("49443303")]).toEqual([0x49, 0x44, 0x33, 0x03]);
    expect(() => hexToBytes("zz")).toThrow();
  });
});
