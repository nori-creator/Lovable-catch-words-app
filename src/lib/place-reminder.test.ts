import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildMessage,
  takenDateLabel,
  type NearbyMemoryLike,
  mayNotifyAt,
  placeCellKey,
  recordNotificationAt,
  PER_DAY_TOTAL,
} from "./place-reminder";

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
  it("母語が無ければ答えを明かさず汎用の問いを出す", () => {
    expect(buildMessage({ ...base, meaning_ja: null }).title).toContain("この言葉");
    expect(buildMessage({ ...base, meaning_ja: "   " }).title).not.toContain("珍珠奶茶");
  });
});

/**
 * オーナー報告 2026-09-27「表示言語が英語のとき、通知の中の単語が日本語の
 * まま」。意味は作った日の表示言語で保存されているので、合わなければ
 * 「この言葉」を表示言語で出す。
 */
describe("buildMessage — 「」の中も表示言語", () => {
  afterEach(() => vi.unstubAllGlobals());
  const asEnglish = () => {
    const store = new Map([["ui-lang-v1", "en"]]);
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null });
  };

  it("英語の画面に日本語の意味を出さない", () => {
    asEnglish();
    const { title } = buildMessage(base);
    expect(title).not.toContain("タピオカミルクティー");
    expect(title).toContain("this word");
  });

  it("英語の意味なら英語の画面にそのまま出す", () => {
    asEnglish();
    expect(buildMessage({ ...base, meaning_ja: "bubble tea" }).title).toContain("bubble tea");
  });
});

describe("buildMessage — 場所は地名で言う", () => {
  // 通知の日付は端末の地方時で表示する。CI のタイムゾーンに依存させない。
  const localDate = new Date(base.taken_at!).toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
  });
  it("日付と地名の両方が在れば両方出す", () => {
    const { body } = buildMessage(base);
    expect(body).toContain("士林夜市");
    expect(body).toContain(localDate);
  });

  /** **「ここ」で済ませない**(オーナー指摘)。 */
  it("地名が在るのに「ここ」と言わない", () => {
    expect(buildMessage(base).body).not.toContain("ここ");
  });

  it("地名が無ければ日付だけ", () => {
    const { body } = buildMessage({ ...base, location_name: null });
    expect(body).toContain(localDate);
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

describe("同じ場所では1日1回まで（2026-09-27「家にいると延々と通知が来る」）", () => {
  const home = placeCellKey({ lat: 25.0339, lng: 121.5645 });
  const at = (h: number, day = 27) => new Date(2026, 8, day, h, 0, 0);
  it("家の中で少し動いても同じ場所として数える", () => {
    expect(placeCellKey({ lat: 25.0341, lng: 121.5646 })).toBe(home);
  });
  it("同じ場所で2回目は鳴らさない。翌日はまた鳴らせる", () => {
    const log = recordNotificationAt(home, at(9), null);
    expect(mayNotifyAt(home, at(21), log)).toBe(false);
    expect(mayNotifyAt(home, at(8, 28), log)).toBe(true);
  });
  it("違う場所なら鳴らせる。ただし1日の合計は上限まで", () => {
    let log = recordNotificationAt(home, at(9), null);
    const a = placeCellKey({ lat: 25.05, lng: 121.52 });
    const b = placeCellKey({ lat: 25.08, lng: 121.55 });
    const c = placeCellKey({ lat: 25.1, lng: 121.6 });
    expect(mayNotifyAt(a, at(12), log)).toBe(true);
    log = recordNotificationAt(a, at(12), log);
    log = recordNotificationAt(b, at(15), log);
    expect(log.total).toBe(PER_DAY_TOTAL);
    expect(mayNotifyAt(c, at(18), log)).toBe(false);
  });
});

/**
 * オーナー決定 2026-09-27: 通知は B「写真を大きく」、言語の名前は
 * 「中国語」ではなく「台湾華語」（英語の画面では Mandarin）。
 */
describe("buildMessage — B 写真を大きく・学習言語の名前", () => {
  afterEach(() => vi.unstubAllGlobals());
  const withPhoto = { ...base, image_url: "https://example.test/p.jpg" };

  it("写真が在れば、写真を問いにして答えも意味も書かない", () => {
    const { title, body } = buildMessage(withPhoto);
    expect(title).toContain("台湾華語で言える");
    expect(title).not.toContain("珍珠奶茶");
    expect(title).not.toContain("タピオカミルクティー");
    expect(body).toContain("士林夜市");
  });

  it("写真が無ければ母語で問い、言語は台湾華語と書く", () => {
    const { title } = buildMessage(base);
    expect(title).toContain("台湾華語");
    expect(title).not.toContain("中文");
    expect(title).not.toContain("中国語");
  });

  it("英語の語なら英語と書く", () => {
    expect(buildMessage({ ...base, headword: "umbrella", meaning_ja: "傘" }).title).toContain(
      "英語",
    );
  });

  it("英語の画面では Mandarin", () => {
    const store = new Map([["ui-lang-v1", "en"]]);
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null });
    expect(buildMessage(withPhoto).title).toContain("Mandarin");
  });
});
