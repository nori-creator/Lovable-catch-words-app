import { describe, expect, it } from "vitest";
import { SECTION_IDS, type SectionId } from "./card-sections";
import { CARD_PREF_KEY, DEFAULT_VISIBLE, readCardPrefs, visibleSections } from "./card-prefs";

const ALL = [...SECTION_IDS] as SectionId[];
const store = (m: Record<string, string>) => ({ getItem: (k: string) => m[k] ?? null });

describe("単語の詳細の既定（オーナー指示 2026-09-23: 8項目）", () => {
  it("何も保存していなければ、意味・頻度と場面・例文・チャンク・量詞・関連語・実際の使われ方だけ", () => {
    const v = visibleSections(readCardPrefs(ALL, store({})));
    expect(v).toEqual(ALL.filter((id) => DEFAULT_VISIBLE.includes(id)));
    expect([...v].sort()).toEqual([...DEFAULT_VISIBLE].sort());
    for (const hidden of [
      "etymology",
      "mnemonic",
      "pronunciation_tips",
      "examples_extra",
      "web_images",
      "taiwan_note",
    ]) {
      expect(v).not.toContain(hidden);
    }
  });

  it("前の版で何も隠していなかった人には、新しい既定を当てる（並びは引き継ぐ）", () => {
    const order = [...ALL].reverse();
    const p = readCardPrefs(
      ALL,
      store({ "wordcard-prefs-v4": JSON.stringify({ order, hidden: [] }) }),
    );
    expect(p.order).toEqual(order);
    expect(p.hidden).toContain("etymology");
    expect(p.hidden).not.toContain("meaning");
  });

  it("前の版で自分で隠していた人の選択はそのまま", () => {
    const p = readCardPrefs(
      ALL,
      store({ "wordcard-prefs-v4": JSON.stringify({ order: ALL, hidden: ["example"] }) }),
    );
    expect(p.hidden).toEqual(["example"]);
  });

  it("新しい版に保存された選択（全部見せる、も含む）が優先", () => {
    const p = readCardPrefs(
      ALL,
      store({
        [CARD_PREF_KEY]: JSON.stringify({ order: ALL, hidden: [] }),
        "wordcard-prefs-v4": JSON.stringify({ order: ALL, hidden: ["example"] }),
      }),
    );
    expect(p.hidden).toEqual([]);
  });

  it("壊れた値・知らない名前は既定へ寄せる。足りない節は後ろへ", () => {
    expect(readCardPrefs(ALL, store({ [CARD_PREF_KEY]: "{" })).hidden).toContain("mnemonic");
    const p = readCardPrefs(
      ALL,
      store({ [CARD_PREF_KEY]: JSON.stringify({ order: ["nope", "example"], hidden: ["nope"] }) }),
    );
    expect(p.order[0]).toBe("example");
    expect(p.order).toHaveLength(ALL.length);
    expect(p.hidden).toEqual([]);
  });
});
