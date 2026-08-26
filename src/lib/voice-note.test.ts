import { describe, it, expect } from "vitest";
import {
  MAX_VOICE_NOTE_BYTES,
  MAX_VOICE_NOTE_MS,
  AUDIO_MIME_CANDIDATES,
  extensionForMime,
  isTooBig,
  isTooLong,
  pickAudioMime,
  remainingSeconds,
  voiceNoteConstraints,
  voiceNotePath,
} from "./voice-note";

/**
 * オーナー「動画は supabase に上げる B案」(2026-08-21)の受け皿を、
 * 「一言は**音声だけ**」(2026-08-26)に付け替えたもの。
 *
 * ここで一番怖いのは**録れたのに保存できない**ことなので、
 * 「止める側」と「断る側」が同じ数字を使っていることを重点的に見る。
 * そのうえで、**前に撮った動画と同じ道に落ちる**ことも見る —
 * 道がずれると、消せない動画が置き場所に残り続ける。
 */

describe("pickAudioMime", () => {
  it("上から順に、対応しているものを選ぶ", () => {
    expect(pickAudioMime(() => true)).toBe(AUDIO_MIME_CANDIDATES[0]);
  });

  it("webm が無い端末では mp4 に落ちる(iOS Safari)", () => {
    expect(pickAudioMime((t) => t === "audio/mp4")).toBe("audio/mp4");
  });

  it("**1つも無ければ null**(呼ぶ側が「撮れません」と言える)", () => {
    expect(pickAudioMime(() => false)).toBeNull();
  });

  it("**対応の問い合わせ自体で落ちる端末でも止まらない**", () => {
    let calls = 0;
    const flaky = (t: string) => {
      calls++;
      if (t.includes("opus")) throw new Error("boom");
      return t === "audio/webm";
    };
    expect(pickAudioMime(flaky)).toBe("audio/webm");
    expect(calls).toBeGreaterThan(1);
  });
});

describe("extensionForMime", () => {
  it("mp4 と webm を見分ける", () => {
    expect(extensionForMime("audio/mp4")).toBe("mp4");
    expect(extensionForMime("audio/webm;codecs=opus")).toBe("webm");
  });

  it("**前に撮った動画と同じ拡張子に落ちる**(古い一言を置き去りにしない)", () => {
    // 道がずれると、撮り直しても古い動画が置き場所に残り続け、
    // 画面からは消せない物になる。
    expect(extensionForMime("audio/webm;codecs=opus")).toBe(
      extensionForMime("video/webm;codecs=vp9,opus"),
    );
    expect(extensionForMime("audio/mp4")).toBe(extensionForMime("video/mp4"));
  });

  it("分からないときは webm(既定)", () => {
    expect(extensionForMime(null)).toBe("webm");
    expect(extensionForMime(undefined)).toBe("webm");
    expect(extensionForMime("")).toBe("webm");
  });
});

describe("voiceNotePath", () => {
  it("その人のフォルダの、その札の下に置く", () => {
    expect(voiceNotePath("u1", "s1", "audio/webm")).toBe("u1/s1/voice.webm");
    expect(voiceNotePath("u1", "s1", "audio/mp4")).toBe("u1/s1/voice.mp4");
  });

  it("**札ごとに1本**(同じ札は同じ場所 = 撮り直すと上書き)", () => {
    expect(voiceNotePath("u1", "s1", "audio/webm")).toBe(voiceNotePath("u1", "s1", "audio/webm"));
  });

  it("**別の札と取り違えない**", () => {
    expect(voiceNotePath("u1", "s1", null)).not.toBe(voiceNotePath("u1", "s2", null));
    expect(voiceNotePath("u1", "s1", null)).not.toBe(voiceNotePath("u2", "s1", null));
  });
});

describe("isTooLong / isTooBig", () => {
  it("上限までは通す", () => {
    expect(isTooLong(MAX_VOICE_NOTE_MS)).toBe(false);
    expect(isTooLong(MAX_VOICE_NOTE_MS + 1)).toBe(true);
    expect(isTooBig(MAX_VOICE_NOTE_BYTES)).toBe(false);
    expect(isTooBig(MAX_VOICE_NOTE_BYTES + 1)).toBe(true);
  });

  it("**壊れた数で断らない**(測れなかっただけで捨てない)", () => {
    expect(isTooLong(Number.NaN)).toBe(false);
    expect(isTooBig(Number.NaN)).toBe(false);
    expect(isTooLong(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("remainingSeconds", () => {
  it("撮りながら残りを言える", () => {
    expect(remainingSeconds(0)).toBe(MAX_VOICE_NOTE_MS / 1000);
    expect(remainingSeconds(MAX_VOICE_NOTE_MS - 2500)).toBe(3);
  });

  it("**0 を下回らない**(「あと -2秒」を出さない)", () => {
    expect(remainingSeconds(MAX_VOICE_NOTE_MS)).toBe(0);
    expect(remainingSeconds(MAX_VOICE_NOTE_MS + 9999)).toBe(0);
  });

  it("壊れた数でも上限から始める", () => {
    expect(remainingSeconds(Number.NaN)).toBe(MAX_VOICE_NOTE_MS / 1000);
    expect(remainingSeconds(-5)).toBe(MAX_VOICE_NOTE_MS / 1000);
  });
});

describe("voiceNoteConstraints", () => {
  it("**音を入れる**(一言は声が本体)", () => {
    expect(voiceNoteConstraints().audio).toBe(true);
  });

  it("**カメラを掴まない**(オーナー指示 2026-08-26「音声だけ」)", () => {
    // ここに video が戻ると、許可の窓とカメラのランプも一緒に戻る。
    expect(voiceNoteConstraints().video).toBeUndefined();
  });
});
