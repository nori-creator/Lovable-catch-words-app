/**
 * 「その他」のまま保存された語の分け直し（オーナー報告 2026-10-09: 図鑑の「その他」に
 * 開關・刷子・健康餐・可頌・亮點・手背・面膜）。
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import {
  RECLASSIFY_BATCH,
  ReclassifySchema,
  chunked,
  planCategoryUpdates,
  reclassifyCandidates,
  reclassifyPrompt,
  type BackfillWordRow,
} from "./category-backfill";
import { reclassifyOtherWordsWith, type ReclassifyDeps } from "./category-backfill.functions";
import { AI_CONSENT_REQUIRED } from "./ai-consent";
import { dailyCapMessage } from "./ai-cap";
import { CATEGORY_KEYS } from "./category";

const row = (id: string, headword: string, category_key: string | null = "other") => ({
  id,
  headword,
  meaning_ja: `${headword} の意味`,
  category_key,
});

function fakeDeps(rows: BackfillWordRow[], over: Partial<ReclassifyDeps> = {}) {
  const store = new Map(rows.map((r) => [r.id, { ...r }]));
  const calls = { classify: [] as string[], cap: 0, writes: [] as Array<[string, string]> };
  const deps: ReclassifyDeps = {
    assertConsent: async () => undefined,
    reserveCap: async () => {
      calls.cap++;
    },
    ownedWordIds: async (ids) => ids.filter((id) => store.has(id)),
    readWords: async (ids) => ids.map((id) => store.get(id)!).filter(Boolean),
    classify: async (prompt) => {
      calls.classify.push(prompt);
      return { results: [] };
    },
    writeIfUnclassified: async (id, key) => {
      const r = store.get(id);
      if (!r || !(r.category_key === null || r.category_key === "other")) return false;
      r.category_key = key;
      calls.writes.push([id, key]);
      return true;
    },
    ...over,
  };
  return { deps, store, calls };
}

describe("分け直しに送る語を選ぶ", () => {
  const st = (word_id: string, headword: string, cat: string | null, shelf_key?: string) => ({
    word_id,
    shelf_key: shelf_key ?? null,
    word: { headword, language: "zh-TW", category_key: cat },
  });

  it("other・空の語だけ。規則や表で分かる語・その人が棚を選んだ札・同じ語の2枚目は送らない", () => {
    const ids = reclassifyCandidates(
      [
        st("w1", "亮點", "other"),
        st("w2", "某個東西", null),
        st("w1", "亮點", "other"), // 同じ語の2枚目
        st("w3", "可頌", "other"), // 規則で分かる（お菓子・パン）
        st("w4", "麵包", "other"), // 表に在る
        st("w5", "怪東西", "other", "u_mine"), // その人が棚を選んだ
        st("w6", "怪東西二", "food"), // もう分かれている
      ],
      "zh-TW",
    );
    expect(ids).toEqual(["w1", "w2"]);
  });

  it("50語ずつに分ける", () => {
    const ids = Array.from({ length: 120 }, (_, i) => `w${i}`);
    const parts = chunked(ids, RECLASSIFY_BATCH);
    expect(parts.map((p) => p.length)).toEqual([50, 50, 20]);
  });
});

describe("AI の答えの形（一覧の鍵だけ）", () => {
  it("一覧の外の鍵は other に落として、その語は書かない", () => {
    const parsed = ReclassifySchema.parse({
      results: [
        { i: 0, category_key: "food" },
        { i: 1, category_key: "snack_bar" },
        { i: 2, category_key: "medicine" },
      ],
    });
    expect(parsed.results.map((r) => r.category_key)).toEqual(["food", "other", "medicine"]);
    const plan = planCategoryUpdates(
      [row("a", "某甲"), row("b", "某乙"), row("c", "某丙", "tool")],
      parsed,
    );
    // c はもう分かれている（tool）ので上書きしない
    expect(plan).toEqual([{ id: "a", category_key: "food" }]);
  });

  it("見出し語の規則が AI の答えより先（燒仙草を植物にしない）", () => {
    const plan = planCategoryUpdates([row("a", "燒仙草")], {
      results: [{ i: 0, category_key: "plant" }],
    });
    expect(plan).toEqual([{ id: "a", category_key: "dessert" }]);
  });

  it("指示文に一覧の鍵が全部、崩れずに並ぶ。語はデータとして渡す", () => {
    const p = reclassifyPrompt([{ i: 0, headword: "亮點", meaning: "見どころ" }]);
    expect(p).toContain(CATEGORY_KEYS.join(", "));
    expect(p).not.toMatch(/\|のどれか/);
    expect(p).toContain(JSON.stringify({ i: 0, headword: "亮點", meaning: "見どころ" }));
  });
});

describe("サーバの分け直し（reclassifyOtherWordsWith）", () => {
  it("同意が無ければ AI を呼ばず、枠も取らず、何も書かない（「その他」のまま）", async () => {
    const { deps, calls } = fakeDeps([row("a", "怪東西")], {
      assertConsent: async () => {
        throw new Error(`${AI_CONSENT_REQUIRED}: no`);
      },
    });
    const out = await reclassifyOtherWordsWith(deps, ["a"]);
    expect(out.skipped).toBe("consent");
    expect(calls.classify).toHaveLength(0);
    expect(calls.cap).toBe(0);
    expect(calls.writes).toHaveLength(0);
  });

  it("other・空の語だけを書く。もう分かれている語・札を持っていない語は送らない", async () => {
    const { deps, calls, store } = fakeDeps([
      row("a", "怪東西"),
      row("b", "怪東西二", null),
      row("c", "怪東西三", "tool"),
    ]);
    deps.ownedWordIds = async (ids) => ids.filter((id) => id !== "x");
    deps.classify = async (prompt) => {
      calls.classify.push(prompt);
      return {
        results: [
          { i: 0, category_key: "home" },
          { i: 1, category_key: "food" },
        ],
      };
    };
    const out = await reclassifyOtherWordsWith(deps, ["a", "b", "c", "x"]);
    expect(calls.classify).toHaveLength(1);
    expect(calls.classify[0]).toContain("怪東西二");
    expect(calls.classify[0]).not.toContain("怪東西三");
    expect(out.updated).toEqual([
      { id: "a", category_key: "home" },
      { id: "b", category_key: "food" },
    ]);
    expect(store.get("c")!.category_key).toBe("tool");
    expect(out.asked).toBe(2);
  });

  it("書く直前に誰かが分けた語は上書きしない（条件付きの書き込み）", async () => {
    const { deps, store } = fakeDeps([row("a", "怪東西")]);
    deps.classify = async () => {
      store.get("a")!.category_key = "toy"; // 聞いている間に別の道が分けた
      return { results: [{ i: 0, category_key: "home" }] };
    };
    const out = await reclassifyOtherWordsWith(deps, ["a"]);
    expect(out.updated).toEqual([]);
    expect(store.get("a")!.category_key).toBe("toy");
  });

  it("規則で分かる語は AI を呼ばずに書く（可頌・面膜・手背）", async () => {
    const { deps, calls } = fakeDeps([row("a", "可頌"), row("b", "面膜"), row("c", "手背")]);
    const out = await reclassifyOtherWordsWith(deps, ["a", "b", "c"]);
    expect(calls.classify).toHaveLength(0);
    expect(calls.cap).toBe(0);
    expect(out.updated.map((u) => u.category_key)).toEqual(["dessert", "medicine", "body"]);
  });

  it("枠に届いたら AI を呼ばずにやめる", async () => {
    const { deps, calls } = fakeDeps([row("a", "怪東西")], {
      reserveCap: async () => {
        throw new Error(dailyCapMessage(10));
      },
    });
    const out = await reclassifyOtherWordsWith(deps, ["a"]);
    expect(out.skipped).toBe("cap");
    expect(calls.classify).toHaveLength(0);
  });

  it("AI が失敗しても投げない（図鑑は「その他」のまま）", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { deps } = fakeDeps([row("a", "怪東西")], {
      classify: async () => {
        throw new Error("boom");
      },
    });
    const out = await reclassifyOtherWordsWith(deps, ["a"]);
    expect(out.skipped).toBe("ai");
    expect(out.updated).toEqual([]);
  });

  it("1回に送るのは50語まで（AI の呼び出しは1回）", async () => {
    const rows = Array.from({ length: 70 }, (_, i) => row(`w${i}`, `怪東西${i}`));
    const { deps, calls } = fakeDeps(rows);
    const out = await reclassifyOtherWordsWith(
      deps,
      rows.map((r) => r.id),
    );
    expect(calls.classify).toHaveLength(1);
    expect(out.asked).toBe(RECLASSIFY_BATCH);
  });
});
