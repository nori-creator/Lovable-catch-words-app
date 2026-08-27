import { describe, it, expect } from "vitest";
import {
  emptyExtras,
  normalizeExtras,
  hasExtrasContent,
  mergeExtras,
  withoutMeasureWords,
  usableCollocations,
  chunkSpeechText,
  refineUsageChunks,
  MAX_CHUNKS,
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
describe("withoutMeasureWords", () => {
  const mw = [{ word: "一張" }];
  const chunk = (...texts: string[]) => ({
    parts: texts.map((text) => ({ text, pos: "" })),
    ja: "",
  });

  it("量詞と見出し語しか無い型は落とす", () => {
    expect(withoutMeasureWords([chunk("一張", "衛生紙")], mw, "衛生紙")).toEqual([]);
  });

  it("数を落とした素の量詞でも同じ物と見なす", () => {
    expect(withoutMeasureWords([chunk("張", "衛生紙")], mw, "衛生紙")).toEqual([]);
  });

  it("**動詞が付いていても落とす**(量詞が出た時点で重なっている)", () => {
    expect(withoutMeasureWords([chunk("拿", "一張", "衛生紙")], mw, "衛生紙")).toEqual([]);
  });

  it("量詞の一覧に無くても、品詞が M なら落とす", () => {
    const list = [
      {
        parts: [
          { text: "杯", pos: "M" },
          { text: "咖啡", pos: "N" },
        ],
        ja: "",
      },
    ];
    expect(withoutMeasureWords(list, [], "咖啡")).toEqual([]);
  });

  it("量詞と関係ない型はそのまま残る", () => {
    const list = [chunk("用", "衛生紙", "擦")];
    expect(withoutMeasureWords(list, mw, "衛生紙")).toEqual(list);
  });

  it("見出し語がその札の量詞と同じ字でも、型を全部落とさない", () => {
    const list = [chunk("一", "張", "紙")];
    expect(withoutMeasureWords(list, [{ word: "張" }], "張")).toEqual(list);
  });

  it("量詞が無いカードは素通し", () => {
    const list = [chunk("拿", "衛生紙")];
    expect(withoutMeasureWords(list, [], "衛生紙")).toEqual(list);
    expect(withoutMeasureWords(list, null, "衛生紙")).toEqual(list);
  });

  it("空のパーツしか無い型は落とす(描いても何も出ない)", () => {
    expect(withoutMeasureWords([chunk("", " ")], mw, "衛生紙")).toEqual([]);
  });

  it("null / undefined でも落ちない", () => {
    expect(withoutMeasureWords(null, mw, "衛生紙")).toEqual([]);
    expect(withoutMeasureWords(undefined, undefined, "")).toEqual([]);
  });
});

describe("usableCollocations", () => {
  it("文になっている物と長すぎる物を落とす", () => {
    expect(usableCollocations(["喝珍奶", "我今天喝了一杯珍珠奶茶。"], "zh-TW")).toEqual(["喝珍奶"]);
    expect(usableCollocations(["put on socks", "Is it big?"], "en")).toEqual(["put on socks"]);
  });

  it("重複と空白だけを落とし、上限で切る", () => {
    const many = ["a b", "a b", "c d", "e f", "g h", "i j", "k l", "  "];
    expect(usableCollocations(many, "en")).toEqual(["a b", "c d", "e f", "g h", "i j"]);
  });

  it("空でも落ちない", () => {
    expect(usableCollocations(null, "en")).toEqual([]);
    expect(usableCollocations(undefined, "zh-TW")).toEqual([]);
  });
});

describe("chunkSpeechText", () => {
  it("英語は空白で継ぐ(`put onsocks` にしない)", () => {
    const c = {
      parts: [
        { text: "put on", pos: "v" },
        { text: "socks", pos: "n" },
      ],
      ja: "",
    };
    expect(chunkSpeechText(c, "en")).toBe("put on socks");
  });

  it("漢字は継ぎ目を入れない", () => {
    const c = {
      parts: [
        { text: "喝", pos: "V" },
        { text: "珍奶", pos: "N" },
      ],
      ja: "",
    };
    expect(chunkSpeechText(c, "zh-TW")).toBe("喝珍奶");
  });
});

describe("refineUsageChunks", () => {
  const chunk = (...texts: string[]) => ({
    parts: texts.map((text) => ({ text, pos: "N" })),
    ja: "",
  });

  it("**句点の付いた物は文**(オーナー指摘 2026-08-27 ②「文章のようになってる」)", () => {
    expect(refineUsageChunks([chunk("我", "去", "了", "。")], [], "去", "zh-TW")).toEqual([]);
    expect(refineUsageChunks([chunk("Is", "it", "big?")], [], "big", "en")).toEqual([]);
  });

  it("句点が無ければ同じ語数でも残る(文かどうかだけで分けている)", () => {
    expect(refineUsageChunks([chunk("我", "去", "了")], [], "去", "zh-TW")).toHaveLength(1);
  });

  it("長すぎる型を落とす(例文になってしまう)", () => {
    const short = chunk("帶", "雨傘");
    const long = chunk("今天", "下雨", "所以", "我帶了雨傘");
    expect(refineUsageChunks([short, long], [], "雨傘")).toEqual([short]);
  });

  it("パーツが多すぎる型を落とす", () => {
    const many = chunk("我", "今天", "早上", "帶了", "雨傘");
    expect(refineUsageChunks([many], [], "雨傘")).toEqual([]);
  });

  it("見出し語しか無い型を落とす(その語を見れば分かる)", () => {
    expect(refineUsageChunks([chunk("雨傘")], [], "雨傘")).toEqual([]);
  });

  it("同じ文字列の型は1つだけ残す", () => {
    const a = { ...chunk("帶", "雨傘"), ja: "傘を持つ" };
    const b = { ...chunk("帶", "雨傘"), ja: "かさを持参する" };
    expect(refineUsageChunks([a, b], [], "雨傘")).toEqual([a]);
  });

  it(`${MAX_CHUNKS}個で切る(生成側は頻度の高い順に並べるので後ろから)`, () => {
    const many = Array.from({ length: 12 }, (_, i) => chunk(`用${i}`, "雨傘"));
    const got = refineUsageChunks(many, [], "雨傘");
    expect(got).toHaveLength(MAX_CHUNKS);
    expect(got[0]).toEqual(many[0]);
  });

  it("量詞と丸ごと重なる型は今までどおり落ちる", () => {
    const echo = chunk("一把", "雨傘");
    const real = chunk("帶", "雨傘");
    expect(refineUsageChunks([echo, real], [{ word: "一把" }], "雨傘")).toEqual([real]);
  });

  it("空・null で落ちない", () => {
    expect(refineUsageChunks(null, null, "雨傘")).toEqual([]);
    expect(refineUsageChunks([], [], "雨傘")).toEqual([]);
    expect(refineUsageChunks([chunk("")], [], "雨傘")).toEqual([]);
  });

  /**
   * オーナー報告 2026-08-26（3度目）:
   * > 「単語のチャンク型の項目が生成されてない。」
   *
   * 生成はされていた。**8文字の物差しを英語に当てて、全部こちらが
   * 落としていた。** 届いた絵の `socks` に「使い方」の欄が無いのがそれ。
   */
  describe("refineUsageChunks — 英語の型を落とさない", () => {
    const en = (...words: string[]) => ({
      parts: words.map((text) => ({ text, pos: "" })),
      ja: "",
    });

    it("**`put on socks` が通る**（8文字の物差しなら落ちていた）", () => {
      const c = en("put on", "socks");
      expect(refineUsageChunks([c], [], "socks", "en")).toEqual([c]);
    });

    it("台湾華語の目盛りでは同じ型が落ちる（＝これが報告の中身）", () => {
      expect(refineUsageChunks([en("put on", "socks")], [], "socks", "zh-TW")).toEqual([]);
      // **学習言語を渡し忘れても同じ穴に落ちる。** 呼び出し側が渡すこと。
      expect(refineUsageChunks([en("put on", "socks")], [], "socks")).toEqual([]);
    });

    it("`a pair of socks` のような冠詞つきの型も通る", () => {
      const c = en("a", "pair of", "socks");
      expect(refineUsageChunks([c], [], "socks", "en")).toEqual([c]);
    });

    it("**長すぎる英語の型は落とす**（型ではなく文になっている）", () => {
      // 5語。`MAX_CHUNK_WORDS_EN` は 4。
      expect(refineUsageChunks([en("I", "need", "to", "buy", "socks")], [], "socks", "en")).toEqual(
        [],
      );
    });

    it("見出し語だけの型は英語でも落とす", () => {
      expect(refineUsageChunks([en("socks")], [], "socks", "en")).toEqual([]);
    });

    it("同じ型は英語でも1つに畳む（継ぎ目の違いで二重に数えない）", () => {
      const a = en("wear", "socks");
      const b = en("wear", "socks");
      expect(refineUsageChunks([a, b], [], "socks", "en")).toEqual([a]);
    });

    it("台湾華語の型は今までどおり（**この直しで1つも変わらない**）", () => {
      const short = {
        parts: ["帶", "雨傘"].map((text) => ({ text, pos: "N" })),
        ja: "",
      };
      expect(refineUsageChunks([short], [], "雨傘", "zh-TW")).toEqual([short]);
      expect(refineUsageChunks([short], [], "雨傘")).toEqual([short]);
    });
  });
});
