import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { targetProfile } from "./target-profile";
import { TARGET_LANGUAGES } from "./target-lang";

/**
 * **学習言語・表示言語が「途中で捨てられていないか」を数える門。**
 *
 * この作業場で何度も起きているのは、同じ判断が2箇所に書かれて片方だけ
 * 直る事故。言語の設定はその最悪の例で、オーナー報告の
 * 「表示言語=台湾華語 / 学習言語=英語 にしても台湾華語の単語しか出ない」
 * は、**4つの別々の場所**が原因だった:
 *
 *  A. `setTargetLang` を呼ぶのが設定画面だけで、設定を開かない人には
 *     学習言語が届かない
 *  B. 撮った札の級・品詞が `"TOCFL-2"` / `"名詞"` の決め打ち
 *  C. 表示言語が3つあるのに `en ? "英語" : "日本語"` の2分岐
 *  D. AI に渡す JSON の見本が `"headword":"繁体字"` のまま
 *
 * どれも型では捕まらない(全部ただの文字列)。だから**本文を読んで数える**。
 * 絵の検査は10分以上かかるので、ここは秒で落ちる側に置く。
 */

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

/**
 * 注釈を落とした本文。**「昔こう書いていた」と説明する注釈で門が落ちる**
 * のは偽の警報で、偽の警報を出す門は必ず無視されるようになる。
 * 見るのは実際に走る行だけ。
 */
const codeOnly = (src: string) =>
  src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
    })
    .join("\n");

describe("A. 学習言語がアプリ全体に届く", () => {
  it("AppShell が言語の設定を端末に写す", () => {
    // **全画面の親でやる**のが要点。設定画面だけの責任にすると、
    // 設定を一度も開かない人には学習言語がいつまでも届かない。
    //
    // 見るのは**呼び出し**であって import ではない。最初はここを
    // `toContain("useLanguagePrefsSync")` で書いていて、本体を潰しても
    // import の行に当たって**門が黙って通った**(この作業場で3度目の同じ事故)。
    const shell = codeOnly(read("components/AppShell.tsx"));
    const body = shell.replace(/^import .*$/gm, "");
    expect(body).toMatch(/useLanguagePrefsSync\(\s*\)/);
  });

  it("写す側は学習言語と表示言語の**両方**を書く", () => {
    const sync = read("lib/use-language-prefs.ts");
    expect(sync).toContain("setTargetLang");
    expect(sync).toContain("setUiLang");
    expect(sync).toContain("target_language");
    expect(sync).toContain("ui_language");
  });
});

describe("B. 撮った札の級・品詞を決め打たない", () => {
  const captureSheets = ["components/InputCatchSheet.tsx", "components/ScanCatchSheet.tsx"];

  it.each(captureSheets)("%s に台湾華語の級が直接書かれていない", (file) => {
    // 注釈の中で「昔こう書いていた」と説明するのは許す。
    const code = codeOnly(read(file));
    expect(code).not.toContain("TOCFL-");
    expect(code).not.toContain('"名詞"');
    expect(code).not.toContain('"フレーズ"');
  });

  it.each(captureSheets)("%s は学習言語の目盛りから級を作る", (file) => {
    const src = read(file);
    expect(src).toContain("targetProfile(targetLanguage)");
    expect(src).toContain("levels.toStored(");
  });

  it("目標の級が空のときの既定も学習言語から作る", () => {
    const src = read("lib/ai-provider.server.ts");
    expect(src).toContain("defaultLevelGoal");
    // 決め打ちの "TOCFL-2" が**返り値として**残っていないこと。
    expect(src).not.toMatch(/return\s+"TOCFL-2"/);
  });

  it("2つの言語で違う級が出る(同じ物を返していない)", () => {
    const zh = targetProfile("zh-TW").levels.toStored(2);
    const en = targetProfile("en").levels.toStored(2);
    expect(zh).toBe("TOCFL-2");
    expect(en).toBe("A2");
    expect(zh).not.toBe(en);
  });
});

