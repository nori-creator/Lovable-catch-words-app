import { describe, expect, it } from "vitest";
import { SECTION_IDS, type SectionId } from "./card-sections";
import {
  CARD_PREF_KEY,
  DEFAULT_VISIBLE,
  defaultsFirst,
  readCardPrefs,
  visibleSections,
} from "./card-prefs";

const ALL = [...SECTION_IDS] as SectionId[];
const store = (m: Record<string, string>) => ({ getItem: (k: string) => m[k] ?? null });

describe("単語の詳細の既定（オーナー指示 2026-09-23: 8項目）", () => {
  it("何も保存していなければ、意味・頻度と場面・例文・チャンク・量詞・関連語・実際の使われ方だけ", () => {
    const p0 = readCardPrefs(ALL, store({}));
    const v = visibleSections(p0);
    expect(v).toEqual(ALL.filter((id) => DEFAULT_VISIBLE.includes(id)));
    // 既定で見せる項目が一覧のいちばん上（オーナー指示 2026-09-23）。
    expect(p0.order.slice(0, v.length)).toEqual(v);
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

  it("前の版で何も隠していなかった人には、新しい既定を当てる（既定の項目を上へ寄せて並びは引き継ぐ）", () => {
    const order = [...ALL].reverse();
    const p = readCardPrefs(
      ALL,
      store({ "wordcard-prefs-v4": JSON.stringify({ order, hidden: [] }) }),
    );
    expect(p.order).toEqual(defaultsFirst(order));
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

  it("v5 の並びは既定の項目を上へ寄せて引き継ぐ。隠す／見せるはそのまま", () => {
    const order = [...ALL].reverse();
    const p = readCardPrefs(
      ALL,
      store({ "wordcard-prefs-v5": JSON.stringify({ order, hidden: ["mnemonic"] }) }),
    );
    expect(p.order).toEqual(defaultsFirst(order));
    expect(p.hidden).toEqual(["mnemonic"]);
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
