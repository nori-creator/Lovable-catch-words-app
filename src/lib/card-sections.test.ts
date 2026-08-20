import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { REGEN_SECTIONS, SECTION_IDS, isRegenSection, type SectionId } from "./card-sections";

/**
 * ここで見ているのは「2箇所に書かれた同じ物が食い違わないこと」。
 * 食い違っても**型でもビルドでも落ちない**種類の穴なので、
 * 一致そのものを試験にする。
 */
describe("節の一覧", () => {
  it("重複が無い", () => {
    expect(new Set(SECTION_IDS).size).toBe(SECTION_IDS.length);
    expect(new Set(REGEN_SECTIONS).size).toBe(REGEN_SECTIONS.length);
  });

  it("作り直せる節は、必ず節の一覧に在る", () => {
    for (const id of REGEN_SECTIONS) {
      expect(SECTION_IDS).toContain(id);
    }
  });

  it("外部リンク系は作り直せない(生成物ではない)", () => {
    expect(isRegenSection("web_images")).toBe(false);
    expect(isRegenSection("real_usage")).toBe(false);
  });

  it("解説の節は作り直せる(押せるのに弾かれる状態にしない)", () => {
    expect(isRegenSection("usage_chunks")).toBe(true);
  });

  // 「ひと目でわかる」の表は 2026-08-20 にオーナー指示で丸ごと外した。
  // 節が消えたのに生成の指示だけ残ると、**誰も見ない物を毎回作って払う**。
  it("外した節は一覧に残っていない", () => {
    expect(SECTION_IDS).not.toContain("quick_facts" as SectionId);
  });
});

describe("画面の既定の並び", () => {
  const src = fs.readFileSync("src/components/WordCard.tsx", "utf8");
  const ordered = [...src.matchAll(/\{ id: "([\w_]+)" \}/g)].map((m) => m[1] as SectionId);

  it("並びに出てくる節は、全部一覧に在る", () => {
    expect(ordered.length).toBeGreaterThan(0);
    for (const id of ordered) expect(SECTION_IDS).toContain(id);
  });

  // 節を足したのに並びへ入れ忘れると、**その節は画面に一度も出ない**。
  // エラーは出ないので、目でも気づけない。
  it("一覧の節は、全部並びに入っている", () => {
    for (const id of SECTION_IDS) expect(ordered).toContain(id);
  });
});

describe("見出しの文言", () => {
  const dict = fs.readFileSync("src/lib/i18n.tsx", "utf8");

  // 未定義の鍵は t() が**鍵の名前をそのまま返す**ので、
  // 画面に "card.usage_chunks" と出る。赤くもならない。
  it.each([...SECTION_IDS])("card.%s の文言が定義されている", (id) => {
    expect(dict).toContain(`"card.${id}"`);
  });
});
