import { describe, expect, it, vi } from "vitest";
import {
  assignDexNumbers,
  countDexWords,
  dexAdGroupSizes,
  dexPlaceOf,
  dexSections,
  formatDexNo,
  groupDexWords,
  type DexGroupable,
  type DexNumberStore,
} from "./dex-book";
import { categoryOptions } from "./dex-filter";
import { groupAdSlots } from "./adsense";
import { bumpEncounterCount, mayReuseOwnedSticker, reuseOwnedSticker } from "./stickers.functions";

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

  it("札をまだ全部読んでいない間は覚えない（読み終えてから捕まえた順で振る）", () => {
    const store = memStore();
    // 最初のページ（新しい札だけ）。番号は出すが、覚えない。
    const early = assignDexNumbers([st("x", "豆花店", { day: 3 })], "zh-TW", store, false);
    expect(early.get("x")).toBe(101);
    expect(store.data).toEqual({});
    // 全部届いた: 古い札が先に 101。
    const n = assignDexNumbers(
      [st("x", "豆花店", { day: 3 }), st("y", "電梯卡", { day: 1 })],
      "zh-TW",
      store,
      true,
    );
    expect(n.get("y")).toBe(101);
    expect(n.get("x")).toBe(102);
    expect(store.data).toEqual({ 電梯卡: 101, 豆花店: 102 });
  });

  it("同じ言葉の札は同じ番号", () => {
    const n = assignDexNumbers(
      [st("a", "電梯卡"), st("b", "電梯卡", { day: 2 })],
      "zh-TW",
      memStore(),
    );
    expect(n.get("a")).toBe(n.get("b"));
  });

  it("表示は No.%03d、無ければ No.???（No.--- は作りかけに見えた）", () => {
    expect(formatDexNo(7)).toBe("No.007");
    expect(formatDexNo(123)).toBe("No.123");
    expect(formatDexNo(null)).toBe("No.???");
  });
});

