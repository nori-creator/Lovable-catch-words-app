import { describe, it, expect } from "vitest";
import {
  EN_PROFILE,
  ZH_TW_PROFILE,
  defaultReading,
  hasSection,
  targetProfile,
  type ProfileSection,
} from "./target-profile";
import { SECTION_IDS } from "./card-sections";
import { DEFAULT_TARGET_LANGUAGE } from "./target-lang";
import fs from "node:fs";
import path from "node:path";

/**
 * 学習言語ごとの違いを1つの表に集めた所の門。
 *
 * オーナー指示「アプリ内の**すべての項目**について…**他にあるはず**」。
 * ここで一番怖いのは**取りこぼし** — 英語版の画面に量詞の欄が出ても、
 * 型でもビルドでも落ちない。数えて押さえる。
 */

describe("targetProfile", () => {
  it("学習言語からプロフィールを引く", () => {
    expect(targetProfile("zh-TW").code).toBe("zh-TW");
  });

  it("**知らない値は既定に落とす**(項目が1つも無いカードを作らない)", () => {
    for (const bad of [null, undefined, "", "  ", "kl-KL", "xx"]) {
      const p = targetProfile(bad);
      expect(p.code).toBe(DEFAULT_TARGET_LANGUAGE);
      expect(p.sections.length).toBeGreaterThan(0);
      expect(p.speechLang).toBeTruthy();
    }
  });
});

describe("どちらの言語も形が揃っている", () => {
  const all = [ZH_TW_PROFILE, EN_PROFILE];

  it("**空の欄を持たない**(画面が空文字で喋らない)", () => {
    for (const p of all) {
      expect(p.code).toBeTruthy();
      expect(p.speechLang).toBeTruthy();
      expect(p.scriptLang).toBeTruthy();
      expect(p.readings.length).toBeGreaterThan(0);
      expect(p.sections.length).toBeGreaterThan(0);
      expect(p.chunkRoles.length).toBeGreaterThan(0);
      expect(p.levels.labels).toHaveLength(6);
    }
  });

  it("項目に重複が無い(同じ欄が2回出ない)", () => {
    for (const p of all) {
      expect(new Set(p.sections).size).toBe(p.sections.length);
    }
  });

  it("読みの表記に重複が無い", () => {
    for (const p of all) {
      expect(new Set(p.readings).size).toBe(p.readings.length);
    }
  });

  it("**どちらにも意味と例文がある**(これが無いとカードにならない)", () => {
    for (const p of all) {
      expect(hasSection(p, "meaning")).toBe(true);
      expect(hasSection(p, "example")).toBe(true);
    }
  });
});

describe("言語で違う項目 — オーナー指摘の本体", () => {
  it("**量詞は台湾華語だけ**(英語に量詞は無い)", () => {
    expect(hasSection(ZH_TW_PROFILE, "measure_words")).toBe(true);
    expect(hasSection(EN_PROFILE, "measure_words")).toBe(false);
  });

  it("**活用は英語だけ**(中国語は語形が変わらない)", () => {
    expect(hasSection(EN_PROFILE, "forms")).toBe(true);
    expect(hasSection(ZH_TW_PROFILE, "forms")).toBe(false);
  });

  it("**冠詞・可算は英語だけ**(中国語に冠詞が無い＝最大の誤り)", () => {
    expect(hasSection(EN_PROFILE, "countability")).toBe(true);
    expect(hasSection(ZH_TW_PROFILE, "countability")).toBe(false);
  });

  it("**強勢は英語だけ**(通じるかどうかを最も左右する)", () => {
    expect(hasSection(EN_PROFILE, "stress")).toBe(true);
    expect(hasSection(ZH_TW_PROFILE, "stress")).toBe(false);
  });

  it("句動詞は英語だけ", () => {
    expect(hasSection(EN_PROFILE, "phrasal_verbs")).toBe(true);
    expect(hasSection(ZH_TW_PROFILE, "phrasal_verbs")).toBe(false);
  });

  it("**文化の一言は名前ごと入れ替える**(台湾メモ → culture_note)", () => {
    expect(hasSection(ZH_TW_PROFILE, "taiwan_note")).toBe(true);
    expect(hasSection(EN_PROFILE, "taiwan_note")).toBe(false);
    expect(hasSection(EN_PROFILE, "culture_note")).toBe(true);
    expect(hasSection(ZH_TW_PROFILE, "culture_note")).toBe(false);
  });

  it("読みの表記が入れ替わる(注音/拼音 ↔ 米/英のIPA)", () => {
    expect(defaultReading(ZH_TW_PROFILE)).toBe("zhuyin");
    // オーナー決定 2026-08-24「アメリカ英語を既定」。
    expect(defaultReading(EN_PROFILE)).toBe("ipa-us");
  });

  it("級の体系が入れ替わる", () => {
    expect(ZH_TW_PROFILE.levels.id).toBe("TOCFL");
    expect(EN_PROFILE.levels.id).toBe("CEFR");
  });

  it("チャンクの役割が入れ替わる(量詞 ↔ 冠詞)", () => {
    expect(ZH_TW_PROFILE.chunkRoles).toContain("M");
    expect(EN_PROFILE.chunkRoles).toContain("Det");
    expect(EN_PROFILE.chunkRoles).not.toContain("M");
  });

  it("読み上げの言語が入れ替わる", () => {
    expect(ZH_TW_PROFILE.speechLang).toBe("zh-TW");
    expect(EN_PROFILE.speechLang).toBe("en-US");
  });
});

