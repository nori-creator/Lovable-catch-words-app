import { afterEach, describe, expect, it, vi } from "vitest";

const started: Array<{ loop: boolean; offset?: number }> = [];
const fakeCtx = {
  currentTime: 0,
  decodeAudioData: (_b: ArrayBuffer, ok: (b: AudioBuffer) => void) => {
    ok({ duration: 1 } as AudioBuffer);
  },
  createBufferSource() {
    const src = {
      buffer: null as AudioBuffer | null,
      loop: false,
      connect: (n: unknown) => n,
      start: (_when?: number, offset?: number) => started.push({ loop: src.loop, offset }),
      stop: vi.fn(),
    };
    return src;
  },
  createGain() {
    const param = {
      value: 1,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    };
    return { gain: param, connect: (n: unknown) => n };
  },
};
let soundOn = true;
vi.mock("./sound-engine", () => ({
  audioOut: () => (soundOn ? { c: fakeCtx, out: {} } : null),
}));

import { loopSfx, playSfx, preloadSfx, resetSfxForTest, sfxUrl } from "./sfx-files";

/** 2026-09-28「BGMや効果音は…本物の映画の効果音のクオリティを使いたい」。 */
describe("録った効果音", () => {
  afterEach(() => {
    started.length = 0;
    soundOn = true;
    resetSfxForTest();
    vi.unstubAllGlobals();
  });
  const stubFetch = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })),
    );

  it("読み解く前は鳴らさず false（呼ぶ側が合成の音で代わりに鳴らす）、読んだ後は鳴る", async () => {
    stubFetch();
    expect(playSfx("catch-impact")).toBe(false);
    await preloadSfx(["catch-impact"]);
    expect(playSfx("catch-impact")).toBe(true);
    expect(started).toEqual([{ loop: false, offset: 0 }]);
  });

  it("本の音は表紙のきしみの前の無音を飛ばして鳴らす", async () => {
    stubFetch();
    await preloadSfx(["book-open"]);
    playSfx("book-open");
    expect(started[0].offset).toBeGreaterThan(0.5);
  });

  it("分析中の繰り返しは、読み終わる前に止めたら鳴り始めない", async () => {
    stubFetch();
    const stop = loopSfx("analyze-loop");
    stop();
    await preloadSfx(["analyze-loop"]);
    expect(started).toEqual([]);
    const stop2 = loopSfx("analyze-loop");
    expect(started).toEqual([{ loop: true, offset: undefined }]);
    stop2();
  });

  it("音の設定がオフなら取りにも行かない", async () => {
    soundOn = false;
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(playSfx("gallery-slide")).toBe(false);
    await preloadSfx(["gallery-slide"]);
    expect(f).not.toHaveBeenCalled();
  });

  it("素材は public/sfx/el-*.mp3", () => {
    expect(sfxUrl("celebrate-sting")).toBe("/sfx/el-celebrate-sting.mp3");
  });
});
