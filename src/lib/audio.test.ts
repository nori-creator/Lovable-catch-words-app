import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installAudioUnlock,
  primeAudio,
  primeSpeechSynthesis,
  resetAudioForTest,
  sharedSpeechElement,
  silentWavDataUrl,
} from "./audio";
import {
  canPlayDecodedSpeech,
  isAppleTouchDevice,
  resetSpeechBuffersForTest,
} from "./speech-buffer";
import { speak } from "./speak";

/**
 * 2026-10-05 オーナー報告「iPhone/iPad の Safari で発音ボタンを押しても音が出ない」。
 * 実機の Safari はここでは動かせないので、iPhone の決まり（指の操作の中で同期的に解禁する・
 * 消音スイッチは Web Audio だけを黙らせる）を守っているかを、部品ごとに確かめる。
 */

class FakeAudio {
  src = "";
  preload = "";
  plays = 0;
  play() {
    this.plays++;
    return Promise.resolve();
  }
  pause() {}
}

function stubSpeech() {
  const spoken: { text: string; lang: string; volume: number }[] = [];
  class Utter {
    text: string;
    lang = "";
    volume = 1;
    rate = 1;
    voice: unknown = null;
    onend: null | (() => void) = null;
    onerror: null | (() => void) = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  const synth = {
    getVoices: () => [] as { name: string; lang: string }[],
    speak: (u: Utter) => spoken.push({ text: u.text, lang: u.lang, volume: u.volume }),
    cancel: () => {},
    addEventListener: () => {},
  };
  vi.stubGlobal("SpeechSynthesisUtterance", Utter);
  return { synth, spoken, Utter };
}

afterEach(() => {
  resetAudioForTest();
  resetSpeechBuffersForTest();
  vi.unstubAllGlobals();
});

describe("解禁に使う無音", () => {
  it("中身のある WAV（データ0バイトの WAV は読み込みに失敗する端末がある）", () => {
    const url = silentWavDataUrl();
    expect(url.startsWith("data:audio/wav;base64,")).toBe(true);
    const bytes = Buffer.from(url.split(",")[1], "base64");
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(36, 40).toString("ascii")).toBe("data");
    expect(bytes.readUInt32LE(40)).toBeGreaterThan(0);
    expect(bytes.length).toBe(44 + bytes.readUInt32LE(40));
  });

  it("1つの要素は1回だけ解禁する（鳴っている発音を無音で潰さない）", () => {
    const el = new FakeAudio() as unknown as HTMLAudioElement;
    primeAudio(el);
    primeAudio(el);
    expect((el as unknown as FakeAudio).plays).toBe(1);
  });
});

describe("発音の <audio> はアプリ全体で1つ", () => {
  it("どの画面の発音も同じ要素を使う（1回の解禁がどこにでも効く）", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", FakeAudio);
    const a = sharedSpeechElement();
    const b = sharedSpeechElement();
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  it("サーバで描く時は作らない", () => {
    expect(sharedSpeechElement()).toBeNull();
  });
});

describe("最初のタップで音の出口を開ける", () => {
  it("touchend / click / keydown のどれでも、共有の要素と端末の声を解禁する", () => {
    const { synth, spoken } = stubSpeech();
    vi.stubGlobal("window", { speechSynthesis: synth });
    vi.stubGlobal("Audio", FakeAudio);
    const handlers = new Map<string, () => void>();
    vi.stubGlobal("document", {
      addEventListener: (type: string, fn: () => void) => handlers.set(type, fn),
    });
    installAudioUnlock();
    expect([...handlers.keys()].sort()).toEqual(["click", "keydown", "touchend"]);
    handlers.get("touchend")!();
    const el = sharedSpeechElement() as unknown as FakeAudio;
    expect(el.plays).toBe(1);
    // 端末の声は音量0で1回だけ（以後の控えの読み上げが指の外でも通るように）。
    expect(spoken).toEqual([{ text: " ", lang: "", volume: 0 }]);
    handlers.get("click")!();
    expect(el.plays).toBe(1);
    expect(spoken).toHaveLength(1);
  });

  it("端末の声の解禁は1回だけ", () => {
    const { synth, spoken } = stubSpeech();
    vi.stubGlobal("window", { speechSynthesis: synth });
    primeSpeechSynthesis();
    primeSpeechSynthesis();
    expect(spoken).toHaveLength(1);
  });
});

describe("端末の声（控え）は押した手の中で話す", () => {
  it("声の一覧がまだ空でも、待たずにその場で話す（待つと指の外になり iPhone が捨てる）", () => {
    const { synth, spoken } = stubSpeech();
    vi.stubGlobal("window", { speechSynthesis: synth });
    speak("雨傘", "zh-TW");
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe("雨傘");
    expect(spoken[0].lang).toBe("zh-TW");
    speak("umbrella", "en");
    expect(spoken[1].lang).toMatch(/^en/);
  });
});

describe("読み解き済みの波形（Web Audio）で鳴らしてよいか", () => {
  it("止まっている出口では鳴らさない（resume は非同期で、その打鍵の音は流れない）", () => {
    for (const state of ["suspended", "interrupted", "closed", undefined]) {
      expect(canPlayDecodedSpeech({ state, appleTouch: false, audioSession: true })).toBe(false);
    }
    expect(canPlayDecodedSpeech({ state: "running", appleTouch: false, audioSession: false })).toBe(
      true,
    );
  });

  it("iPhone / iPad は Audio Session API が無ければ使わない（消音スイッチで黙る）", () => {
    expect(canPlayDecodedSpeech({ state: "running", appleTouch: true, audioSession: false })).toBe(
      false,
    );
    expect(canPlayDecodedSpeech({ state: "running", appleTouch: true, audioSession: true })).toBe(
      true,
    );
  });

  it("iPadOS（デスクトップの UA を名乗る）も iPhone と同じに見分ける", () => {
    expect(isAppleTouchDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" })).toBe(
      true,
    );
    expect(
      isAppleTouchDevice({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
    expect(
      isAppleTouchDevice({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
        maxTouchPoints: 0,
      }),
    ).toBe(false);
    expect(isAppleTouchDevice({ userAgent: "Mozilla/5.0 (Linux; Android 14)" })).toBe(false);
  });
});
