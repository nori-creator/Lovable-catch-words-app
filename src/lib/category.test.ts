import { describe, it, expect } from "vitest";
import {
  CATEGORY_META,
  ROOM_KEYS,
  ROOM_CATEGORIES,
  asCategoryKey,
  categoryEmoji,
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
});