describe("図鑑の節（iOS `DexBook.sections`）", () => {
  const stickers = [
    st("cat1", "貓", { day: 1 }),
    st("cat2", "貓", { day: 2 }),
    st("m", "電動車", { cat: "transport" }),
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
          // 更新は「当たった行」を返す（`.select("id")`）。
          const u = {
            eq: (col: string, v: unknown) => {
              if (col === "encounter_count") calls.push(`where encounter_count=${v}`);
              return u;
            },
            select: async () => ({ data: [{ id: owned?.id }], error: null }),
          };
          return u;
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
    // 読んだ値のままの時だけ書く（同時の再会で数を取りこぼさない）。
    expect(f.calls[2]).toBe("where encounter_count=2");
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

describe("再会の回数を1つ増やす（結果を見る）", () => {
  /** 更新の結果を順に返す偽物（`[]` = 1行も当たらない）。読み直しは `reread` を返す。 */
  function fake(
    results: Array<{ data: unknown[] | null; error: { message: string } | null }>,
    reread = 5,
  ) {
    const writes: number[] = [];
    let i = 0;
    const client = {
      from: () => {
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: { encounter_count: reread }, error: null }),
          update: (row: { encounter_count: number }) => {
            writes.push(row.encounter_count);
            const u = {
              eq: () => u,
              select: async () => results[i++] ?? { data: [], error: null },
            };
            return u;
          },
        };
        return q;
      },
    };
    return { client, writes };
  }

  it("1行当たれば済む", async () => {
    const f = fake([{ data: [{ id: "s" }], error: null }]);
    expect(await bumpEncounterCount(f.client, "u1", "s", 2)).toBe(true);
    expect(f.writes).toEqual([3]);
  });

  it("同時に数が変わって当たらなければ、読み直してもう一度", async () => {
    const f = fake(
      [
        { data: [], error: null },
        { data: [{ id: "s" }], error: null },
      ],
      5,
    );
    expect(await bumpEncounterCount(f.client, "u1", "s", 2)).toBe(true);
    expect(f.writes).toEqual([3, 6]);
  });

  it("失敗は黙って飲まず false（何度も書き直さない）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = fake([{ data: null, error: { message: "boom" } }]);
    expect(await bumpEncounterCount(f.client, "u1", "s", 2)).toBe(false);
    expect(f.writes).toEqual([3]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("当たらないままなら上限で諦める", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = fake([], 2);
    expect(await bumpEncounterCount(f.client, "u1", "s", 2)).toBe(false);
    expect(f.writes).toEqual([3, 3, 3]);
    warn.mockRestore();
  });
});

describe("保存を再会にしてよいか（書いた物を捨てない）", () => {
  it("ひと言も自撮りも無ければ再会にする", () => {
    expect(mayReuseOwnedSticker({ caption: null, selfie_path: null }, "u1")).toBe(true);
    expect(mayReuseOwnedSticker({ caption: "  " }, "u1")).toBe(true);
  });

  it("ひと言・自撮りがあれば新しい札を作る（再会の行には入れる所が無い）", () => {
    expect(mayReuseOwnedSticker({ caption: "公園で" }, "u1")).toBe(false);
    expect(mayReuseOwnedSticker({ selfie_path: "u1/1-selfie.jpg" }, "u1")).toBe(false);
  });

  it("他人のフォルダの自撮りは元々捨てる物なので、再会を止めない", () => {
    expect(mayReuseOwnedSticker({ selfie_path: "u2/1-selfie.jpg" }, "u1")).toBe(true);
  });

  it("初めてのキャッチの引き継ぎ（決めた id）は再会にしない", () => {
    expect(mayReuseOwnedSticker({ client_catch_id: "c1" }, "u1")).toBe(false);
  });
});

describe("写真の升目の広告は、捕まえた札の後ろにだけ数える", () => {
  it("影のマスを数えない（節の大きさは捕まえた札の数）", () => {
    const secs = dexSections([st("a", "貓"), st("b", "狗", { day: 2 })], {
      lang: "zh-TW",
      numbers: new Map(),
      shadows: true,
    });
    const sizes = dexAdGroupSizes(secs);
    expect(sizes).toEqual(secs.map((s) => s.caughtCount));
    // 影がある節でも、広告の番号は捕まえた札のマスにしか当たらない。
    const slots = groupAdSlots(sizes, [0, 1, 2, 3, 4, 5], 3);
    slots.forEach((list, g) => {
      for (const i of list) expect(secs[g].slots[i].kind).toBe("caught");
    });
    expect(secs.some((s) => s.slots.some((x) => x.kind === "shadow"))).toBe(true);
  });
});

describe("表に無い語の置き場所", () => {
  it("燒仙草は「植物・花」(17) ではなく「お菓子」(4)（オーナー報告 2026-10-08）", () => {
    const s = st("x", "燒仙草", { cat: "plant" });
    expect(dexPlaceOf(s, "zh-TW", new Set())).toBe(4);
  });

  it("その人が移した先は、いつも勝つ", () => {
    const s = { ...st("x", "燒仙草", { cat: "plant" }), shelf_key: "plant" };
    expect(dexPlaceOf(s, "zh-TW", new Set())).toBe(17);
  });
});

/**
 * 2026-10-09 オーナー報告（図鑑の録画）: 野のキノコの写真の「蘑菇」と子豚の「小豬」が
 * 「洗面・日用品」(10) に並んでいた（面膜はそこで正しい）。札の分類は「その他」(other) で、
 * 図鑑は other を 10 に黙って寄せていた。表 → 言い方の揺れ → 分類の鍵 → 「その他」の節の順。
 */
describe("「その他」を日用品に寄せない（蘑菇・小豬・面膜）", () => {
  const none = new Set<string>();

  it("蘑菇は「植物・花」(17)。表の香菇と同じ所（AI の答えが other でも）", () => {
    expect(dexPlaceOf(st("m", "蘑菇", { cat: "other" }), "zh-TW", none)).toBe(17);
  });

  it("小豬は「動物」(16)（AI の答えが other でも）", () => {
    expect(dexPlaceOf(st("p", "小豬", { cat: "other" }), "zh-TW", none)).toBe(16);
    expect(dexPlaceOf(st("p2", "山豬", { cat: null }), "zh-TW", none)).toBe(16);
  });

  it("面膜は「洗面・日用品」(10) のまま", () => {
    expect(dexPlaceOf(st("f", "面膜", { cat: "medicine" }), "zh-TW", none)).toBe(10);
  });

  // 2026-10-09 オーナーの図鑑の画面: 「その他」に開關・刷子・健康餐・可頌・亮點・手背・面膜。
  it("other のまま保存された語も、見出し語で正しい節へ（亮點だけ「その他」）", () => {
    const at = (h: string) => dexPlaceOf(st(h, h, { cat: "other" }), "zh-TW", none);
    expect(at("開關")).toBe(6); // 家具・インテリア（電燈・門と同じ）
    expect(at("刷子")).toBe(10); // 洗面・日用品
    expect(at("健康餐")).toBe(2); // 料理・屋台
    expect(at("可頌")).toBe(4); // お菓子・パン
    expect(at("手背")).toBe(20); // 人・体
    expect(at("面膜")).toBe(10); // 洗面・日用品
    expect(at("亮點")).toBe("other");
  });

  it("表にも規則にも当たらない語は「その他」の節。知らない鍵も同じ", () => {
    expect(dexPlaceOf(st("u", "某個東西", { cat: "other" }), "zh-TW", none)).toBe("other");
    expect(dexPlaceOf(st("u2", "某個東西", { cat: "place" }), "zh-TW", none)).toBe("other");
    expect(dexPlaceOf(st("u3", "某個東西", { shelf_key: "other" }), "zh-TW", none)).toBe("other");
  });

  it("「その他」の節は、その人のカテゴリーよりも後ろのいちばん最後", () => {
    const secs = dexSections(
      [
        st("u", "某個東西"),
        st("m", "蘑菇"),
        st("f", "面膜", { cat: "medicine" }),
        st("b", "狗", { shelf_key: "u_mine" }),
      ],
      { lang: "zh-TW", numbers: new Map(), userKeys: new Set(["u_mine"]), shadows: false },
    );
    expect(secs.map((s) => [s.key, s.dexNo])).toEqual([
      ["tool", 10],
      ["plant", 17],
      ["u_mine", null],
      ["other", null],
    ]);
    expect(secs.find((s) => s.dexNo === 10)!.slots.map((x) => x.id)).toEqual(["f"]);
  });
});
