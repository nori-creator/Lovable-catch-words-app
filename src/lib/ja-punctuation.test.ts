import { describe, expect, it } from "vitest";
import { DICT } from "./i18n";
import { checkJaPunctuation, describeIssue } from "./ja-punctuation";

/**
 * 道具そのものの試験。**わざと壊した入力で必ず落ちること**を先に見る。
 * これを書かないと、「何も見つけない検査」と「違反が無い」の区別が付かない
 * (この repo で一度やった間違い — 見つからない場所を撮って緑にしていた)。
 */
describe("和文の約物の検査", () => {
  it("中身が和文だけの半角括弧を見つける", () => {
    const found = checkJaPunctuation("選ぶとすぐ保存されます(下の「保存」は不要)。");
    expect(found).toEqual([{ rule: "paren", found: "(下の「保存」は不要)" }]);
  });

  it("欧文や符号が混じる括弧は見逃す", () => {
    // 全角括弧の中に欧文を入れると左右だけ不自然に空く。半角のままでよい。
    expect(checkJaPunctuation("台湾華語 (zh-TW)")).toEqual([]);
    expect(checkJaPunctuation("いまの級 (TOCFL Level 2)")).toEqual([]);
  });

  it("全角括弧は通す", () => {
    expect(checkJaPunctuation("あなたのステッカー（単語カード・撮影地）")).toEqual([]);
  });

  it("和文の直後の半角の感嘆符・疑問符を見つける", () => {
    expect(checkJaPunctuation("できた!")).toEqual([{ rule: "bang", found: "た!" }]);
    expect(checkJaPunctuation("覚えているかな?")).toEqual([{ rule: "bang", found: "な?" }]);
  });

  it("欧文の直後の半角は通す", () => {
    expect(checkJaPunctuation("OK! Nice?")).toEqual([]);
  });

  it("全角の感嘆符・疑問符は通す", () => {
    expect(checkJaPunctuation("できた！覚えているかな？")).toEqual([]);
  });

  it("数と助数詞の間の空白を見つける", () => {
    expect(checkJaPunctuation("写真が 6 枚")).toEqual([{ rule: "counter", found: "6 枚" }]);
    expect(checkJaPunctuation("6枚")).toEqual([]);
  });

  it("点3つを見つける", () => {
    expect(checkJaPunctuation("保存中...")).toEqual([{ rule: "ellipsis", found: "..." }]);
    expect(checkJaPunctuation("保存中…")).toEqual([]);
  });

  it("1つの文字列に複数在れば全部返す(最初の1件で止まらない)", () => {
    const found = checkJaPunctuation("できた!写真が 6 枚(すごい)...");
    expect(found.map((f) => f.rule).sort()).toEqual(["bang", "counter", "ellipsis", "paren"]);
  });

  it("`g` 付きの正規表現を使い回しても、2回目が抜けない", () => {
    // `lastIndex` を戻し忘れると、同じ文字列の2回目が空で返る。
    const s = "できた!";
    expect(checkJaPunctuation(s)).toEqual(checkJaPunctuation(s));
  });

  it("何も破っていなければ空", () => {
    expect(checkJaPunctuation("今日の復習は12語です。")).toEqual([]);
  });

  it("人が読める一行になる", () => {
    expect(describeIssue("settings.feelInstantHint", { rule: "paren", found: "(不要)" })).toContain(
      "全角",
    );
  });
});

/**
 * 辞書そのもの。**規則は現状を固定する物**であって、方針を変える物ではない。
 * 半角コロンが18件残っているのは前の周に「残す」と決めたからで、
 * 検査もそれを咎めない(`ja-punctuation.ts` の説明を見ること)。
 */
describe("表に出る和文", () => {
  it("決めごとを破っている文字列が1つも無い", () => {
    const bad: string[] = [];
    for (const [key, entry] of Object.entries(DICT)) {
      for (const issue of checkJaPunctuation(entry.ja)) bad.push(describeIssue(key, issue));
    }
    expect(bad).toEqual([]);
  });

  it("そもそも和文が入っている(空の辞書を検査して緑にしない)", () => {
    const values = Object.values(DICT);
    expect(values.length).toBeGreaterThan(500);
    expect(values.filter((v) => /[ぁ-んァ-ヶ一-龥]/.test(v.ja)).length).toBeGreaterThan(400);
  });
});
