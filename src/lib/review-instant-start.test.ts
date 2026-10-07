/**
 * **通知・ホームの札を押したら、その語から復習がすぐ始まる**（オーナー指示 2026-10-07
 * 「〇〇前に撮ったのこの単語覚えてる？に通知の名前を変えて。またその通知をタップしたら
 * 復習の問題が始まるようにして。また通知をタップしたらすぐに問題出るようにして。今日の
 * 問題を準備中と言う待ち時間無しで。通知を出すときは復習の画面を用意してからにして。」）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/lib/image-cache", () => ({ warmCachedImages: vi.fn(async () => undefined) }));

import { prepareTargetedReview, dropTargetedReview, PREPARED_REUSE_MS } from "./review-prepare";
import { readBatch, REVIEW_CACHE_USER_KEY, REVIEW_TARGET_CACHE_KEY } from "./review-cache";
import { warmCachedImages } from "@/lib/image-cache";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
/** 注釈を落とした本文（見るのは実際に走る行だけ）。 */
const codeOnly = (src: string) =>
  src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
    })
    .join("\n");

const S = "00000000-0000-4000-8000-000000000001";
const card = (sticker_id: string) =>
  ({ sticker_id, headword: "珍珠奶茶", language: "zh-TW" }) as never;

describe("その語から始まる復習を、押される前に用意する", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map([[REVIEW_CACHE_USER_KEY, "u1"]]);
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("束を読み、写真を端末へ落としてから、名指しの束として書き留める", async () => {
    const fetchDue = vi.fn(async () => [card(S), card("x")]);
    const until = Date.now() + 30 * 60 * 60_000;
    expect(await prepareTargetedReview(fetchDue, S, { until })).toBe(true);
    expect(fetchDue).toHaveBeenCalledWith({ data: { sticker_id: S } });
    expect(warmCachedImages).toHaveBeenCalled();
    const got = readBatch(store.get(REVIEW_TARGET_CACHE_KEY), "u1", S, Date.now());
    expect(got?.cards).toHaveLength(2);
    expect(got?.until).toBe(until);
  });

  it("1時間以内に用意した物があれば読み直さない（いちばん重い問い合わせ）", async () => {
    const fetchDue = vi.fn(async () => [card(S)]);
    await prepareTargetedReview(fetchDue, S);
    await prepareTargetedReview(fetchDue, S, { now: Date.now() + PREPARED_REUSE_MS / 2 });
    expect(fetchDue).toHaveBeenCalledTimes(1);
  });

  it("その語が先頭に来ない・通信できない時は「用意できなかった」（通知はその語を約束しない）", async () => {
    expect(await prepareTargetedReview(async () => [card("x")], S)).toBe(false);
    expect(await prepareTargetedReview(async () => [], S)).toBe(false);
    expect(
      await prepareTargetedReview(async () => {
        throw new Error("offline");
      }, S),
    ).toBe(false);
    expect(store.has(REVIEW_TARGET_CACHE_KEY)).toBe(false);
  });

  it("誰が入っているか分からない時は用意しない", async () => {
    store.delete(REVIEW_CACHE_USER_KEY);
    const fetchDue = vi.fn(async () => [card(S)]);
    expect(await prepareTargetedReview(fetchDue, S)).toBe(false);
    expect(fetchDue).not.toHaveBeenCalled();
  });

  it("出し切ったら捨てる（同じ並びで二重に採点しない）", async () => {
    await prepareTargetedReview(async () => [card(S)], S);
    dropTargetedReview("other");
    expect(store.has(REVIEW_TARGET_CACHE_KEY)).toBe(true);
    dropTargetedReview(S);
    expect(store.has(REVIEW_TARGET_CACHE_KEY)).toBe(false);
  });
});

describe("つなぎ目", () => {
  it("通知は、束を用意してから予約する（用意できなければ名指ししない）", () => {
    const s = codeOnly(read("components/ReviewReminderWatcher.tsx"));
    const prep = s.indexOf("await prepareTargetedReview(");
    const apply = s.indexOf("await applyReminderSchedule(");
    expect(prep).toBeGreaterThan(0);
    expect(apply).toBeGreaterThan(prep);
    expect(s).toMatch(/if \(!ready\) quiz = null;/);
    // 鳴った後に押されるまで束が生きているよう、最後の通知の時刻から延ばす。
    expect(s).toMatch(/until: last \+ TAP_GRACE_MS/);
  });

  it("復習の画面は、名指しで来ても端末の束から最初の描画で出す", () => {
    const s = codeOnly(read("components/screens/ReviewScreen.tsx"));
    expect(s).toMatch(/composeWantedBatch\(/);
    expect(s).toMatch(/localStorage\.getItem\(REVIEW_TARGET_CACHE_KEY\)/);
    expect(s).toMatch(/dropTargetedReview\(wantedSticker\)/);
  });

  it("ホームの札は、押すとその語から復習を始める（詳細を開かない・答えを鳴らさない）", () => {
    const s = codeOnly(read("components/ResurfaceCard.tsx"));
    expect(s).toMatch(/navigate\(\{ to: "\/review", search: \{ sticker: id \} \}\)/);
    expect(s).toMatch(/prepareTargetedReview\(fetchReview, pickedId\)/);
    expect(s).not.toMatch(/pronounce\(/);
    expect(s).toMatch(/CAUGHT_AGO_KEY\[pick\.unit\]/);
  });
});
