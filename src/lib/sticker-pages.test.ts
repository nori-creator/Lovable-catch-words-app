import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  combineStickerItems,
  encountersFor,
  parseStickerPageInput,
  stickerListQueryFn,
  STICKER_FIRST_PAGE,
  STICKER_NEXT_PAGE,
  STICKERS_KEY,
  type StickerList,
  type StickerPage,
} from "./sticker-pages";
import type { StickerWithWord } from "./stickers.functions";
import type { AlbumEncounter } from "./album-encounters";

/** 新しい順の札。`n` が大きいほど古い。 */
const sticker = (n: number, created = new Date(Date.UTC(2026, 8, 1) - n * 60_000)) =>
  ({
    id: `s${String(n).padStart(5, "0")}`,
    created_at: created.toISOString(),
    word: { headword: `w${n}` },
  }) as unknown as StickerWithWord;

const ids = (list: readonly StickerWithWord[]) => list.map((s) => s.id);

describe("ページの入力", () => {
  it("入力なしは null（iOS 版・MCP の前からの呼び方 = 全部まとめて）", () => {
    expect(parseStickerPageInput(undefined)).toBeNull();
    expect(parseStickerPageInput(null)).toBeNull();
  });
  it("1回に頼めるのは 1000 件まで", () => {
    expect(parseStickerPageInput({ offset: 0, limit: 5000 })).toEqual({ offset: 0, limit: 1000 });
    expect(parseStickerPageInput({ offset: 240 })).toEqual({
      offset: 240,
      limit: STICKER_FIRST_PAGE,
    });
  });
  it("負の数・小数・文字は断る", () => {
    expect(() => parseStickerPageInput({ offset: -1, limit: 10 })).toThrow();
    expect(() => parseStickerPageInput({ offset: 1.5, limit: 10 })).toThrow();
    expect(() => parseStickerPageInput({ offset: 0, limit: 0 })).toThrow();
    expect(() => parseStickerPageInput("all")).toThrow();
  });
});

describe("読み足し途中の一覧", () => {
  const started = "2026-09-01T00:00:00.000Z";
  const all = Array.from({ length: 10 }, (_, i) => sticker(i));

  it("**まだ届いていない古い側は、手元の一覧のまま見せる**（読み直すたびに縮まない）", () => {
    const got = combineStickerItems(all.slice(0, 3), all, started, false);
    expect(ids(got)).toEqual(ids(all));
  });

  it("読み終えたら、サーバに無い札（消した札）は落とす", () => {
    const without5 = all.filter((_, i) => i !== 5);
    expect(ids(combineStickerItems(without5, all, started, true))).toEqual(ids(without5));
  });

  it("**読み込みを始めた後に先に入れた札（撮った直後）は残す**", () => {
    const fresh = sticker(-1, new Date("2026-09-02T00:00:00.000Z"));
    const got = combineStickerItems(all.slice(0, 3), [fresh, ...all], started, true);
    expect(ids(got)).toEqual([fresh.id, ...ids(all.slice(0, 3))]);
  });

  it("始める前からあってサーバに無い新しい札は、消えた札として落とす", () => {
    const deletedNewest = sticker(-1, new Date("2026-08-31T23:59:00.000Z"));
    const got = combineStickerItems(all.slice(0, 3), [deletedNewest, ...all], started, false);
    expect(got.map((s) => s.id)).not.toContain(deletedNewest.id);
  });

  it("時刻の書き方（Z と +00:00）が混ざっても順番を取り違えない", () => {
    const a = { ...sticker(1), created_at: "2026-09-01T00:00:00+00:00" } as StickerWithWord;
    const b = sticker(2, new Date("2026-08-31T23:00:00.000Z"));
    expect(ids(combineStickerItems([a], [a, b], started, false))).toEqual([a.id, b.id]);
  });

  it("再会の写真は、一覧にある札の物だけ", () => {
    const enc = [{ sticker_id: all[0].id }, { sticker_id: "elsewhere" }] as AlbumEncounter[];
    expect(encountersFor(enc, all)).toEqual([enc[0]]);
  });
});

/** サーバの代わり: 新しい順の `rows` をページで返す（天井 3000 はサーバの約束）。 */
function fakeServer(rows: StickerWithWord[], opts: { failAt?: number; cap?: number } = {}) {
  const calls: Array<{ offset: number; limit: number }> = [];
  const cap = opts.cap ?? 3000;
  const fetchPage = async ({ data }: { data: { offset: number; limit: number } }) => {
    calls.push(data);
    if (opts.failAt != null && data.offset >= opts.failAt) throw new Error("network");
    const items = rows.slice(data.offset, Math.min(data.offset + data.limit, cap));
    const end = data.offset + items.length;
    const page: StickerPage = {
      items,
      truncated: false,
      total: data.offset === 0 ? rows.length : null,
      targetLanguage: "zh-TW",
      otherLanguages: 0,
      albumEncounters:
        data.offset === 0 ? [{ sticker_id: rows[rows.length - 1]?.id } as AlbumEncounter] : [],
      nextOffset: items.length >= data.limit && end < cap && end < rows.length ? end : null,
      rawCount: items.length,
    };
    return page;
  };
  return { fetchPage, calls };
}

