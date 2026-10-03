/**
 * 共有の行に、個人の記録も画面の送った文も入れない（監査 2026-10-03 H1 / H2 / M3 / L5）。
 *
 * 生成そのものは AI を呼ぶので動かせない。**プロンプトに何を渡しているか・どこに書くか**を
 * 文字列で確かめる（`route-split.test.ts` と同じやり方）。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exampleSourceRule, sharedExampleSourceRule, worldExampleRule } from "./example-sources";

const read = (p: string) => readFileSync(p, "utf8");

/** `start` から次の最上位の宣言までを切り出す。 */
function block(src: string, start: string): string {
  const i = src.indexOf(start);
  expect(i).toBeGreaterThan(-1);
  const rest = src.slice(i + start.length);
  const next = rest.search(/\n(?:export )?(?:async )?(?:function|const) /);
  return start + (next === -1 ? rest : rest.slice(0, next));
}

describe("H1: 共有の行に書く例文に、その人の記録を渡さない", () => {
  it("共有の例文の指示は世界の側だけ（個人の材料を受け取る口が無い）", () => {
    expect(sharedExampleSourceRule("日本語", "zh-TW")).toBe(worldExampleRule("日本語", "zh-TW"));
    expect(sharedExampleSourceRule.length).toBeLessThanOrEqual(2);
    // 比較: 個人の側を混ぜる指示は記録の中身をそのまま書く — これを共有の生成に使わない。
    expect(exampleSourceRule({ caption: "秘密の一言" }, "日本語")).toContain("秘密の一言");
  });

  it("項目の作り直し（runSectionRegen）は一言・場所・日時・日記を読まない", () => {
    const fn = block(read("src/lib/ai.functions.ts"), "async function runSectionRegen(");
    expect(fn).not.toMatch(/journal_entries|user_draft/);
    expect(fn).not.toMatch(/caption|location_name|taken_at/);
    expect(fn).not.toMatch(/exampleSourceRule\(|personalExampleRule\(|PersonalMaterial/);
    expect(fn).toMatch(/sharedExampleSourceRule\(NL, regenProfile\.code\)/);
  });

  it("ai.functions.ts は個人の材料の指示を取り込まない", () => {
    const src = read("src/lib/ai.functions.ts");
    expect(src).not.toMatch(/\bexampleSourceRule\b|\bpersonalExampleRule\b|\bDIARY_COUNT\b/);
  });

  it("移行: 解説の表を anon から読めなくする（ログインした人だけ）", () => {
    const sql = read("supabase/migrations/20261003130050_word_explanations_no_anon_select.sql");
    expect(sql).toMatch(/revoke select on public\.word_explanations from anon;/);
    expect(sql).toMatch(/drop policy if exists word_explanations_select_all/);
    expect(sql).toMatch(/for select\s+to authenticated/);
  });

  it("アプリは anon でこの表を読まない（ブラウザの client から引いていない）", () => {
    for (const f of [
      "src/components/StickerSheet.tsx",
      "src/lib/reader-explanation.ts",
      "src/lib/use-review-reader-explanations.ts",
    ]) {
      expect(read(f)).not.toMatch(/from\("word_explanations"\)/);
    }
  });
});

describe("H2 / M3: 共有の行の中身はサーバの控えから", () => {
  it("generateCard は返す前にカードを控え、既に在る語の空の所を後で埋める", () => {
    const src = read("src/lib/ai.functions.ts");
    const gen = src.slice(
      src.indexOf("export const generateCard"),
      src.indexOf("// --- Phrase cards"),
    );
    const recordAt = gen.indexOf("await recordGeneratedCards(");
    expect(recordAt).toBeGreaterThan(-1);
    expect(recordAt).toBeLessThan(gen.lastIndexOf("return out;"));
    expect(gen).toMatch(/kind: "card" as const/);
    expect(gen).toMatch(/fillSharedWordFromCard\(supabaseAdmin/);
  });

  it("候補を出す関数は候補を控える（写真・文字・スキャン・フレーズ）", () => {
    const ai = read("src/lib/ai.functions.ts");
    expect(ai.match(/await recordCandidateReceipts\(/g)?.length).toBe(3);
    expect(read("src/lib/scan.functions.ts")).toMatch(/recordGeneratedCards\(/);
    expect(read("src/lib/first-catch-ai.server.ts")).toMatch(/recordGeneratedCards\(/);
  });

  it("移行: 控えの表はサーバの鍵だけ（ブラウザには何の権限も無い）", () => {
    const sql = read("supabase/migrations/20261003130100_generated_cards.sql");
    expect(sql).toMatch(/create table if not exists public\.generated_cards/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/revoke all on public\.generated_cards from public, anon, authenticated;/);
    expect(sql).toMatch(/grant all on public\.generated_cards to service_role;/);
    expect(sql).not.toMatch(/create policy/);
  });

  it("新しい語の行は送られた語（word.meaning_ja など）を直に入れない", () => {
    const src = read("src/lib/stickers.functions.ts");
    const fn = src.slice(
      src.indexOf("export async function upsertWord("),
      src.indexOf("async function ensureUserShelf("),
    );
    expect(fn).not.toMatch(/meaning_ja: word\.meaning_ja/);
    expect(fn).not.toMatch(/extras: \(word\.extras/);
    expect(fn).toMatch(/newSharedWordContent\(supabaseAdmin, userId, word, language\)/);
  });
});

describe("L5: 誤答の作り置きを黙って捨てない", () => {
  it("返事の後まで預ける（void … .catch(() => {}) にしない）", () => {
    const src = read("src/lib/stickers.functions.ts");
    expect(src).not.toMatch(/void pregenerateDistractors\(/);
    expect(src).toMatch(/runAfterResponse\("pregenerateDistractors"/);
  });
});
