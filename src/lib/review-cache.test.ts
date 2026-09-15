/**
 * 出した束を端末に書き留める所。**「毎回準備中と表示される」への答え。**
 *
 * オーナー報告 2026-09-15:
 * > 「復習の今日の問題を準備中っていうのがいつもラグが長い、他のページや
 * >  アプリを一旦閉じたりすると毎回準備中と表示されストレスです。」
 *
 * 2026-08-26 に「何枚目まで進んだか」は書き留めたが、**束そのもの**は
 * React Query の持ち物＝メモリの上だけだった。アプリを閉じれば消えるので、
 * 次に開くと必ず一番重い問い合わせをやり直していた。
 */
import { describe, expect, it } from "vitest";
import { packBatch, readBatch, REVIEW_CACHE_MAX_AGE_MS } from "./review-cache";

const NOW = 1_800_000_000_000;
const card = (id: string) => ({ review_id: id });
const raw = (b: unknown) => JSON.stringify(b);

describe("書き留める形を作る", () => {
  it("束と、誰の・いつ・どの名指しかを一緒に持つ", () => {
    const p = packBatch([card("a"), card("b")], "u1", null, NOW);
    expect(p).toEqual({ user: "u1", wanted: null, at: NOW, cards: [card("a"), card("b")] });
  });

  it("**空の束は書き留めない**（出すと「今日は無し」に見える）", () => {
    expect(packBatch([], "u1", null, NOW)).toBeNull();
    expect(packBatch(null, "u1", null, NOW)).toBeNull();
    expect(packBatch(undefined, "u1", null, NOW)).toBeNull();
  });

  it("元の配列を持ち回らない（後から足されても書き留めた物は変わらない）", () => {
    const src = [card("a")];
    const p = packBatch(src, "u1", null, NOW)!;
    src.push(card("b"));
    expect(p.cards).toHaveLength(1);
  });
});

describe("読み出すのは、出してよい物だけ", () => {
  const good = raw({ user: "u1", wanted: null, at: NOW, cards: [card("a")] });

  it("同じ人・同じ名指し・新しければ出す", () => {
    expect(readBatch(good, "u1", null, NOW + 1000)?.cards).toEqual([card("a")]);
  });

  it("**別の人の束は出さない**", () => {
    expect(readBatch(good, "u2", null, NOW)).toBeNull();
    // 誰か分からないとき（まだ入っていない）も出さない。
    expect(readBatch(good, "", null, NOW)).toBeNull();
  });

  it("名指しが違えば別の束（`?sticker=` で来た回と混ぜない）", () => {
    expect(readBatch(good, "u1", "s9", NOW)).toBeNull();
    const named = raw({ user: "u1", wanted: "s9", at: NOW, cards: [card("a")] });
    expect(readBatch(named, "u1", null, NOW)).toBeNull();
    expect(readBatch(named, "u1", "s9", NOW)).not.toBeNull();
  });

  /**
   * 写真と音声の署名URLは6時間で切れる（`reviews.functions.ts`）。
   * 切れた束を出すと**絵の出ない札**が並ぶ。
   * 「古いかもしれない」より「壊れている」ほうがずっと悪い。
   */
  it("**署名URLが切れる前に捨てる**（4時間。寿命6時間に2時間の余裕）", () => {
    expect(REVIEW_CACHE_MAX_AGE_MS).toBe(4 * 60 * 60_000);
    expect(readBatch(good, "u1", null, NOW + REVIEW_CACHE_MAX_AGE_MS - 1)).not.toBeNull();
    expect(readBatch(good, "u1", null, NOW + REVIEW_CACHE_MAX_AGE_MS + 1)).toBeNull();
  });

  it("先の時刻が入っていたら信じない（端末の時計が動いた後）", () => {
    expect(readBatch(good, "u1", null, NOW - 1000)).toBeNull();
  });

  it("壊れた値・違う形はすべて `null`（`localStorage` は人が触れる）", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "{",
      "[]",
      '"a"',
      "123",
      raw({ user: "u1", wanted: null, at: NOW }), // 束が無い
      raw({ user: "u1", wanted: null, at: NOW, cards: [] }), // 空
      raw({ user: "u1", wanted: null, at: "きのう", cards: [card("a")] }),
      raw({ user: 1, wanted: null, at: NOW, cards: [card("a")] }),
      raw({ wanted: null, at: NOW, cards: [card("a")] }), // 誰のか分からない
    ]) {
      expect([String(bad).slice(0, 20), readBatch(bad as string, "u1", null, NOW)]).toEqual([
        String(bad).slice(0, 20),
        null,
      ]);
    }
  });
});
