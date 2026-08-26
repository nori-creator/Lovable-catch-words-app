import { describe, expect, it } from "vitest";
import { mnemonicRule, hasMnemonicBridge } from "./mnemonic-rule";
import { TARGET_LANGUAGES } from "./target-lang";
import { L1_ORDER } from "./l1";
import { readerL1 } from "./reader-language";
import { UI_LANGS } from "./i18n";

describe("mnemonicRule — 母語の記憶に引っ掛ける", () => {
  it("日本語話者が英語を学ぶとき、カタカナ語と固有名詞に引っ掛ける", () => {
    const r = mnemonicRule("en", "ja", "日本語");
    expect(r).toContain("ドッヂボール");
    expect(r).toContain("リザードン");
    expect(r).toContain("TGI Friday's");
    expect(r).toContain("日本語");
  });

  it("台湾の学習者には**台湾で通じる物**を出す(日本の例を出さない)", () => {
    // 「ドッヂボール」は日本語話者にしか橋にならない。
    const r = mnemonicRule("en", "zh-TW", "繁體中文");
    expect(r).toContain("巧克力");
    expect(r).toContain("寶可夢");
    expect(r).not.toContain("ドッヂボール");
    expect(r).not.toContain("リザードン");
  });

  it("日本語話者が台湾華語を学ぶときは、同じ漢字の**罠**も書かせる", () => {
    // 「手紙」を覚え違えるのは、橋が在るのに警告が無いから。
    const r = mnemonicRule("zh-TW", "ja", "日本語");
    expect(r).toContain("手紙");
    expect(r).toContain("汽車");
  });

  it("英語話者が台湾華語を学ぶときは、英語に入っている中国語由来の語", () => {
    const r = mnemonicRule("zh-TW", "en", "English");
    expect(r).toContain("kung fu");
    expect(r).toContain("typhoon");
  });

  it("**橋を捏造させない**一文がどの組み合わせにも必ず入る", () => {
    // 音が似ているだけの物を無理に結び付けると、間違った意味を一緒に覚える。
    for (const target of TARGET_LANGUAGES) {
      for (const l1 of L1_ORDER) {
        const r = mnemonicRule(target, l1, "日本語");
        expect(r, `${target}/${l1}`).toMatch(/捏造しない|こじつけが過ぎる/);
      }
    }
  });

  it("解説の言語名を必ず書き込む(どの組み合わせでも)", () => {
    for (const target of TARGET_LANGUAGES) {
      for (const l1 of L1_ORDER) {
        expect(mnemonicRule(target, l1, "繁體中文"), `${target}/${l1}`).toContain("繁體中文");
      }
    }
  });

  it("知らない組み合わせでも落ちず、語そのものから作らせる", () => {
    expect(mnemonicRule("en", "en", "English")).toContain("語の形・音・意味");
    expect(mnemonicRule(null, null, "日本語")).toContain("語の形・音・意味");
    expect(mnemonicRule("zh-CN", "ko", "日本語")).toContain("語の形・音・意味");
  });

  it("**実際に起きる組み合わせには必ず橋が在る**", () => {
    // `readerL1` は母語＝学習言語を返さないので、起きるのは
    // 「学習言語 × それ以外の2つ」だけ。そこに穴があると、
    // その人だけ橋の無い覚え方になる。
    for (const target of TARGET_LANGUAGES) {
      for (const ui of UI_LANGS) {
        const l1 = readerL1({ uiLanguage: ui, targetLanguage: target });
        expect(hasMnemonicBridge(target, l1), `${target}/${ui}→${l1}`).toBe(true);
      }
    }
  });
});