describe("headwordOk — 母語のまま図鑑に入れない", () => {
  it("台湾華語は漢字だけ通す", () => {
    expect(ZH_TW_PROFILE.headwordOk("腳踏車")).toBe(true);
    expect(ZH_TW_PROFILE.headwordOk("文旦")).toBe(true);
  });

  it("**かなや欧文が混ざる物は通さない**(「シャーペン」が図鑑に入った前例)", () => {
    expect(ZH_TW_PROFILE.headwordOk("シャーペン")).toBe(false);
    expect(ZH_TW_PROFILE.headwordOk("けしごむ")).toBe(false);
    expect(ZH_TW_PROFILE.headwordOk("pencil")).toBe(false);
    expect(ZH_TW_PROFILE.headwordOk("シャーペンpen")).toBe(false);
  });

  it("英語はラテン文字を通す", () => {
    expect(EN_PROFILE.headwordOk("bicycle")).toBe(true);
    expect(EN_PROFILE.headwordOk("night market")).toBe(true);
  });

  it("**英語版に漢字やかなを通さない**(同じ間違いの裏返し)", () => {
    expect(EN_PROFILE.headwordOk("腳踏車")).toBe(false);
    expect(EN_PROFILE.headwordOk("じてんしゃ")).toBe(false);
  });

  it("空・記号だけはどちらも通さない", () => {
    for (const p of [ZH_TW_PROFILE, EN_PROFILE]) {
      expect(p.headwordOk("")).toBe(false);
      expect(p.headwordOk("   ")).toBe(false);
      expect(p.headwordOk("、。！")).toBe(false);
    }
  });
});

describe("いまの画面と食い違っていない", () => {
  it("**台湾華語の項目は `card-sections.ts` の並びと同じ**", () => {
    // ここがずれると、プロフィールに在るのに描けない項目(または逆)が出る。
    // 第2段の約束は「見た目を変えない」なので、いまは完全一致でなければならない。
    expect([...ZH_TW_PROFILE.sections]).toEqual([...SECTION_IDS]);
  });

  it("英語だけの項目は、まだ `card-sections.ts` に無い(第4段で足す)", () => {
    const enOnly: ProfileSection[] = [
      "forms",
      "countability",
      "stress",
      "phrasal_verbs",
      "culture_note",
    ];
    for (const s of enOnly) {
      expect((SECTION_IDS as readonly string[]).includes(s)).toBe(false);
    }
  });
});

describe("headwordOk — 文字の判定は1箇所しかない", () => {
  it("**`target-language.ts` は自前の正規表現を持っていない**(正は1つ)", () => {
    // 判定を写すのではなく、この表を呼んでいること。文字列で確かめる
    // のは乱暴だが、「同じ結果が出るか」で見ると**両方に同じ写しが
    // 在る**状態も通ってしまい、食い違いを止められない。
    const src = fs.readFileSync(path.join("src", "lib", "target-language.ts"), "utf8");
    expect(src).not.toMatch(/ぁ-ゟ/);
    expect(src).not.toMatch(/㐀-䶿/);
    expect(src).toContain("target-profile");
  });

  it("**キリル文字・ハングルも通さない**(欧文だけを見ていた版の穴)", () => {
    expect(ZH_TW_PROFILE.headwordOk("Привет")).toBe(false);
    expect(ZH_TW_PROFILE.headwordOk("안녕")).toBe(false);
    expect(EN_PROFILE.headwordOk("Привет")).toBe(false);
    expect(EN_PROFILE.headwordOk("안녕")).toBe(false);
  });

  it("英語は飾りを落としてから見る(2語・アポストロフィ・ハイフン)", () => {
    expect(EN_PROFILE.headwordOk("night market")).toBe(true);
    expect(EN_PROFILE.headwordOk("don't")).toBe(true);
    expect(EN_PROFILE.headwordOk("well-known")).toBe(true);
  });
});