const settle = async (qc: QueryClient) => {
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 0));
    if (!qc.getQueryData<StickerList>(STICKERS_KEY)?.loadingMore) return;
  }
};

describe("図鑑の一覧をページで読む（2026-10-03 監査: 一度に最大 3000 件）", () => {
  it("**最初は1ページだけ待って返し**、残りは裏で読み足して全部そろう", async () => {
    const rows = Array.from({ length: 1300 }, (_, i) => sticker(i));
    const { fetchPage, calls } = fakeServer(rows);
    const qc = new QueryClient();
    const first = await qc.fetchQuery({
      queryKey: STICKERS_KEY,
      queryFn: stickerListQueryFn(qc, fetchPage),
    });
    expect(first.items).toHaveLength(STICKER_FIRST_PAGE);
    expect(first.loadingMore).toBe(true);
    expect(first.truncated).toBe(false);
    await settle(qc);
    const done = qc.getQueryData<StickerList>(STICKERS_KEY)!;
    expect(ids(done.items)).toEqual(ids(rows));
    expect(done.loadingMore).toBe(false);
    expect(done.truncated).toBe(false);
    // 1ページずつ。1回に 1000 件を超えて頼まない。
    expect(calls.every((c) => c.limit <= STICKER_NEXT_PAGE)).toBe(true);
    expect(calls[0]).toEqual({ offset: 0, limit: STICKER_FIRST_PAGE });
    // 古い札の再会の写真も、全部そろった一覧で残る。
    expect(done.albumEncounters).toHaveLength(1);
  });

  it("天井（3000 件）で止まったことを、読み終えてから `truncated` で言う", async () => {
    const rows = Array.from({ length: 3200 }, (_, i) => sticker(i));
    const qc = new QueryClient();
    await qc.fetchQuery({
      queryKey: STICKERS_KEY,
      queryFn: stickerListQueryFn(qc, fakeServer(rows).fetchPage),
    });
    await settle(qc);
    const done = qc.getQueryData<StickerList>(STICKERS_KEY)!;
    expect(done.items).toHaveLength(3000);
    expect(done.truncated).toBe(true);
  });

  it("**続きが読めなくても、読めた所までは消さない**（途中までと印を付ける）", async () => {
    const rows = Array.from({ length: 900 }, (_, i) => sticker(i));
    const qc = new QueryClient();
    await qc.fetchQuery({
      queryKey: STICKERS_KEY,
      queryFn: stickerListQueryFn(qc, fakeServer(rows, { failAt: 400 }).fetchPage),
    });
    await settle(qc);
    const done = qc.getQueryData<StickerList>(STICKERS_KEY)!;
    expect(done.items.length).toBeGreaterThanOrEqual(STICKER_FIRST_PAGE);
    expect(done.loadingMore).toBe(false);
    expect(done.truncated).toBe(true);
  });

  it("1ページで足りる人は、裏の読み足しをしない", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => sticker(i));
    const { fetchPage, calls } = fakeServer(rows);
    const qc = new QueryClient();
    const first = await qc.fetchQuery({
      queryKey: STICKERS_KEY,
      queryFn: stickerListQueryFn(qc, fetchPage),
    });
    expect(first.loadingMore).toBe(false);
    expect(first.items).toHaveLength(30);
    expect(calls).toHaveLength(1);
  });

  it("新しい読み込みが始まったら、古い読み足しは一覧に触らない", async () => {
    const rows = Array.from({ length: 1300 }, (_, i) => sticker(i));
    const qc = new QueryClient();
    await qc.fetchQuery({
      queryKey: STICKERS_KEY,
      queryFn: stickerListQueryFn(qc, fakeServer(rows).fetchPage),
    });
    // 保存の後の読み直しの代わりに、別の一覧を置く。
    const other: StickerList = {
      items: [sticker(0)],
      truncated: false,
      total: 1,
      targetLanguage: "zh-TW",
      otherLanguages: 0,
      albumEncounters: [],
      loadId: "newer",
    };
    qc.setQueryData(STICKERS_KEY, other);
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
    expect(qc.getQueryData(STICKERS_KEY)).toEqual(other);
  });
});
