/**
 * 監査 2026-10-03 の残りの直しを、動かして確かめる。
 * - 復習の「今日」は台湾の日付（`startOfAppDay`）
 * - 発音の共有の置き場は辞書の文だけ（`isShareableTtsText`）
 * - 3D の中継の大きさの上限（`capByteStream` / `declaredTooLarge`）
 * - 退会の写真の掃除は下の階層まで（`removeAllUnder`）
 * - 札を消すときの写真の置き場所は自分の物だけ（`stickerStoragePaths`）
 * - /api/native-ai は既定で閉じる（`nativeAiEnabled`）
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { startOfAppDay, taipeiDay } from "./taipei-day";
import { isShareableTtsText, type TtsShareDb } from "./tts-share";
import { MAX_MODEL_BYTES, capByteStream, declaredTooLarge } from "./object3d";
import { removeAllUnder, type StorageBucket, type StorageEntry } from "./storage-cleanup";
import { stickerStoragePaths } from "./stickers.functions";
import { nativeAiEnabled } from "./native-ai";

describe("startOfAppDay（復習の 1 日の上限の起点）", () => {
  it("台湾の 0:00 = UTC の前の日の 16:00", () => {
    expect(startOfAppDay(new Date("2026-10-03T03:00:00Z"))).toBe("2026-10-02T16:00:00.000Z");
  });

  it("UTC の 0:00 をまたいでも、台湾の同じ日なら同じ起点（前はここで数え直していた）", () => {
    const before = startOfAppDay(new Date("2026-10-02T23:59:00Z")); // 台湾 07:59
    const after = startOfAppDay(new Date("2026-10-03T00:01:00Z")); // 台湾 08:01
    expect(after).toBe(before);
  });

  it("台湾の 0:00 をまたぐと次の日になる", () => {
    expect(startOfAppDay(new Date("2026-10-03T15:59:00Z"))).toBe("2026-10-02T16:00:00.000Z");
    expect(startOfAppDay(new Date("2026-10-03T16:00:00Z"))).toBe("2026-10-03T16:00:00.000Z");
    expect(taipeiDay(new Date("2026-10-03T16:00:00Z"))).toBe("2026-10-04");
  });
});

describe("isShareableTtsText（全員の音の置き場に貯めてよい文）", () => {
  type Filter = { table: string; eq: Record<string, string>; contains?: unknown };
  /** 表ごとの行を持ち、eq と contains を本当に当てる偽物。 */
  function db(tables: Record<string, Array<Record<string, unknown>>>, fail = false) {
    const calls: Filter[] = [];
    const run = (f: Filter) => {
      calls.push(f);
      if (fail) return Promise.resolve({ data: null, error: { message: "down" } });
      const rows = (tables[f.table] ?? []).filter(
        (r) =>
          Object.entries(f.eq).every(([k, v]) => r[k] === v) &&
          (!f.contains ||
            JSON.stringify(r.extras ?? {}).includes(
              JSON.stringify(
                (f.contains as { examples_extra: [{ zh: string }] }).examples_extra[0].zh,
              ),
            )),
      );
      return Promise.resolve({ data: rows.slice(0, 1), error: null });
    };
    const q = (f: Filter): unknown => ({
      eq: (k: string, v: string) => q({ ...f, eq: { ...f.eq, [k]: v } }),
      contains: (_: string, v: unknown) => q({ ...f, contains: v }),
      limit: () => run(f),
    });
    const client = {
      from: (table: string) => ({ select: () => q({ table, eq: {} }) }),
    } as unknown as TtsShareDb;
    return { client, calls };
  }

  const tables = {
    dictionary_entries: [{ language: "zh-TW", headword: "腳踏車" }],
    words: [
      {
        language: "zh-TW",
        headword: "芒果",
        example_sentence: "我喜歡吃芒果。",
        extras: { examples_extra: [{ zh: "這個芒果很甜。", ja: "甘い" }] },
      },
    ],
    word_explanations: [{ extras: { examples_extra: [{ zh: "芒果冰很好吃。" }] } }],
  };

  it.each(["腳踏車", "芒果", " 芒果 ", "我喜歡吃芒果。", "這個芒果很甜。", "芒果冰很好吃。"])(
    "辞書の文「%s」は貯める",
    async (text) => {
      expect(await isShareableTtsText(db(tables).client, "zh-TW", text)).toBe(true);
    },
  );

  it.each(["今天和媽媽去夜市，好開心。", "我的密碼是 1234", ""])(
    "それ以外の文「%s」は貯めない（日記・ひと言・打ち込んだ文）",
    async (text) => {
      expect(await isShareableTtsText(db(tables).client, "zh-TW", text)).toBe(false);
    },
  );

  it("別の言語の見出し語としては貯めない", async () => {
    expect(await isShareableTtsText(db(tables).client, "en", "芒果")).toBe(false);
  });

  it("見出し語で当たれば、重い例文の検索はしない", async () => {
    const d = db(tables);
    await isShareableTtsText(d.client, "zh-TW", "腳踏車");
    expect(d.calls.every((c) => !c.eq.example_sentence && !c.contains)).toBe(true);
  });

  it("調べられないときは貯めない側に倒す", async () => {
    expect(await isShareableTtsText(db(tables, true).client, "zh-TW", "腳踏車")).toBe(false);
  });
});

