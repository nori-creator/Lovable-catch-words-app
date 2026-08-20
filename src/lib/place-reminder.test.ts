import { describe, it, expect } from "vitest";
import { buildMessage, takenDateLabel, type NearbyMemoryLike } from "./place-reminder";

/**
 * 場所の知らせの文面。**答えを書かない**ことがこの機能の全部なので、
 * 崩れたら気づける形にしておく。
 */

const base: NearbyMemoryLike = {
  sticker_id: "s1",
  headword: "珍珠奶茶",
  meaning_ja: "タピオカミルクティー",
  location_name: "士林夜市",
  image_url: null,
  days_ago: 3,
  taken_at: "2026-07-05T10:00:00+08:00",
  distance_m: 40,
};

describe("buildMessage — 答えを書かない", () => {
  /**
   * **これが指摘そのもの。** 押した先の問題は「写真+母語 → 台湾華語を4択」
   * なので、知らせに台湾華語が書いてあると開いた瞬間に答えが分かる。
   */
  it("台湾華語の見出し語を出さない", () => {
    const { title, body } = buildMessage(base);
    expect(title).not.toContain("珍珠奶茶");
    expect(body).not.toContain("珍珠奶茶");
  });

  it("問いは母語で立てる", () => {
    expect(buildMessage(base).title).toContain("タピオカミルクティー");
  });

  /** 母語が無い札では問いを立てられない。何も知らせないよりはよい。 */
  it("母語が無ければ見出し語のまま出す", () => {
    expect(buildMessage({ ...base, meaning_ja: null }).title).toContain("珍珠奶茶");
    expect(buildMessage({ ...base, meaning_ja: "   " }).title).toContain("珍珠奶茶");
  });
});

describe("buildMessage — 場所は地名で言う", () => {
  it("日付と地名の両方が在れば両方出す", () => {
    const { body } = buildMessage(base);
    expect(body).toContain("士林夜市");
    expect(body).toContain("7月5日");
  });

  /** **「ここ」で済ませない**(オーナー指摘)。 */
  it("地名が在るのに「ここ」と言わない", () => {
    expect(buildMessage(base).body).not.toContain("ここ");
  });

  it("地名が無ければ日付だけ", () => {
    const { body } = buildMessage({ ...base, location_name: null });
    expect(body).toContain("7月5日");
    expect(body).not.toContain("（");
  });

  it("日付が読めなければ地名だけ", () => {
    const { body } = buildMessage({ ...base, taken_at: null });
    expect(body).toContain("士林夜市");
  });

  it("どちらも無ければ、その旨だけを言う", () => {
    const { body } = buildMessage({ ...base, taken_at: null, location_name: null });
    expect(body.length).toBeGreaterThan(0);
  });
});

describe("takenDateLabel", () => {
  it("読めない日付から推測で日を作らない", () => {
    expect(takenDateLabel(null)).toBe("");
    expect(takenDateLabel(undefined)).toBe("");
    expect(takenDateLabel("いつか")).toBe("");
  });
});
