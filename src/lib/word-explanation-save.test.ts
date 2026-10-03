/**
 * 読む人ごとの解説の行（`word_explanations`）は、空の所だけ埋める（監査 2026-10-03 H2）。
 * `saveWordExplanation` を偽の DB で動かす。
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

import { saveWordExplanation } from "./word-explanation.functions";

type Row = Record<string, unknown>;

function fakeDb(existing: Row | null, readError: { message: string } | null = null) {
  const upserts: Array<{ rows: Row[]; opts: unknown }> = [];
  const updates: Array<{ row: Row; where: string[] }> = [];
  const db = {
    from: (t: string) => {
      expect(t).toBe("word_explanations");
      const where: string[] = [];
      const sel = {
        eq: (k: string, v: string) => {
          where.push(`${k}=${v}`);
          return sel;
        },
        maybeSingle: async () => ({ data: existing, error: readError }),
      };
      return {
        select: () => sel,
        upsert: async (rows: Row[], opts: unknown) => {
          upserts.push({ rows, opts });
          return { error: null };
        },
        update: (row: Row) => {
          const w: string[] = [];
          const chain = {
            eq: (k: string, v: string) => {
              w.push(`${k}=${v}`);
              if (w.length === 3) {
                updates.push({ row, where: w });
                return Promise.resolve({ error: null });
              }
              return chain;
            },
          };
          return chain;
        },
      };
    },
  };
  return { db, upserts, updates };
}

const input = {
  word_id: "w1",
  explain_lang: "en",
  l1: "en",
  meaning: "bicycle",
  example_translation: "I ride to school.",
  extras: { explain_lang: "en", usage_context: "commuting", mnemonic: "pedal car" },
};

describe("saveWordExplanation（空の所だけ）", () => {
  it("行が無ければ置く（間に作られた行があればそちらを残す）", async () => {
    const f = fakeDb(null);
    await expect(saveWordExplanation(f.db, input)).resolves.toEqual({ saved: true });
    expect(f.upserts).toHaveLength(1);
    expect(f.upserts[0].opts).toEqual({
      onConflict: "word_id,explain_lang,l1",
      ignoreDuplicates: true,
    });
    expect(f.upserts[0].rows[0]).toMatchObject({
      word_id: "w1",
      explain_lang: "en",
      l1: "en",
      meaning: "bicycle",
      source: "ai",
    });
    expect(f.updates).toEqual([]);
  });

  it("中身のある行は上書きしない — 空の項目だけ足す", async () => {
    const f = fakeDb({
      meaning: "bike",
      example_translation: "By bike.",
      extras: { explain_lang: "en", usage_context: "going to school" },
      source: "ai",
    });
    await saveWordExplanation(f.db, { ...input, meaning: "ATTACKER" });
    expect(f.upserts).toEqual([]);
    expect(f.updates).toHaveLength(1);
    expect(f.updates[0].where).toEqual(["word_id=w1", "explain_lang=en", "l1=en"]);
    const row = f.updates[0].row;
    expect(row.meaning).toBeUndefined();
    expect(row.example_translation).toBeUndefined();
    expect(row.extras).toEqual({
      explain_lang: "en",
      usage_context: "going to school",
      mnemonic: "pedal car",
    });
  });

  it("足す物が無ければ書かない", async () => {
    const f = fakeDb({ ...input, source: "ai" });
    await expect(saveWordExplanation(f.db, { ...input, meaning: "ATTACKER" })).resolves.toEqual({
      saved: false,
      reason: "nothing",
    });
    expect(f.updates).toEqual([]);
    expect(f.upserts).toEqual([]);
  });

  it("人が確かめた行は触らない", async () => {
    const f = fakeDb({ meaning: "", extras: {}, source: "verified" });
    await expect(saveWordExplanation(f.db, input)).resolves.toEqual({
      saved: false,
      reason: "verified",
    });
    expect(f.updates).toEqual([]);
    expect(f.upserts).toEqual([]);
  });

  it("行を読めない時は書かない（在る行を上書きしかねないので）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = fakeDb(null, { message: "timeout" });
    await expect(saveWordExplanation(f.db, input)).resolves.toEqual({
      saved: false,
      reason: "error",
    });
    expect(f.upserts).toEqual([]);
    warn.mockRestore();
  });
});
