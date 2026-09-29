import { beforeEach, describe, expect, it } from "vitest";
import {
  isVoiceLockedFor,
  refreshVoiceTagsOnce,
  rememberVoiceLocks,
  rememberVoiceTags,
  resetVoiceTagsForTest,
  voiceTagFor,
} from "./tts-voice-tag";

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

  it("台湾の声で固定されているか（zh-TW の読み上げを端末の声へ落とさない）を覚える。次の起動でも残る", () => {
    expect(isVoiceLockedFor("zh-TW")).toBe(false);
    rememberVoiceLocks({ "zh-TW": true, en: false });
    expect(isVoiceLockedFor("zh-TW")).toBe(true);
    expect(isVoiceLockedFor("en")).toBe(false);
    resetVoiceTagsForTest();
    expect(isVoiceLockedFor("zh-TW")).toBe(true);
  });

  it("起動時の取り直しで、札と一緒に固定の有無も覚える", async () => {
    await refreshVoiceTagsOnce(async () => ({
      tags: { "zh-TW": "azure_zh-TW-YunJheNeural" },
      locked: { "zh-TW": true },
    }));
    expect(voiceTagFor("zh-TW")).toBe("azure_zh-TW-YunJheNeural");
    expect(isVoiceLockedFor("zh-TW")).toBe(true);
  });
});