describe("C. 表示言語を2つに潰さない", () => {
  it("ai.functions.ts に `en ? … : 日本語` の2分岐が無い", () => {
    // これが在ると繁體中文が「日本語」に落ちる。
    expect(codeOnly(read("lib/ai.functions.ts"))).not.toMatch(/explainLang\s*===\s*"en"\s*\?/);
  });

  it("解説の言語名は必ず `explanationLanguageName` から取る", () => {
    const src = read("lib/ai.functions.ts");
    const nlAssignments = codeOnly(src).match(/const NL = .*/g) ?? [];
    expect(nlAssignments.length).toBeGreaterThan(0);
    for (const line of nlAssignments) {
      expect(line).toContain("explanationLanguageName(");
    }
  });
});

describe("D. AI に渡す見本を学習言語から作る", () => {
  it("写真の候補の JSON 見本に「繁体字」が直接書かれていない", () => {
    // **見本は指示より強い。** 本文で「英語の語を出せ」と書いても、
    // 最後の見本が `"headword":"繁体字"` なら AI はそちらに従う。
    const src = read("lib/ai.functions.ts");
    expect(codeOnly(src)).not.toContain('"headword":"繁体字"');
    expect(src).toContain("capture.jsonHeadwordHint");
    expect(src).toContain("capture.jsonReadingHint");
  });

  it("見本は言語ごとに実際に違う", () => {
    const zh = targetProfile("zh-TW").capture;
    const en = targetProfile("en").capture;
    expect(zh.jsonHeadwordHint).not.toBe(en.jsonHeadwordHint);
    expect(zh.jsonReadingHint).not.toBe(en.jsonReadingHint);
    expect(zh.namingExamples).not.toBe(en.namingExamples);
    expect(zh.defaultPos).not.toBe(en.defaultPos);
    // 英語の読みの欄は**空**でなければならない — 注音を埋めさせない。
    expect(en.jsonReadingHint).toContain('"reading_zhuyin":""');
    expect(en.jsonReadingHint).toContain('"pinyin":""');
  });

  it("どの学習言語にも見本が揃っている(足し忘れで空文字にならない)", () => {
    for (const lang of TARGET_LANGUAGES) {
      const c = targetProfile(lang).capture;
      expect(c.jsonHeadwordHint.trim(), lang).not.toBe("");
      expect(c.jsonReadingHint.trim(), lang).not.toBe("");
      expect(c.namingExamples.trim(), lang).not.toBe("");
      expect(c.defaultPos.trim(), lang).not.toBe("");
      expect(c.phrasePos.trim(), lang).not.toBe("");
    }
  });

  it("台湾華語の例が英語の欄に紛れていない", () => {
    // 表を足すときに片方をコピーして直し忘れる事故を潰す。
    // 指示の**地の文**は解説用の日本語なので漢字が在ってよい。見るのは
    // 「（…）」の中に並べた**語の例**だけ — そこに漢字が出たら、
    // 英語の欄に台湾華語の例が残っている。
    const en = targetProfile("en").capture;
    const examples = [...en.namingExamples.matchAll(/（([^）]*)）/g)].map((m) => m[1]);
    expect(examples.length).toBeGreaterThan(0);
    for (const ex of examples) expect(ex, ex).not.toMatch(/[\u4e00-\u9fff]/);
    expect(en.jsonHeadwordHint).not.toMatch(/[\u4e00-\u9fff]/);
    // 逆向きも見る — 台湾華語の欄に英語だけの例に差し替わっていないこと。
    const zhExamples = [
      ...targetProfile("zh-TW").capture.namingExamples.matchAll(/（([^）]*)）/g),
    ].map((m) => m[1]);
    expect(zhExamples.length).toBeGreaterThan(0);
    for (const ex of zhExamples) expect(ex, ex).toMatch(/[\u4e00-\u9fff]/);
  });
});

describe("復習の「終わり」を数から決める", () => {
  it("サーバは残り枚数を返す", () => {
    const src = read("lib/reviews.functions.ts");
    expect(src).toContain("dueRemaining");
    expect(src).toContain("batchEndKind");
  });

  it("画面は自分で判断せず `batchEndKind` を読む", () => {
    const src = read("routes/_authenticated/review.tsx");
    expect(src).toContain("batchEndKind(");
    // 「今日は終わり」の文面を**無条件では出さない**。
    expect(src).toContain('kind === "more"');
    expect(src).toContain("review.moreTitle");
  });
});
