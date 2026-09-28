import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeSpeech,
  hasSpeechBuffer,
  playSpeechBuffer,
  resetSpeechBuffersForTest,
} from "./speech-buffer";

/** 2026-09-28「発音ボタン押してから発音が実践されるまで…タイムラグ」。 */
describe("読み解き済みの発音はその場で鳴らす", () => {
  afterEach(() => {
    resetSpeechBuffersForTest();
    vi.unstubAllGlobals();
  });

  const fakeAudio = () => {
    const started: number[] = [];
    class Ctx {
      state = "running";
      destination = {};
      resume = async () => {};
      decodeAudioData(_b: ArrayBuffer, ok: (b: unknown) => void) {
        ok({ duration: 0.4 });
        return undefined;
      }
      createBufferSource() {
        return {
          buffer: null as unknown,
          onended: null as null | (() => void),
          connect() {},
          start() {
            started.push(1);
            this.onended?.();
          },
          stop() {},
        };
      }
    }
    vi.stubGlobal("window", { AudioContext: Ctx });
    vi.stubGlobal("navigator", {});
    return started;
  };

  it("読み解く前は鳴らさない（呼ぶ側の今まで通りの道へ）。読み解いた後はすぐ鳴る", async () => {
    const started = fakeAudio();
    expect(playSpeechBuffer("k")).toBeNull();
    await decodeSpeech("k", new Blob([new Uint8Array([1, 2, 3])]));
    expect(hasSpeechBuffer("k")).toBe(true);
    const p = playSpeechBuffer("k");
    expect(p).not.toBeNull();
    await p;
    expect(started).toHaveLength(1);
  });

  it("Web Audio が無い端末では何もしない", async () => {
    vi.stubGlobal("window", {});
    expect(await decodeSpeech("k", new Blob([]))).toBeNull();
    expect(playSpeechBuffer("k")).toBeNull();
  });
});
