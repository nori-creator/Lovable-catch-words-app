import { describe, it, expect } from "vitest";
import {
  CATEGORY_KEYS,
  CATEGORY_META,
  ROOM_KEYS,
  ROOM_CATEGORIES,
  asCategoryKey,
  categoryEmoji,
  normalizeCategory,
  normalizeRoomWeights,
  roomMixFromCategories,
} from "./category";

/**
 * カテゴリーの定義。
 *
 * 図鑑の棚はこの表がそのまま形になる。ここが崩れると、単語が
 * **どこの棚にも入らない**か、**同じ棚が2つできる**。どちらも
 * 「毎回同じ場所に居る」という図鑑の前提を壊す。
 */

describe("CATEGORY_META / ROOM_CATEGORIES", () => {
  it("すべてのカテゴリーがどれかの部屋にちょうど1回だけ入る", () => {
    const all = Object.keys(CATEGORY_META);
    const placed = ROOM_KEYS.flatMap((r) => ROOM_CATEGORIES[r]);
    expect(placed.length).toBe(all.length);
    expect(new Set(placed).size).toBe(all.length);
    expect([...placed].sort()).toEqual([...all].sort());
  });

  it("空の部屋を作らない(棚の無い部屋の見出しだけが並ぶのを防ぐ)", () => {
    for (const room of ROOM_KEYS) {
      expect(ROOM_CATEGORIES[room].length).toBeGreaterThan(0);
    }
  });

  it("どのカテゴリーにも絵文字がある", () => {
    for (const [key, meta] of Object.entries(CATEGORY_META)) {
      expect(meta.emoji, `${key} に絵文字が無い`).toBeTruthy();
    }
  });
});

describe("asCategoryKey", () => {
  it("既知のキーはそのまま通す", () => {
    expect(asCategoryKey("fruit")).toBe("fruit");
  });

  it("空・null・未知のキーは other に落とす", () => {
    // DBには古いキー(place / object)が残っている可能性がある。
    expect(asCategoryKey(null)).toBe("other");
    expect(asCategoryKey(undefined)).toBe("other");
    expect(asCategoryKey("")).toBe("other");
    expect(asCategoryKey("   ")).toBe("other");
    expect(asCategoryKey("place")).toBe("other");
  });

  it("前後の空白を落として判定する", () => {
    expect(asCategoryKey("  fruit  ")).toBe("fruit");
  });

  it("Object.prototype の名前を「既知のカテゴリー」として通さない", () => {
    // `key in CATEGORY_META` は継承したプロパティにも当たるので、
    // "constructor" などが素通りして CATEGORY_META[key] が関数を返し、
    // .emoji を引いたところで画面が落ちる。
    for (const evil of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      expect(asCategoryKey(evil), `${evil} が素通りした`).toBe("other");
      expect(() => categoryEmoji(evil)).not.toThrow();
      expect(typeof categoryEmoji(evil)).toBe("string");
    }
  });

  it("見出し語が Object.prototype の名前でも、関数を返さない", () => {
    // `EXACT[h]` も同じ穴を持っていた。`asCategoryKey` では潰したのに、
    // **すぐ隣のこの引きだけ見落としていた**(1箇所直したら同じ形を探す)。
    // 文字キャッチは見出し語を人が打てるので、机上の話ではない。
    for (const evil of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      const got = normalizeCategory(evil, null);
      expect(typeof got, `${evil} で ${typeof got} が返った`).toBe("string");
      expect(CATEGORY_KEYS as readonly string[]).toContain(got);
    }
  });

  it("見出し語が既知でなければ、AI の答えを尊重する", () => {
    expect(normalizeCategory("沒有この語", "drink")).toBe("drink");
    expect(normalizeCategory("沒有この語", "存在しない鍵")).toBe("other");
  });
});

/**
 * 出会う確率のための「場面」。
 * 語がどこで出るかと、その人がどこに居るかを**同じ鍵**で並べないと
 * 内積が意味を持たない。ここで守るのはその一点。
 */
describe("normalizeRoomWeights", () => {
  it("合計1に直す", () => {
    const w = normalizeRoomWeights({ eat: 2, town: 2 });
    expect(w).toEqual({ eat: 0.5, town: 0.5 });
  });

  it("**知らない鍵は落とす**(片方にしか無い鍵は必ず0を掛けることになる)", () => {
    const w = normalizeRoomWeights({ eat: 1, スーパー: 1, 新聞: 5 });
    expect(w).toEqual({ eat: 1 });
  });

  it("0 や負や壊れた数は数えない", () => {
    const w = normalizeRoomWeights({ eat: 1, town: 0, house: -3, play: Number.NaN });
    expect(w).toEqual({ eat: 1 });
  });

  it("使える鍵が1つも無ければ null(補正を掛けない)", () => {
    expect(normalizeRoomWeights({ スーパー: 1 })).toBeNull();
    expect(normalizeRoomWeights({})).toBeNull();
    expect(normalizeRoomWeights(null)).toBeNull();
  });
});

describe("roomMixFromCategories", () => {
  it("撮ったものの部屋の割合になる", () => {
    const mix = roomMixFromCategories(["fruit", "vegetable", "street"]);
    expect(mix?.eat).toBeCloseTo(2 / 3, 6);
    expect(mix?.town).toBeCloseTo(1 / 3, 6);
  });

  it("知らないカテゴリーは other 扱いで数える(捨てない)", () => {
    const mix = roomMixFromCategories(["まだ無いカテゴリー"]);
    expect(mix).not.toBeNull();
    expect(Object.values(mix!).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it("**1枚も撮っていなければ null**。一様と言い切らない", () => {
    expect(roomMixFromCategories([])).toBeNull();
  });
});