describe("3D の形の中継の大きさの上限", () => {
  const stream = (chunks: number[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const n of chunks) c.enqueue(new Uint8Array(n));
        c.close();
      },
    });
  const drain = async (s: ReadableStream<Uint8Array>) => {
    let total = 0;
    const reader = s.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return total;
      total += value.byteLength;
    }
  };

  it("上限以内はそのまま流す", async () => {
    expect(await drain(capByteStream(stream([10, 20, 30]), 60))).toBe(60);
  });

  it("上限を超えたら止める（content-length を付けない配信先でも）", async () => {
    await expect(drain(capByteStream(stream([40, 40]), 60))).rejects.toThrow("too large");
  });

  it("content-length が上限を超えていれば先に断る", () => {
    expect(declaredTooLarge(String(MAX_MODEL_BYTES + 1))).toBe(true);
    expect(declaredTooLarge(String(MAX_MODEL_BYTES))).toBe(false);
    expect(declaredTooLarge(null)).toBe(false);
    expect(declaredTooLarge("abc")).toBe(false);
  });
});

describe("removeAllUnder（退会の写真の掃除）", () => {
  /** 置き場所の一覧を持ち、Supabase と同じく1階層ずつ・フォルダは id: null で返す偽物。 */
  function bucket(files: string[], page = 1000) {
    const store = new Set(files);
    const removed: string[][] = [];
    const b: StorageBucket = {
      list: async (prefix, { limit, offset }) => {
        const children = new Map<string, StorageEntry>();
        for (const f of store) {
          if (!f.startsWith(`${prefix}/`)) continue;
          const rest = f.slice(prefix.length + 1);
          const [head, ...tail] = rest.split("/");
          children.set(head, { name: head, id: tail.length ? null : `id-${f}` });
        }
        const all = [...children.values()].sort((a, c) => a.name.localeCompare(c.name));
        return { data: all.slice(offset, offset + Math.min(limit, page)), error: null };
      },
      remove: async (paths) => {
        removed.push(paths);
        for (const p of paths) store.delete(p);
        return { error: null };
      },
    };
    return { b, store, removed };
  }

  it("下の階層の写真まで全部消し、他の人の写真は残す", async () => {
    const { b, store } = bucket([
      "u1/1-object.jpg",
      "u1/1-object.jpg.thumb.webp",
      "u1/draft-1/photo.jpg",
      "u1/draft-1/deep/selfie.jpg",
      "u1/avatar-1.png",
      "u2/1-object.jpg",
    ]);
    expect(await removeAllUnder(b, "u1")).toBe(5);
    expect([...store]).toEqual(["u2/1-object.jpg"]);
  });

  it("1000 件を超えても全部消す", async () => {
    const many = Array.from({ length: 2500 }, (_, i) => `u1/${String(i).padStart(4, "0")}.jpg`);
    const { b, store, removed } = bucket(many);
    expect(await removeAllUnder(b, "u1")).toBe(2500);
    expect(store.size).toBe(0);
    expect(removed.every((r) => r.length <= 1000)).toBe(true);
  });

  it("バケットが無い環境では何もしない。ほかの失敗は投げる（消えたと言わない）", async () => {
    const missing: StorageBucket = {
      list: async () => ({ data: null, error: { message: "Bucket not found" } }),
      remove: async () => ({ error: null }),
    };
    expect(await removeAllUnder(missing, "u1", { missingOk: true })).toBe(0);
    const failing: StorageBucket = {
      list: async () => ({ data: [{ name: "a.jpg", id: "1" }], error: null }),
      remove: async () => ({ error: { message: "denied" } }),
    };
    await expect(removeAllUnder(failing, "u1", { missingOk: true })).rejects.toThrow("denied");
  });
});

describe("stickerStoragePaths（札を消すときの写真）", () => {
  it("自分のフォルダの写真と縮小版だけ", () => {
    expect(
      stickerStoragePaths(
        {
          object_image_url: "u1/1-object.jpg",
          cutout_image_url: "u2/stolen.png",
          selfie_image_url: null,
        },
        "u1",
      ),
    ).toEqual(["u1/1-object.jpg", "u1/1-object.jpg.thumb.webp"]);
  });
});

describe("/api/native-ai は既定で閉じる", () => {
  it("NATIVE_AI_ENABLED が 1 / true のときだけ開く", () => {
    for (const v of [undefined, null, "", "0", "false", "yes"])
      expect(nativeAiEnabled(v)).toBe(false);
    for (const v of ["1", "true", " TRUE "]) expect(nativeAiEnabled(v)).toBe(true);
  });
});
