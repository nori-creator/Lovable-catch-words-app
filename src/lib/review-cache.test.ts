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
import {
  composeWantedBatch,
  packBatch,
  replaceContinuation,
  readBatch,
  REVIEW_CACHE_KEY,
  REVIEW_CACHE_MAX_AGE_MS,
  REVIEW_TARGET_CACHE_KEY,
  REVIEW_TARGET_MAX_AGE_MS,
} from "./review-cache";

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
   * 写真は束が届いた時点で端末へ落とす（`warmCachedImages`）ので、署名URLが
   * 切れても出る。それでも丸1日前の束は出さない（20時間）。
   */
  it("**古すぎる束は捨てる**（20時間）", () => {
    expect(REVIEW_CACHE_MAX_AGE_MS).toBe(20 * 60 * 60_000);
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

/**
 * **通知・ホームの札を押したら、待たずに問題が出る**（オーナー指示 2026-10-07「通知をタップ
 * したらすぐに問題出るようにして。今日の問題を準備中と言う待ち時間無しで。通知を出すときは
 * 復習の画面を用意してからにして」）。名指しの1枚から始まる束も端末に置けるようにする。
 */
describe("名指しの1枚から始まる束", () => {
  const H = 60 * 60_000;
  it("普通の束とは鍵を分ける（普通に開いた時に名指しの並びが出ない）", () => {
    expect(REVIEW_TARGET_CACHE_KEY).not.toBe(REVIEW_CACHE_KEY);
  });

  it("`until` を渡すと、鳴った後に押されるまで使える（上限 48 時間）", () => {
    const p = packBatch([card("a")], "u1", "s1", NOW, NOW + 40 * H)!;
    expect(p.until).toBe(NOW + 40 * H);
    const r = raw(p);
    expect(readBatch(r, "u1", "s1", NOW + 30 * H)).not.toBeNull();
    expect(readBatch(r, "u1", "s1", NOW + 30 * H)?.until).toBe(NOW + 40 * H);
    expect(readBatch(r, "u1", "s1", NOW + 41 * H)).toBeNull();
    // 名指しが違えば出さないのは同じ。
    expect(readBatch(r, "u1", null, NOW + H)).toBeNull();
    // 遠い先の `until` を書かれても 48 時間で切る。
    const far = raw(packBatch([card("a")], "u1", "s1", NOW, NOW + 100 * H));
    expect(REVIEW_TARGET_MAX_AGE_MS).toBe(48 * H);
    expect(readBatch(far, "u1", "s1", NOW + 47 * H)).not.toBeNull();
    expect(readBatch(far, "u1", "s1", NOW + 49 * H)).toBeNull();
  });

  it("`until` が無い・過去なら、いつもの 20 時間", () => {
    expect(packBatch([card("a")], "u1", "s1", NOW, NOW - 1)).not.toHaveProperty("until");
    const r = raw(packBatch([card("a")], "u1", "s1", NOW));
    expect(readBatch(r, "u1", "s1", NOW + 21 * H)).toBeNull();
  });

  const c = (sticker_id: string, v = "") => ({ sticker_id, v });
  const batch = (cards: ReturnType<typeof c>[], at: number, wanted: string | null) => ({
    user: "u1",
    wanted,
    at,
    cards,
  });

  it("普通の束に名指しの語が居れば、先頭に出して続きはそのまま（待たない）", () => {
    const got = composeWantedBatch("s2", null, batch([c("s1"), c("s2"), c("s3")], NOW, null));
    expect(got?.cards.map((x) => x.sticker_id)).toEqual(["s2", "s1", "s3"]);
    expect(got?.wanted).toBe("s2");
  });

  it("名指しの束が新しければそれを使う", () => {
    const got = composeWantedBatch(
      "s9",
      batch([c("s9", "new"), c("s1", "new")], NOW, "s9"),
      batch([c("s1", "old"), c("s9", "old")], NOW - H, null),
    );
    expect(got?.cards).toEqual([c("s9", "new"), c("s1", "new")]);
  });

  it("用意した後に普通の束が新しくなっていたら、続きはそちらから（答えた札を二重に出さない）", () => {
    const got = composeWantedBatch(
      "s9",
      batch([c("s9", "t"), c("s1", "t"), c("s2", "t")], NOW - 5 * H, "s9"),
      batch([c("s3", "n"), c("s4", "n")], NOW, null),
    );
    expect(got?.cards).toEqual([c("s9", "t"), c("s3", "n"), c("s4", "n")]);
    // 年齢は古い方（新しく見せると読み直しが働かない）。
    expect(got?.at).toBe(NOW - 5 * H);
  });

  it("どちらにも居なければ `null`（いつもどおり読み込み）", () => {
    expect(composeWantedBatch("s9", null, null)).toBeNull();
    expect(composeWantedBatch("s9", null, batch([c("s1")], NOW, null))).toBeNull();
  });
});

/**
 * 名指しの束（最長 48 時間前に用意）の続きは、裏で読み直した束で差し替える（Codex 指摘
 * 2026-10-07: 期限でない札・1日の上限を越えた札が出ていた）。いま出ている札より後ろだけ。
 */
describe("replaceContinuation — 名指しの束の続きを新しくする", () => {
  const c = (sticker_id: string) => ({ sticker_id });
  const ids = (cs: { sticker_id: string }[]) => cs.map((x) => x.sticker_id);

  it("1枚目（いま出ている札）は残し、後ろをサーバの束にする", () => {
    const got = replaceContinuation([c("w"), c("old1"), c("old2")], 0, [c("w"), c("n1"), c("n2")]);
    expect(ids(got)).toEqual(["w", "n1", "n2"]);
  });

  it("答え進めた位置までは動かさない（目の前の問題が入れ替わらない）", () => {
    const got = replaceContinuation([c("w"), c("a"), c("b")], 1, [c("w"), c("x"), c("a")]);
    expect(ids(got)).toEqual(["w", "a", "x"]);
  });

  it("サーバが何も返さなければ（期限の札が無い・上限）、続きは無くなる", () => {
    expect(ids(replaceContinuation([c("w"), c("a"), c("b")], 0, []))).toEqual(["w"]);
  });

  it("新しくした並びを名指しの束に書けば、開き直しても同じ並びになる（続きの目印が合う）", () => {
    const merged = replaceContinuation([c("w"), c("old")], 0, [c("w"), c("n1"), c("n2")]);
    const targeted = packBatch(merged, "u1", "w", 2_000);
    const normal = packBatch([c("n9"), c("w")], "u1", null, 1_000);
    expect(ids(composeWantedBatch("w", targeted, normal)!.cards)).toEqual(ids(merged));
  });

  it("名指しの1枚を答えた後に読み直しても、同じ札を二度出さない", () => {
    const got = replaceContinuation([c("w"), c("a")], 0, [c("w"), c("a"), c("b")]);
    expect(ids(got)).toEqual(["w", "a", "b"]);
  });
});
