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

  it("元の文字を落とさない(印の記号ぶんを除いて)", () => {
    const src = "「文旦」の「文(wén)」は鼻音";
    const joined = splitSpans(src)
      .map((s) =>
        s.kind === "text" ? s.text : s.kind === "term" ? `「${s.text}」` : `(${s.text})`,
      )
      .join("");
    expect(joined).toBe(src);
  });
});

describe("toProse", () => {
  it("段落に分けてから印を付ける", () => {
    const out = toProse("「文旦」は果物です。とても甘いです。");
    expect(out).toHaveLength(2);
    expect(out[0][0]).toEqual({ kind: "term", text: "文旦" });
  });
});
