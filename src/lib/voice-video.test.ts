import { describe, it, expect } from "vitest";
import {
  MAX_VOICE_VIDEO_BYTES,
  MAX_VOICE_VIDEO_MS,
  VIDEO_MIME_CANDIDATES,
  extensionForMime,
  isTooBig,
  isTooLong,
  pickVideoMime,
  remainingSeconds,
  voiceVideoConstraints,
  voiceVideoPath,
} from "./voice-video";

/**
 * オーナー「動画は supabase に上げる B案」の受け皿。
 *
 * ここで一番怖いのは**撮れたのに保存できない**ことなので、
 * 「止める側」と「断る側」が同じ数字を使っていることを重点的に見る。
 */

describe("pickVideoMime", () => {
  it("上から順に、対応しているものを選ぶ", () => {
    expect(pickVideoMime(() => true)).toBe(VIDEO_MIME_CANDIDATES[0]);
  });

  it("webm が無い端末では mp4 に落ちる(iOS Safari)", () => {
    expect(pickVideoMime((t) => t === "video/mp4")).toBe("video/mp4");
  });

  it("**1つも無ければ null**(呼ぶ側が「撮れません」と言える)", () => {
    expect(pickVideoMime(() => false)).toBeNull();
  });

  it("**対応の問い合わせ自体で落ちる端末でも止まらない**", () => {
    let calls = 0;
    const flaky = (t: string) => {
      calls++;
      if (t.includes("vp9")) throw new Error("boom");
      return t === "video/webm";
    };
    expect(pickVideoMime(flaky)).toBe("video/webm");
    expect(calls).toBeGreaterThan(1);
  });
});

describe("extensionForMime", () => {
  it("mp4 と webm を見分ける", () => {
    expect(extensionForMime("video/mp4")).toBe("mp4");
    expect(extensionForMime("video/webm;codecs=vp9,opus")).toBe("webm");
  });

  it("分からないときは webm(既定)", () => {
    expect(extensionForMime(null)).toBe("webm");
    expect(extensionForMime(undefined)).toBe("webm");
    expect(extensionForMime("")).toBe("webm");
  });
});

describe("voiceVideoPath", () => {
  it("その人のフォルダの、その札の下に置く", () => {
    expect(voiceVideoPath("u1", "s1", "video/webm")).toBe("u1/s1/voice.webm");
    expect(voiceVideoPath("u1", "s1", "video/mp4")).toBe("u1/s1/voice.mp4");
  });

  it("**札ごとに1本**(同じ札は同じ場所 = 撮り直すと上書き)", () => {
    expect(voiceVideoPath("u1", "s1", "video/webm")).toBe(voiceVideoPath("u1", "s1", "video/webm"));
  });

  it("**別の札と取り違えない**", () => {
    expect(voiceVideoPath("u1", "s1", null)).not.toBe(voiceVideoPath("u1", "s2", null));
    expect(voiceVideoPath("u1", "s1", null)).not.toBe(voiceVideoPath("u2", "s1", null));
  });
});

describe("isTooLong / isTooBig", () => {
  it("上限までは通す", () => {
    expect(isTooLong(MAX_VOICE_VIDEO_MS)).toBe(false);
    expect(isTooLong(MAX_VOICE_VIDEO_MS + 1)).toBe(true);
    expect(isTooBig(MAX_VOICE_VIDEO_BYTES)).toBe(false);
    expect(isTooBig(MAX_VOICE_VIDEO_BYTES + 1)).toBe(true);
  });

  it("**壊れた数で断らない**(測れなかっただけで捨てない)", () => {
    expect(isTooLong(Number.NaN)).toBe(false);
    expect(isTooBig(Number.NaN)).toBe(false);
    expect(isTooLong(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("remainingSeconds", () => {
  it("撮りながら残りを言える", () => {
    expect(remainingSeconds(0)).toBe(MAX_VOICE_VIDEO_MS / 1000);
    expect(remainingSeconds(MAX_VOICE_VIDEO_MS - 2500)).toBe(3);
  });

  it("**0 を下回らない**(「あと -2秒」を出さない)", () => {
    expect(remainingSeconds(MAX_VOICE_VIDEO_MS)).toBe(0);
    expect(remainingSeconds(MAX_VOICE_VIDEO_MS + 9999)).toBe(0);
  });

  it("壊れた数でも上限から始める", () => {
    expect(remainingSeconds(Number.NaN)).toBe(MAX_VOICE_VIDEO_MS / 1000);
    expect(remainingSeconds(-5)).toBe(MAX_VOICE_VIDEO_MS / 1000);
  });
});

describe("voiceVideoConstraints", () => {
  it("**音を入れる**(復習の録画と違うのはここ)", () => {
    expect(voiceVideoConstraints().audio).toBe(true);
  });

  it("インカメラで、小さめに撮る", () => {
    const v = voiceVideoConstraints().video as MediaTrackConstraints;
    expect(v.facingMode).toBe("user");
    expect((v.width as { ideal: number }).ideal).toBeLessThanOrEqual(720);
  });
});
