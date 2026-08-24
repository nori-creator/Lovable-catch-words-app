import { describe, it, expect } from "vitest";
import {
  applyDexFilter,
  categoryOptions,
  dayOptions,
  isFiltering,
  NO_FILTER,
  pruneFilter,
  stickerDayKey,
  type FilterableSticker,
} from "./dex-filter";

/**
 * オーナー指摘 2026-08-21「図鑑のカテゴリーや日付の選択は…ボタンを押したら
 * 選択肢が出てきて選べるようにして」の受け皿。
 *
 * ここで一番怖いのは**何も出ない画面で詰まること**なので、
 * 「消えた選択が解ける」側の試験を厚くする。
 */

/** その日の正午に作る。時差で日がずれないよう地方時で組む。 */
function at(y: number, m: number, d: number, h = 12): string {
  return new Date(y, m - 1, d, h).toISOString();
}

function s(category: string | null, iso: string): FilterableSticker {
  return { created_at: iso, word: { category_key: category } };
}

const SAMPLE: FilterableSticker[] = [
  s("food", at(2026, 8, 21)),
  s("food", at(2026, 8, 21)),
  s("food", at(2026, 8, 20)),
  s("drink", at(2026, 8, 20)),
  s("vehicle", at(2026, 8, 19)),
];

describe("stickerDayKey", () => {
  it("地方時で日を切る(UTC に直さない)", () => {
    expect(stickerDayKey(at(2026, 8, 21))).toBe("2026-08-21");
  });

  it("**夜に撮った物が翌日へずれない**", () => {
    expect(stickerDayKey(at(2026, 8, 21, 23))).toBe("2026-08-21");
    expect(stickerDayKey(at(2026, 8, 21, 0))).toBe("2026-08-21");
  });

  it("月日は2桁でそろえる(並べ替えが文字のままで効く)", () => {
    expect(stickerDayKey(at(2026, 1, 5))).toBe("2026-01-05");
  });
});

describe("categoryOptions", () => {
  it("持っている物だけを多い順に", () => {
    expect(categoryOptions(SAMPLE)).toEqual([
      { key: "food", count: 3 },
      { key: "drink", count: 1 },
      { key: "vehicle", count: 1 },
    ]);
  });

  it("**同じ件数の並びが回るたび変わらない**", () => {
    const a = categoryOptions(SAMPLE).map((o) => o.key);
    const b = categoryOptions([...SAMPLE].reverse()).map((o) => o.key);
    expect(a).toEqual(b);
  });

  it("古い鍵は正規化してから数える(同じ名前が2つ並ばない)", () => {
    const got = categoryOptions([s("place", at(2026, 8, 21)), s(null, at(2026, 8, 21))]);
    expect(got).toHaveLength(1);
    expect(got[0].count).toBe(2);
  });

  it("1枚も無ければ空", () => {
    expect(categoryOptions([])).toEqual([]);
  });
});

describe("dayOptions", () => {
  it("撮った日だけを新しい順に", () => {
    expect(dayOptions(SAMPLE)).toEqual([
      { key: "2026-08-21", count: 2 },
      { key: "2026-08-20", count: 2 },
      { key: "2026-08-19", count: 1 },
    ]);
  });

  it("**撮っていない日は並ばない**(押しても何も出ない選択肢を作らない)", () => {
    const keys = dayOptions(SAMPLE).map((o) => o.key);
    expect(keys).not.toContain("2026-08-18");
  });
});

describe("applyDexFilter", () => {
  it("すべてのときは何も落とさない", () => {
    expect(applyDexFilter(SAMPLE, NO_FILTER)).toHaveLength(5);
  });

  it("カテゴリーで絞る", () => {
    expect(applyDexFilter(SAMPLE, { category: "food", day: null })).toHaveLength(3);
  });

  it("日付で絞る", () => {
    expect(applyDexFilter(SAMPLE, { category: null, day: "2026-08-20" })).toHaveLength(2);
  });

  it("**両方が立っていれば両方にかかる**", () => {
    expect(applyDexFilter(SAMPLE, { category: "food", day: "2026-08-20" })).toHaveLength(1);
    expect(applyDexFilter(SAMPLE, { category: "drink", day: "2026-08-19" })).toHaveLength(0);
  });

  it("元の配列を書き換えない", () => {
    const src = [...SAMPLE];
    applyDexFilter(src, { category: "food", day: null });
    expect(src).toHaveLength(5);
  });
});

describe("pruneFilter", () => {
  const options = { categories: categoryOptions(SAMPLE), days: dayOptions(SAMPLE) };

  it("**選択肢から消えたカテゴリーは「すべて」に戻す**", () => {
    expect(pruneFilter({ category: "toy", day: null }, options).category).toBeNull();
  });

  it("**選択肢から消えた日付も戻す**", () => {
    expect(pruneFilter({ category: null, day: "2020-01-01" }, options).day).toBeNull();
  });

  it("片方だけ消えても、生きているほうは残す", () => {
    const got = pruneFilter({ category: "food", day: "2020-01-01" }, options);
    expect(got).toEqual({ category: "food", day: null });
  });

  it("生きている選択はそのまま", () => {
    const f = { category: "food", day: "2026-08-21" };
    expect(pruneFilter(f, options)).toEqual(f);
  });

  it("**変わらないときは同じ物を返す**(見ている側が回り続けない)", () => {
    const f = { category: "food", day: "2026-08-21" };
    expect(pruneFilter(f, options)).toBe(f);
    expect(pruneFilter(NO_FILTER, options)).toBe(NO_FILTER);
  });

  it("1枚も無くなったら両方戻す", () => {
    const empty = { categories: [], days: [] };
    expect(pruneFilter({ category: "food", day: "2026-08-21" }, empty)).toEqual(NO_FILTER);
  });
});

describe("isFiltering", () => {
  it("どちらかが立っていれば true", () => {
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(isFiltering({ category: "food", day: null })).toBe(true);
    expect(isFiltering({ category: null, day: "2026-08-21" })).toBe(true);
  });
});
