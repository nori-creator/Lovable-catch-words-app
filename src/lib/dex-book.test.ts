import { describe, expect, it } from "vitest";
import {
  assignDexNumbers,
  countDexWords,
  dexSections,
  formatDexNo,
  groupDexWords,
  type DexGroupable,
  type DexNumberStore,
} from "./dex-book";
import { categoryOptions } from "./dex-filter";
import { reuseOwnedSticker } from "./stickers.functions";

/**
 * 図鑑の升目（iOS `DexBook` の写し）と、**同じ言葉は1マス**（オーナー報告 2026-10-08
 * 「文字検索したら同じ単語でも同じものとしてカウントされてない」）。
 */
function st(
  id: string,
  headword: string,
  opts: Partial<DexGroupable> & { day?: number; cat?: string | null } = {},
): DexGroupable & { capture_type: string; created_at: string } {
  const day = opts.day ?? 1;
  return {
    id,
    taken_at: new Date(Date.UTC(2026, 9, day)).toISOString(),
    created_at: new Date(Date.UTC(2026, 9, day)).toISOString(),
    encounter_count: opts.encounter_count ?? 0,
    shelf_key: opts.shelf_key ?? null,
    capture_type: "text",
    word: { headword, language: "zh-TW", category_key: opts.cat ?? "other" },
  };
}

function memStore(init: Record<string, number> = {}): DexNumberStore & {
  data: Record<string, number>;
} {
  const s = {
    data: { ...init },
    load: () => ({ ...s.data }),
    save: (m: Record<string, number>) => {
      s.data = { ...m };
    },
  };
  return s;
}

describe("同じ言葉は1マス", () => {
  it("文字で2回検索した「貓」は1つにまとまる", () => {
    const a = st("a", "貓", { day: 1 });
    const b = st("b", "貓", { day: 3 });
    const groups = groupDexWords([a, b], "zh-TW");
    expect(groups).toHaveLength(1);
    // 表に出すのは新しい方。
    expect(groups[0].rep.id).toBe("b");
    expect(groups[0].members.map((m) => m.id)).toEqual(["a", "b"]);
    expect(groups[0].captures).toBe(2);
  });

  it("前後の空白が違っても同じ言葉", () => {
    expect(groupDexWords([st("a", "貓"), st("b", " 貓 ")], "zh-TW")).toHaveLength(1);
  });

  it("着地する札があれば、それを表に出す（`dex-cell-<id>` が見つかる）", () => {
    const groups = groupDexWords(
      [st("a", "貓", { day: 5 }), st("b", "貓", { day: 1 })],
      "zh-TW",
      "b",
    );
    expect(groups[0].rep.id).toBe("b");
  });

  it("出会った回数 = 札の枚数 + 再会の回数", () => {
    const g = groupDexWords(
      [st("a", "咖啡", { encounter_count: 2 }), st("b", "咖啡", { day: 2 })],
      "zh-TW",
    );
    expect(g[0].captures).toBe(4);
  });

  it("並びは入ってきた順（言葉の最初の札の位置）", () => {
    const g = groupDexWords([st("a", "貓"), st("b", "狗"), st("c", "貓")], "zh-TW");
    expect(g.map((x) => x.rep.word.headword)).toEqual(["貓", "狗"]);
  });

  it("見出し語が空の札はまとめない", () => {
    expect(groupDexWords([st("a", ""), st("b", "")], "zh-TW")).toHaveLength(2);
  });

  it("数えるのも言葉の数（見出しの数・カテゴリーの数）", () => {
    const list = [
      st("a", "貓", { cat: "animal" }),
      st("b", "貓", { cat: "animal" }),
      st("c", "狗", { cat: "animal" }),
    ];
    expect(countDexWords(list, "zh-TW")).toBe(2);
    expect(categoryOptions(list)).toEqual([{ key: "animal", count: 2 }]);
  });
});

describe("図鑑の番号（iOS `DexNumbering`）", () => {
  it("基本の100は表の番号、ほかは古い順に 101 から", () => {
    const store = memStore();
    const n = assignDexNumbers(
      [st("x", "豆花店", { day: 3 }), st("c", "咖啡", { day: 2 }), st("y", "電梯卡", { day: 1 })],
      "zh-TW",
      store,
    );
    expect(n.get("c")).toBe(2);
    expect(n.get("y")).toBe(101);
    expect(n.get("x")).toBe(102);
    expect(store.data).toEqual({ 電梯卡: 101, 豆花店: 102 });
  });

  it("一度付いた番号は動かない（覚えてある番号を使い、次は最大の次）", () => {
    const store = memStore({ 豆花店: 140 });
    const n = assignDexNumbers(
      [st("y", "電梯卡", { day: 1 }), st("x", "豆花店", { day: 3 })],
      "zh-TW",
      store,
    );
    expect(n.get("x")).toBe(140);
    expect(n.get("y")).toBe(141);
  });

  it("同じ言葉の札は同じ番号", () => {
    const n = assignDexNumbers(
      [st("a", "電梯卡"), st("b", "電梯卡", { day: 2 })],
      "zh-TW",
      memStore(),
    );
    expect(n.get("a")).toBe(n.get("b"));
  });

  it("表示は No.%03d、無ければ No.---", () => {
    expect(formatDexNo(7)).toBe("No.007");
    expect(formatDexNo(123)).toBe("No.123");
    expect(formatDexNo(null)).toBe("No.---");
  });
});

