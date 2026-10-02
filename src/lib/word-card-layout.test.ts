import { describe, expect, it } from "vitest";
import fs from "node:fs";

const read = (rel: string) => fs.readFileSync(`src/${rel}`, "utf8");

/**
 * オーナー指示 2026-10-02「英語の単語の見出しのなかの配置がバランス悪い。整理して。
 * 単語、品詞、発音ボタン。報告ボタンは一番下の削除の横に配置して」。
 */
describe("単語の見出しと報告の置き場所", () => {
  it("単語の詳細では、報告は一番下の削除の横（WordCard が `reportSlot` へ描く）", () => {
    const sheet = read("components/StickerSheet.tsx");
    expect(sheet).toMatch(/reportSlot=\{reportSlot\}/);
    expect(sheet).toMatch(/<span ref=\{setReportSlot\} className="flex" \/>/);
    // 箱は削除のボタンと同じ行（`handleDelete` の直前）にある。
    const slot = sheet.indexOf("<span ref={setReportSlot}");
    expect(slot).toBeGreaterThan(0);
    expect(sheet.indexOf("onClick={handleDelete}", slot)).toBeGreaterThan(slot);
  });

  it("箱が渡された時は見出しに報告を出さない（2つ並べない）", () => {
    const card = read("components/WordCard.tsx");
    expect(card).toMatch(/reportItems=\{reportSlot \? \[\] : reportItemsFor\(shown\)\}/);
    expect(card).toMatch(/createPortal\(/);
    // 光らせる項目はカードの箱から探す（報告がカードの外に描かれても見つかる）。
    expect(card).toMatch(/const cardEl = \(\) => cardRef\?\.current \?\?/);
  });

  it("発音ボタンは右で縦の真ん中、語・読み・品詞は左に積む", () => {
    const card = read("components/WordCard.tsx");
    const head = card.slice(
      card.indexOf("function HeaderRow("),
      card.indexOf("function ReportButton("),
    );
    expect(head).toMatch(
      /<div className="flex items-center gap-3">\s*<div className="min-w-0 flex-1">/,
    );
    // 発音ボタンは左の積み（min-w-0 flex-1）の**後**に置く。
    expect(head.indexOf("<PronounceButton")).toBeGreaterThan(
      head.indexOf("posDisplay(word.part_of_speech)"),
    );
  });
});
