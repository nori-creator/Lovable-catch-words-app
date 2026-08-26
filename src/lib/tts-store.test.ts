import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  audioCacheKey,
  markSpeechReady,
  resetSpeechStoreForTest,
  setSpeechState,
  speechState,
  speechUrl,
  subscribeSpeech,
} from "./tts-store";

/**
 * オーナー指摘 2026-08-26「音声ボタンを押しても発音がすぐに聞こえない」。
 *
 * ここで守るのは2つ:
 *  - **同じ語が同じ鍵になる**（ならないと、貯めても当たらない）
 *  - **鳴らせない語を `ready` と言わない**（押しても鳴らないボタンが出る）
 */

let n = 0;
beforeEach(() => {
  resetSpeechStoreForTest();
  n = 0;
  vi.stubGlobal("URL", {
    createObjectURL: () => `blob:test/${++n}`,
    revokeObjectURL: () => {},
  });
});

const blob = () => new Blob(["x"], { type: "audio/mpeg" });

describe("audioCacheKey", () => {
  it("言語・声・語で決まる", () => {
    expect(audioCacheKey("zh-TW", "傘", "alloy")).toBe("zh-TW|alloy|傘");
  });

  it("**前後の空白で別物にしない**(片方が永久に当たらなくなる)", () => {
    expect(audioCacheKey("zh-TW", " 傘 ")).toBe(audioCacheKey("zh-TW", "傘"));
  });

  it("言語が違えば別の音", () => {
    expect(audioCacheKey("zh-TW", "cake")).not.toBe(audioCacheKey("en", "cake"));
  });

  it("声が違えば別の音", () => {
    expect(audioCacheKey("zh-TW", "傘", "a")).not.toBe(audioCacheKey("zh-TW", "傘", "b"));
  });
});

describe("鳴らせるかどうか", () => {
  it("何もしていなければ `none`", () => {
    expect(speechState("k")).toBe("none");
    expect(speechUrl("k")).toBeNull();
  });

  it("**取りに行っている間は `ready` にしない**", () => {
    setSpeechState("k", "loading");
    expect(speechState("k")).toBe("loading");
    expect(speechUrl("k")).toBeNull();
  });

  it("鳴らせるようになったら URL が持てる", () => {
    const url = markSpeechReady("k", blob());
    expect(speechState("k")).toBe("ready");
    expect(speechUrl("k")).toBe(url);
  });

  it("同じ語を二度入れても URL は1つ(掴んだままの Blob を増やさない)", () => {
    const a = markSpeechReady("k", blob());
    const b = markSpeechReady("k", blob());
    expect(a).toBe(b);
  });

  it("**画面をまたいで見える**(前は画面ごとに持っていたので消えていた)", () => {
    markSpeechReady("k", blob());
    // 別の画面のふり。同じ入れ物を見ているので、そのまま `ready`。
    expect(speechState("k")).toBe("ready");
  });

  it("変わったら知らせる", () => {
    let calls = 0;
    const off = subscribeSpeech(() => calls++);
    markSpeechReady("k", blob());
    expect(calls).toBe(1);
    setSpeechState("k", "failed");
    expect(calls).toBe(2);
    off();
    setSpeechState("k2", "loading");
    expect(calls).toBe(2);
  });

  it("同じ状態を入れ直しても知らせない(描き直しを増やさない)", () => {
    let calls = 0;
    subscribeSpeech(() => calls++);
    setSpeechState("k", "loading");
    setSpeechState("k", "loading");
    expect(calls).toBe(1);
  });

  it("**あふれて捨てた語は `ready` のまま残さない**", () => {
    // URL を捨てたのに `ready` のままだと、押しても鳴らないボタンが出る。
    for (let i = 0; i < 405; i++) markSpeechReady(`k${i}`, blob());
    expect(speechState("k0")).toBe("none");
    expect(speechUrl("k0")).toBeNull();
    expect(speechState("k404")).toBe("ready");
  });
});