describe("図鑑の節（iOS `DexBook.sections`）", () => {
  const stickers = [
    st("cat1", "貓", { day: 1 }),
    st("cat2", "貓", { day: 2 }),
    st("m", "電梯卡", { cat: "transport" }),
  ];
  const numbers = assignDexNumbers(stickers, "zh-TW", memStore());

  it("20 のカテゴリーをこの順に。捕まえた言葉 → まだの影を5つ", () => {
    const secs = dexSections(stickers, { lang: "zh-TW", numbers, shadows: true });
    expect(secs.map((s) => s.dexNo)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    const animals = secs.find((s) => s.dexNo === 16)!;
    expect(animals.key).toBe("animal");
    expect(animals.caughtCount).toBe(1);
    expect(animals.slots[0]).toMatchObject({ kind: "caught", id: "cat2", no: 77 });
    // 貓（No.077）はもう捕まえたので、影からは外れる。
    const shadows = animals.slots.filter((s) => s.kind === "shadow");
    expect(shadows).toHaveLength(5);
    expect(shadows.map((s) => (s.kind === "shadow" ? s.item.id : ""))).toEqual([
      "dog",
      "bird",
      "fish",
      "rabbit",
      "pigeon",
    ]);
    expect(shadows[0].no).toBe(76);
    // 毎日の物の影には番号が無い。
    expect(shadows[4].no).toBeNull();
  });

  it("表に無い言葉は分類の鍵のカテゴリーに、番号順で", () => {
    const secs = dexSections(stickers, { lang: "zh-TW", numbers, shadows: true });
    const vehicles = secs.find((s) => s.dexNo === 13)!;
    expect(vehicles.slots[0]).toMatchObject({ kind: "caught", id: "m", no: 101 });
  });

  it("絞り込み・検索の最中は影を出さず、空の節も出さない", () => {
    const secs = dexSections(stickers, { lang: "zh-TW", numbers, shadows: false });
    expect(secs.map((s) => s.dexNo)).toEqual([13, 16]);
    expect(secs.every((s) => s.slots.every((x) => x.kind === "caught"))).toBe(true);
  });

  it("その人が移した先が勝つ（既定の鍵 → そのカテゴリー、その人のカテゴリー → 後ろの節）", () => {
    const moved = [st("a", "貓", { shelf_key: "toy" }), st("b", "狗", { shelf_key: "u_mine" })];
    const secs = dexSections(moved, {
      lang: "zh-TW",
      numbers: new Map(),
      userKeys: new Set(["u_mine"]),
      shadows: false,
    });
    expect(secs.map((s) => [s.key, s.dexNo])).toEqual([
      ["toy", 19],
      ["u_mine", null],
    ]);
  });
});

describe("保存: もう持っている言葉なら、その札の再会にする", () => {
  /** 呼ばれた順を書き留める、Supabase の問い合わせの偽物。 */
  function fake(owned: { id: string; encounter_count: number } | null, insertError = false) {
    const calls: string[] = [];
    const chain = (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: owned, error: null }),
        insert: async (row: unknown) => {
          calls.push(`insert ${table} ${JSON.stringify(row)}`);
          return { error: insertError ? { message: "no table" } : null };
        },
        update: (row: unknown) => {
          calls.push(`update ${table} ${JSON.stringify(row)}`);
          return q;
        },
      };
      return q;
    };
    return { client: { from: chain }, calls };
  }
  const enc = {
    image_path: "u1/p.jpg",
    cutout_path: null,
    lat: null,
    lng: null,
    location_name: null,
  };

  it("同じ語の札があれば、再会を1回書き足してその id を返す", async () => {
    const f = fake({ id: "s-old", encounter_count: 2 });
    expect(await reuseOwnedSticker(f.client, "u1", "w1", enc)).toBe("s-old");
    expect(f.calls[0]).toContain('insert encounters {"user_id":"u1","sticker_id":"s-old"');
    expect(f.calls[0]).toContain('"image_path":"u1/p.jpg"');
    expect(f.calls[1]).toBe('update stickers {"encounter_count":3}');
  });

  it("持っていなければ null（新しい札を作る）", async () => {
    expect(await reuseOwnedSticker(fake(null).client, "u1", "w1", enc)).toBeNull();
  });

  it("再会を書けなければ null（写真を宙に浮かせない）", async () => {
    const f = fake({ id: "s-old", encounter_count: 0 }, true);
    expect(await reuseOwnedSticker(f.client, "u1", "w1", enc)).toBeNull();
    expect(f.calls.some((c) => c.startsWith("update"))).toBe(false);
  });
});
