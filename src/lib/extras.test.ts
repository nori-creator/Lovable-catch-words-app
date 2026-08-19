import { describe, it, expect } from "vitest";
import {
  emptyExtras,
  normalizeExtras,
  hasExtrasContent,
  mergeExtras,
  withoutMeasureWordEcho,
} from "./extras";

/**
 * 単語カードの「中身」(用例・関連語・台湾での言い方…)の正規化と合流。
 *
 * ## なぜここを守るか
 * このアプリで**同じ不具合を何度も踏んだ**のがここ。
 * 「キャッチした語の解説が全部消える」「単語詳細のセクションがまた出ない」
 * — どちらも、後から届いた空の extras が保存済みの中身を上書きしたのが原因。
 *
 * 空で上書きしない、という規則さえ守られていれば起きない。だから規則を
 * 文章ではなくテストに置く。
 */

describe("normalizeExtras", () => {
  it("オブジェクトでないものは null", () => {
    expect(normalizeExtras(null)).toBeNull();
    expect(normalizeExtras(undefined)).toBeNull();
    expect(normalizeExtras("なにか")).toBeNull();
    expect(normalizeExtras(42)).toBeNull();
  });

  it("空のオブジェクトは「空だが有効」として通す", () => {
    expect(normalizeExtras({})).not.toBeNull();
  });

  it("知らない鍵が混ざっていても落とさない", () => {
    // AIの出力は形が揺れる。1つ余計な鍵があっただけで解説が丸ごと
    // 消えるのでは、あまりに脆い。
    const e = normalizeExtras({ collocations: ["喝咖啡"], 未知の鍵: 1 });
    expect(e).not.toBeNull();
    expect(e?.collocations).toEqual(["喝咖啡"]);
  });
});

describe("hasExtrasContent", () => {
  it("null と空は「中身なし」", () => {
    expect(hasExtrasContent(null)).toBe(false);
    expect(hasExtrasContent(undefined)).toBe(false);
    expect(hasExtrasContent(emptyExtras())).toBe(false);
  });

  it("配列が1つでも埋まっていれば「中身あり」", () => {
    expect(hasExtrasContent({ collocations: ["喝咖啡"] })).toBe(true);
  });

  it("空白だけの文字列は中身とみなさない", () => {
    expect(hasExtrasContent({ taiwan_note: "   " })).toBe(false);
    expect(hasExtrasContent({ taiwan_note: "台湾ではこう言う" })).toBe(true);
  });

  it("explain_lang / explain_l1 は中身に数えない", () => {
    // これは「何語で書かれた解説か」の目印であって、解説そのものではない。
    // 数えてしまうと、目印だけ入った空の extras が「中身あり」になり、
    // 保存済みの本物を上書きしてしまう。
    expect(hasExtrasContent({ explain_lang: "ja", explain_l1: "ja" })).toBe(false);
  });
});

describe("mergeExtras", () => {
  it("空の側で埋まっている側を消さない", () => {
    // これがこのファイルの本題。何度も踏んだ不具合そのもの。
    const saved = { collocations: ["喝咖啡"], taiwan_note: "台湾ではこう言う" };
    const merged = mergeExtras(saved, { collocations: [], taiwan_note: "" });
    expect(merged.collocations).toEqual(["喝咖啡"]);
    expect(merged.taiwan_note).toBe("台湾ではこう言う");
  });

  it("新しく届いた中身は古いものに勝つ", () => {
    const merged = mergeExtras({ collocations: ["古い"] }, { collocations: ["新しい"] });
    expect(merged.collocations).toEqual(["新しい"]);
  });

  it("保存済みが空でも、届いた中身はちゃんと入る", () => {
    const merged = mergeExtras(null, { collocations: ["喝咖啡"] });
    expect(merged.collocations).toEqual(["喝咖啡"]);
  });

  it("両方 null でも落ちず、空の形を返す", () => {
    expect(hasExtrasContent(mergeExtras(null, null))).toBe(false);
  });

  it("元のオブジェクトを書き換えない", () => {
    const saved = { collocations: ["喝咖啡"] };
    const before = JSON.stringify(saved);
    mergeExtras(saved, { collocations: ["新しい"] });
    expect(JSON.stringify(saved)).toBe(before);
  });
});

/**
 * 量詞は「量詞」の欄で読む。「使い方」で同じ物をもう一度読ませない。
 * ただし量詞の型そのものを禁じると、使い方が動詞と目的語だけに戻る。
 * その線引きをここに置く。
 */
describe("withoutMeasureWordEcho", () => {
  const mw = [{ word: "一張" }];
  const chunk = (...texts: string[]) => ({
    parts: texts.map((text) => ({ text, pos: "" })),
    ja: "",
  });

  it("量詞と見出し語しか無い型は落とす", () => {
    const out = withoutMeasureWordEcho([chunk("一張", "衛生紙")], mw, "衛生紙");
    expect(out).toEqual([]);
  });

  it("数を落とした素の量詞でも同じ物と見なす", () => {
    const out = withoutMeasureWordEcho([chunk("張", "衛生紙")], mw, "衛生紙");
    expect(out).toEqual([]);
  });

  it("動詞が付いた型は残す", () => {
    const out = withoutMeasureWordEcho([chunk("拿", "一張", "衛生紙")], mw, "衛生紙");
    expect(out).toHaveLength(1);
  });

  it("量詞と関係ない型はそのまま残る", () => {
    const list = [chunk("用", "衛生紙", "擦")];
    expect(withoutMeasureWordEcho(list, mw, "衛生紙")).toEqual(list);
  });

  it("量詞が無いカードは素通し", () => {
    const list = [chunk("一張", "衛生紙")];
    expect(withoutMeasureWordEcho(list, [], "衛生紙")).toEqual(list);
    expect(withoutMeasureWordEcho(list, null, "衛生紙")).toEqual(list);
  });

  it("空のパーツしか無い型は落とす(描いても何も出ない)", () => {
    expect(withoutMeasureWordEcho([chunk("", " ")], mw, "衛生紙")).toEqual([]);
  });

  it("null / undefined でも落ちない", () => {
    expect(withoutMeasureWordEcho(null, mw, "衛生紙")).toEqual([]);
    expect(withoutMeasureWordEcho(undefined, undefined, "")).toEqual([]);
  });
});
