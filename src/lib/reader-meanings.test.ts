import { afterEach, describe, expect, it, vi } from "vitest";
import {
  primeReaderMeaning,
  readerMeaningCached,
  requestReaderMeaning,
  resetReaderMeaningsForTest,
  setReaderMeaningFiller,
  setReaderMeaningLoader,
} from "./reader-meanings";

/**
 * 図鑑・復習の意味を、読む人の言語で引いて覚えておく所（オーナー報告 2026-10-02、
 * 英語と繁體中文の両方「図鑑のスライドに意味が出ない」）。
 *
 * 一番怖いのは2つ:
 * - 意味が無い語を**放っておく**（前の姿。英語・繁體中文の人の図鑑は意味が空だった）
 * - 共有の意味が読む人の言語で書かれている語まで**埋めに行く**（日本語の表示で日本語の語に
 *   AI を呼ぶ — 見え方が変わり、費用もかかる）
 */

afterEach(() => {
  resetReaderMeaningsForTest();
  vi.useRealTimers();
});

async function settle() {
  // 束ねる待ち（16ms）→ 問い合わせ → 埋める待ち（16ms）→ 埋める問い合わせ。
  for (let i = 0; i < 4; i++) {
    await vi.advanceTimersByTimeAsync(20);
  }
}

describe("読む人の言語の意味が無い語は、意味だけを埋めに行く", () => {
  it("英語の人: 引いても無く、共有の意味が日本語なら埋める", async () => {
    vi.useFakeTimers();
    const loader = vi.fn(async () => ({}) as Record<string, string>);
    const filler = vi.fn(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, "smartphone"])),
    );
    setReaderMeaningLoader(loader);
    setReaderMeaningFiller(filler);
    requestReaderMeaning("w1", "en", "スマートフォン");
    await settle();
    expect(loader).toHaveBeenCalledWith(["w1"], "en");
    expect(filler).toHaveBeenCalledWith(["w1"], "en");
    expect(readerMeaningCached("w1", "en")).toBe("smartphone");
  });

  it("繁體中文の人でも同じ（日本語の意味は埋めに行く）", async () => {
    vi.useFakeTimers();
    setReaderMeaningLoader(async () => ({}));
    const filler = vi.fn(async () => ({ w2: "筆記本" }));
    setReaderMeaningFiller(filler);
    requestReaderMeaning("w2", "zh-TW", "ノート");
    await settle();
    expect(filler).toHaveBeenCalledWith(["w2"], "zh-TW");
    expect(readerMeaningCached("w2", "zh-TW")).toBe("筆記本");
  });

  it("**日本語の表示で日本語の意味の語は埋めに行かない**（今の見え方を変えない）", async () => {
    vi.useFakeTimers();
    setReaderMeaningLoader(async () => ({}));
    const filler = vi.fn(async () => ({}));
    setReaderMeaningFiller(filler);
    requestReaderMeaning("w3", "ja", "ノート");
    await settle();
    expect(filler).not.toHaveBeenCalled();
  });

  it("共有の意味を渡さない呼び出しは、今まで通り引くだけ", async () => {
    vi.useFakeTimers();
    setReaderMeaningLoader(async () => ({}));
    const filler = vi.fn(async () => ({}));
    setReaderMeaningFiller(filler);
    requestReaderMeaning("w4", "en");
    await settle();
    expect(filler).not.toHaveBeenCalled();
  });

  it("引いて在った語は埋めに行かない", async () => {
    vi.useFakeTimers();
    setReaderMeaningLoader(async () => ({ w5: "notebook" }));
    const filler = vi.fn(async () => ({}));
    setReaderMeaningFiller(filler);
    requestReaderMeaning("w5", "en", "ノート");
    await settle();
    expect(filler).not.toHaveBeenCalled();
    expect(readerMeaningCached("w5", "en")).toBe("notebook");
  });

  it("埋めに行くのは1語1回（失敗しても叩き続けない）。失敗は記録に回す", async () => {
    vi.useFakeTimers();
    setReaderMeaningLoader(async () => ({}));
    const err = vi.fn();
    const filler = vi.fn(async () => {
      throw new Error("boom");
    });
    setReaderMeaningFiller(filler, err);
    requestReaderMeaning("w6", "en", "ノート");
    await settle();
    requestReaderMeaning("w6", "en", "ノート");
    await settle();
    expect(filler).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalledTimes(1);
    expect(readerMeaningCached("w6", "en")).toBe("");
  });

  it("同じ瞬間に欲しがられた語は1本にまとめる", async () => {
    vi.useFakeTimers();
    setReaderMeaningLoader(async () => ({}));
    const filler = vi.fn(async (_ids: string[]) => ({}) as Record<string, string>);
    setReaderMeaningFiller(filler);
    requestReaderMeaning("a", "en", "傘を差す");
    requestReaderMeaning("b", "en", "ノート");
    await settle();
    expect(filler).toHaveBeenCalledTimes(1);
    expect(filler.mock.calls[0][0]).toEqual(["a", "b"]);
  });
});

describe("別の道で分かった意味を覚えさせる", () => {
  it("復習で届いた意味が、図鑑でも問い合わせずに出る", () => {
    primeReaderMeaning("w7", "en", " gratin macaroni ");
    expect(readerMeaningCached("w7", "en")).toBe("gratin macaroni");
    expect(readerMeaningCached("w7", "zh-TW")).toBe("");
  });
});
