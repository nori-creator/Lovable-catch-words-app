import { beforeEach, describe, expect, it } from "vitest";
import { rememberVoiceTags, resetVoiceTagsForTest, voiceTagFor } from "./tts-voice-tag";

describe("端末が覚える声の札（声を変えたら端末の古い音を使わない）", () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
    resetVoiceTagsForTest();
  });

  it("何も聞いていなければ alloy（これまでの音をそのまま使う）", () => {
    expect(voiceTagFor("zh-TW")).toBe("alloy");
  });

  it("サーバの札を覚え、変わったかを返す。次の起動でも残る", () => {
    expect(rememberVoiceTags({ "zh-TW": "azure_zh-TW-HsiaoChenNeural" })).toBe(true);
    expect(rememberVoiceTags({ "zh-TW": "azure_zh-TW-HsiaoChenNeural" })).toBe(false);
    resetVoiceTagsForTest();
    expect(voiceTagFor("zh-TW")).toBe("azure_zh-TW-HsiaoChenNeural");
    expect(voiceTagFor("en")).toBe("alloy");
  });
});
