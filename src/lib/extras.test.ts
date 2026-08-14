import { describe, it, expect } from "vitest";
import { emptyExtras, normalizeExtras, hasExtrasContent, mergeExtras } from "./extras";

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
