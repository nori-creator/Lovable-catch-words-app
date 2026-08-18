import { describe, expect, it } from "vitest";
import { splitParagraphs, splitSpans, toProse } from "./prose";

describe("splitParagraphs", () => {
  it("1文なら分けない", () => {
    expect(splitParagraphs("台湾では中秋節に焼肉をします。")).toEqual([
      "台湾では中秋節に焼肉をします。",
    ]);
  });

  it("複数の文を段落に分ける", () => {
    // オーナーのスクリーンショットに写っていた「台湾メモ」そのもの。
    const src =
      "台湾では中秋節に焼肉をし、デザートとしてブンタンを食べるのが定番です。" +
      "ブンタンの皮を帽子のようにして子供にかぶせる遊びも台湾の秋の風物詩です。";
    expect(splitParagraphs(src)).toHaveLength(2);
  });

  it("句点を落とさない", () => {
    const parts = splitParagraphs("あ。い。");
    expect(parts).toEqual(["あ。", "い。"]);
    expect(parts.join("")).toBe("あ。い。");
  });

  it("閉じ括弧は前の文に付ける(行頭に落とさない)", () => {
    expect(splitParagraphs("彼は「行く。」と言った。")).toEqual(["彼は「行く。」", "と言った。"]);
  });

  it("句点で終わらない文も落とさない", () => {
    expect(splitParagraphs("あ。いうえお")).toEqual(["あ。", "いうえお"]);
  });

  it.each(["", "   ", "\n"])("中身が無ければ空(%s)", (s) => {
    expect(splitParagraphs(s)).toEqual([]);
  });

  it("元の文字を1つも落とさない", () => {
    const src = "「文旦」の「文(wén)」は鼻音です。舌先を歯茎につけます。";
    expect(splitParagraphs(src).join("")).toBe(src);
  });
});

describe("splitSpans", () => {
  // 解説には「日本語の『ちん』より」のように**母語を引用する**書き方が出る。
  // 中身を見ずに印を付けていたので、かなに中国語の体裁を着せていた。
  it.each(["ちん", "タピオカ", "けしごむ", "pencil"])(
    "学ぶ言語でない「%s」は印にしない(括弧ごと素の文字で残す)",
    (inner) => {
      expect(splitSpans(`日本語の「${inner}」より`)).toEqual([
        { kind: "text", text: "日本語の" },
        { kind: "text", text: `「${inner}」` },
        { kind: "text", text: "より" },
      ]);
    },
  );

  it("「」の中を語として切り出す", () => {
    expect(splitSpans("「文旦」は果物です")).toEqual([
      { kind: "term", text: "文旦" },
      { kind: "text", text: "は果物です" },
    ]);
  });

  it("括弧の中の読みを切り出す(全角・半角どちらも)", () => {
    expect(splitSpans("文(wén)")).toEqual([
      { kind: "text", text: "文" },
      { kind: "reading", text: "wén" },
    ]);
    expect(splitSpans("旦（dàn）")).toEqual([
      { kind: "text", text: "旦" },
      { kind: "reading", text: "dàn" },
    ]);
  });

  it("和文の括弧は読みにしない(注釈をピンイン扱いしない)", () => {
    expect(splitSpans("文旦(果物)")).toEqual([{ kind: "text", text: "文旦(果物)" }]);
  });

  it("空の「」は印にしない", () => {
    expect(splitSpans("「」だけ")).toEqual([
      { kind: "text", text: "「」" },
      { kind: "text", text: "だけ" },
    ]);
  });

  // **不変条件は「中身の文字を落とさない」。** 印の記号(「」())は
  // 飾りなので置き場所が変わってよいが、語や読みそのものが消えてはいけない。
  it.each([
    "「文旦」の「文(wén)」は鼻音",
    "日本語の「ちん」より息を強く",
    "「奶(nǎi)」は三声なので、一度下げる",
    "文旦(果物)は台湾の秋の味",
  ])("中身の文字を落とさない(%s)", (src) => {
    const joined = splitSpans(src)
      .map((s) => s.text)
      .join("");
    const strip = (x: string) => x.replace(/[「」（）()]/g, "");
    expect(strip(joined)).toBe(strip(src));
  });

  it("語のうしろの読みは、語と分けて取り出す(印の付き方を揃える)", () => {
    // 「珍珠奶茶」には印が付くのに「珍(zhēn)」には付かない、が起きていた。
    expect(splitSpans("「珍(zhēn)」は一声")).toEqual([
      { kind: "term", text: "珍" },
      { kind: "reading", text: "zhēn" },
      { kind: "text", text: "は一声" },
    ]);
  });
});

describe("toProse", () => {
  it("段落に分けてから印を付ける", () => {
    const out = toProse("「文旦」は果物です。とても甘いです。");
    expect(out).toHaveLength(2);
    expect(out[0][0]).toEqual({ kind: "term", text: "文旦" });
  });
});
