import { describe, expect, it } from "vitest";
import { prependSticker, type StickerListCache } from "./optimistic-sticker";
import type { StickerWithWord } from "./stickers.functions";

const sticker = (id: string): StickerWithWord =>
  ({ id, word: { headword: id } }) as unknown as StickerWithWord;

describe("保存した札を図鑑の手元の一覧へ先に入れる", () => {
  it("**先頭に差し込む**（図鑑を開いた瞬間にマス目が在る）", () => {
    const cache: StickerListCache = { items: [sticker("old")], truncated: false, total: 1 };
    const next = prependSticker(cache, sticker("new"));
    expect(next?.items.map((s) => s.id)).toEqual(["new", "old"]);
    expect(next?.total).toBe(2);
  });

  it("**読み直しが先に届いていたら、本物を残す**（二重にしない）", () => {
    const real = sticker("new");
    const cache: StickerListCache = { items: [real], total: 1 };
    const next = prependSticker(cache, sticker("new"));
    expect(next).toBe(cache);
    expect(next?.items[0]).toBe(real);
  });

  it("まだ一度も読んでいない一覧には触らない", () => {
    expect(prependSticker(undefined, sticker("new"))).toBeUndefined();
  });

  it("総数が分からない一覧は、分からないまま", () => {
    const next = prependSticker({ items: [], total: null }, sticker("new"));
    expect(next?.total).toBeNull();
  });

  it("元の一覧は書き換えない（React Query の前の値を壊さない）", () => {
    const cache: StickerListCache = { items: [sticker("old")] };
    prependSticker(cache, sticker("new"));
    expect(cache.items.map((s) => s.id)).toEqual(["old"]);
  });
});
