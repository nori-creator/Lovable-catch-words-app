import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  EN_PROFILE,
  JA_PROFILE,
  ZH_TW_PROFILE,
  defaultReading,
  hasSection,
  readingPromptNames,
  targetProfile,
  type ProfileSection,
} from "./target-profile";
import {
  TARGET_LANGUAGES,
  WEB_TARGET_CHOICES,
  normalizeTargetLanguage,
  speechLangOf,
  sttLangOf,
  webTargetChoices,
} from "./target-lang";
import {
  CEFR_SCALE,
  JLPT_SCALE,
  LEVEL_OUT,
  TOCFL_SCALE,
  levelOptions,
  parseLevelStep,
  restoreLevel,
} from "./level-scale";
import { bandDescription } from "./level-instruction";
import { coerceTargetHeadword, isTargetHeadword } from "./target-language";
import { resolveWordLanguage } from "./word-language";
import { looksLikeTargetLanguage } from "./text-language";
import {
  REGEN_SECTIONS,
  isRegenSection,
  missingSections,
  sectionHasContent,
} from "./card-sections";
import { stripUnrequested, wantsSection } from "./card-request";
import { normalizeExtras, refineUsageChunks } from "./extras";
import { formatL1Rule, l1Info } from "./l1";
import { mnemonicRule } from "./mnemonic-rule";
import { worldExampleRule } from "./example-sources";
import { cleanWordbookEntries } from "./wordbook";
import { ttsVoiceFor } from "./tts-voice";
import { elevenLabsBody, minimaxBody } from "./tts-providers";
import { isGenericChunk } from "./generic-chunks";

/**
 * 日本語を学習言語に足した日(2026-10-01)の門。
 *
 * iOS 版が先に出すので Web の画面ではまだ選べないが、サーバ関数は
 * `/api/native-fn` 経由で日本語のカードを作る。**画面で目に触れない分、
 * ここで数えて押さえる** — 日本語のカードに量詞の欄・注音・台湾の辞書が
 * 混ざっても、型でもビルドでも落ちない。
 */

describe("日本語のプロフィール", () => {
  it("学習言語として引ける(既定に落ちない)", () => {
    expect(TARGET_LANGUAGES).toContain("ja");
    expect(normalizeTargetLanguage("ja")).toBe("ja");
    expect(targetProfile("ja")).toBe(JA_PROFILE);
    expect(JA_PROFILE.code).toBe("ja");
  });

  it("読み上げ・聞き取りは ja-JP(地域まで指定する)", () => {
    expect(speechLangOf("ja")).toBe("ja-JP");
    expect(sttLangOf("ja")).toBe("ja-JP");
    expect(JA_PROFILE.speechLang).toBe("ja-JP");
    expect(JA_PROFILE.scriptLang).toBe("ja");
  });

  it("**台湾華語・英語の読み上げは変わっていない**", () => {
    expect(speechLangOf("zh-TW")).toBe("zh-TW");
    expect(speechLangOf("en")).toBe("en-US");
    expect(sttLangOf("zh-TW")).toBe("cmn-Hant-TW");
    expect(sttLangOf("en")).toBe("en-US");
  });

  it("読みは ふりがな(既定)とヘボン式ローマ字", () => {
    expect(JA_PROFILE.readings).toEqual(["kana", "romaji"]);
    expect(defaultReading(JA_PROFILE)).toBe("kana");
    expect(readingPromptNames(JA_PROFILE)).toEqual({
      primary: "ひらがなの読み",
      alt: "ヘボン式ローマ字",
    });
  });

  const JA_ONLY: ProfileSection[] = [
    "kanji_breakdown",
    "pitch_accent",
    "conjugation",
    "politeness",
    "counters",
    "word_origin",
    "japan_note",
  ];

  it("**日本語の仕組みから来る節**が並ぶ", () => {
    for (const s of JA_ONLY) expect(hasSection(JA_PROFILE, s), s).toBe(true);
    for (const s of [
      "meaning",
      "example",
      "usage_chunks",
      "related_words",
      "real_usage",
    ] as const) {
      expect(hasSection(JA_PROFILE, s), s).toBe(true);
    }
  });

  it("**台湾華語・英語だけの節は日本語のカードに出ない**", () => {
    for (const s of [
      "measure_words",
      "taiwan_note",
      "forms",
      "countability",
      "stress",
      "phrasal_verbs",
      "culture_note",
    ] as ProfileSection[]) {
      expect(hasSection(JA_PROFILE, s), s).toBe(false);
    }
  });

  it("**日本語の節は台湾華語・英語のカードに出ない**(並びはいままでのまま)", () => {
    for (const s of JA_ONLY) {
      expect(hasSection(ZH_TW_PROFILE, s), s).toBe(false);
      expect(hasSection(EN_PROFILE, s), s).toBe(false);
    }
  });

  it("一言メモは japan_note。生成もその欄を見る", () => {
    expect(JA_PROFILE.capture.noteField).toBe("japan_note");
    expect(hasSection(JA_PROFILE, JA_PROFILE.capture.noteField)).toBe(true);
  });

  it("4択の受け皿は日本語の語で、読みも持つ", () => {
    for (const w of JA_PROFILE.capture.quizFallbackHeadwords) {
      expect(JA_PROFILE.headwordOk(w), w).toBe(true);
      expect(JA_PROFILE.capture.quizFallbackReadings[w]?.zhuyin, w).toBeTruthy();
      expect(JA_PROFILE.capture.quizFallbackReadings[w]?.pinyin, w).toMatch(/^[a-zō]+$/);
    }
  });

  it("**日本語の指示文に台湾・繁体字・注音を持ち込まない**", () => {
    const texts = [
      JA_PROFILE.promptName,
      JA_PROFILE.capture.readingRule,
      JA_PROFILE.capture.noteRule,
      JA_PROFILE.capture.etymologyRule,
      JA_PROFILE.capture.readingLookupRule,
      JA_PROFILE.capture.relatedExample,
      JA_PROFILE.chunkPrompt.styleRule,
      JA_PROFILE.chunkPrompt.formulaExample,
      ...Object.values(JA_PROFILE.coach).filter((v) => !v.includes("✗")),
      ...Object.values(JA_PROFILE.wordbook),
    ];
    for (const t of texts) {
      for (const bad of ["台湾", "注音", "TOCFL", "量詞"]) {
        expect(t.includes(bad), `${bad} in: ${t}`).toBe(false);
      }
    }
  });

  it("スキャンの「台湾の言い方か」の札は日本語に掛けない", () => {
    expect(JA_PROFILE.capture.taiwanTermCheck).toBe(false);
    expect(ZH_TW_PROFILE.capture.taiwanTermCheck).toBe(true);
  });

  it("**英語の話す練習の文はいままでどおり**(台湾華語と同じ値。今回は振る舞いを変えない)", () => {
    expect(EN_PROFILE.coach).toBe(ZH_TW_PROFILE.coach);
    expect(JA_PROFILE.coach).not.toBe(ZH_TW_PROFILE.coach);
  });
});

describe("Web ではまだ選べない(iOS が先)", () => {
  it("Web の選択肢に日本語は無い", () => {
    expect(WEB_TARGET_CHOICES).toEqual(["zh-TW", "en"]);
    expect(webTargetChoices()).toEqual(["zh-TW", "en"]);
    expect(webTargetChoices("zh-TW")).toEqual(["zh-TW", "en"]);
  });

  it("**iOS で日本語を選んだ人の今の値だけは残す**(選択が空に見えない)", () => {
    expect(webTargetChoices("ja")).toEqual(["zh-TW", "en", "ja"]);
    expect(webTargetChoices("kl-GL")).toEqual(["zh-TW", "en"]);
  });

  it("Web の学習言語の選択肢は WEB_TARGET_CHOICES から作る", () => {
    for (const f of [
      "src/routes/_authenticated/settings.tsx",
      "src/components/onboarding/TutorialSettings.tsx",
      "src/components/onboarding/FirstCatchQuestions.tsx",
    ]) {
      const src = fs.readFileSync(f, "utf8");
      expect(src.includes("TARGET_LANGUAGES.map"), f).toBe(false);
      expect(/WEB_TARGET_CHOICES|webTargetChoices/.test(src), f).toBe(true);
    }
  });
});

describe("JLPT の目盛り", () => {
  it("易しい順に N5 → N1、6段目は N1 を超える語", () => {
    expect(JA_PROFILE.levels).toBe(JLPT_SCALE);
    expect(JLPT_SCALE.labels).toEqual(["N5", "N4", "N3", "N2", "N1", "N1+"]);
  });

  it("**数字の向きが逆でも段を正しく読む**(N5 は1段目)", () => {
    expect(parseLevelStep("JLPT-N5")).toBe(1);
    expect(parseLevelStep("JLPT-N4")).toBe(2);
    expect(parseLevelStep("JLPT-N3")).toBe(3);
    expect(parseLevelStep("JLPT-N2")).toBe(4);
    expect(parseLevelStep("JLPT-N1")).toBe(5);
    expect(parseLevelStep("JLPT-N1+")).toBe(6);
    expect(parseLevelStep("N3")).toBe(3);
  });

  it("級外は級外として読み返せる", () => {
    expect(parseLevelStep(JLPT_SCALE.outStored)).toBe(LEVEL_OUT);
  });

  it("保存の形と段が往復する", () => {
    for (const { value } of levelOptions(JLPT_SCALE)) {
      const step = parseLevelStep(value);
      expect(typeof step, value).toBe("number");
      expect(JLPT_SCALE.toStored(step as 1), value).toBe(value);
    }
    expect(levelOptions(JLPT_SCALE)[0]).toEqual({ value: "JLPT-N5", label: "JLPT N5" });
  });

  it("**TOCFL・CEFR の読み方は変わっていない**", () => {
    expect(parseLevelStep("TOCFL-2")).toBe(2);
    expect(parseLevelStep("TOCFL-0")).toBe(LEVEL_OUT);
    expect(parseLevelStep("B1")).toBe(3);
    expect(parseLevelStep("C2")).toBe(6);
    expect(parseLevelStep("CEFR-0")).toBe(LEVEL_OUT);
    expect(parseLevelStep("")).toBeNull();
    expect(TOCFL_SCALE.toStored(2)).toBe("TOCFL-2");
    expect(CEFR_SCALE.toStored(3)).toBe("B1");
  });

  it("学習言語を切り替えても段を引き継ぐ(TOCFL 2級 → N4)", () => {
    expect(restoreLevel(JLPT_SCALE, "TOCFL-2", 2)).toBe("JLPT-N4");
    expect(restoreLevel(JLPT_SCALE, "B2", 2)).toBe("JLPT-N2");
    expect(restoreLevel(CEFR_SCALE, "JLPT-N5", 2)).toBe("A1");
  });

  it("級の説明は JLPT の言葉で書く(TOCFL の話を渡さない)", () => {
    expect(bandDescription(JLPT_SCALE, 1)).toContain("N5");
    expect(bandDescription(JLPT_SCALE, 5)).toContain("N1");
    expect(bandDescription(JLPT_SCALE, 3)).not.toContain("TOCFL");
  });
});

describe("日本語の見出し語", () => {
  it.each(["傘", "りんご", "シャーペン", "お弁当", "食べる", "Tシャツ", "コーヒー", "人々"])(
    "%s は通す",
    (w) => {
      expect(JA_PROFILE.headwordOk(w)).toBe(true);
      expect(isTargetHeadword(w, "ja")).toBe(true);
    },
  );

  it.each(["umbrella", "안녕", "Привет", "ㄅㄆㄇ", "100円", "pen シャーペン", "", "・・"])(
    "%s は落とす",
    (w) => {
      expect(JA_PROFILE.headwordOk(w)).toBe(false);
    },
  );

  it("注釈が付いて返ってきても、先頭の日本語を取り出す", () => {
    expect(coerceTargetHeadword("傘 (kasa)", "ja")).toBe("傘");
    expect(coerceTargetHeadword("umbrella", "ja")).toBeNull();
  });

  it("**台湾華語・英語の受け入れは変わっていない**", () => {
    expect(isTargetHeadword("シャーペン", "zh-TW")).toBe(false);
    expect(isTargetHeadword("雨傘", "zh-TW")).toBe(true);
    expect(isTargetHeadword("傘", "en")).toBe(false);
    expect(isTargetHeadword("umbrella", "en")).toBe(true);
  });

  it("**語の言語の付け替えは、日本語を足す前と同じ答え**", () => {
    // 漢字だけの語は台湾華語にも日本語にも通るが、いままでどおり台湾華語に正す。
    expect(resolveWordLanguage("en", "雨傘")).toBe("zh-TW");
    // かなの語を台湾華語の行から日本語へ勝手に移さない(母語の取りこぼしのことが多い)。
    expect(resolveWordLanguage("zh-TW", "シャーペン")).toBe("zh-TW");
    // 日本語の行は日本語のまま。英単語は英語に正す。
    expect(resolveWordLanguage("ja", "傘")).toBe("ja");
    expect(resolveWordLanguage("ja", "lamp")).toBe("en");
  });

  it("例文が日本語で書かれているか", () => {
    expect(looksLikeTargetLanguage("雨が降ってきたから、傘をさそう。", "ja")).toBe(true);
    expect(looksLikeTargetLanguage("外面下雨了，帶把雨傘。", "ja")).toBe(false);
    expect(looksLikeTargetLanguage("Take an umbrella.", "ja")).toBe(false);
    expect(looksLikeTargetLanguage("우산을 써요", "ja")).toBe(false);
    // 台湾華語・英語の判定は変わっていない。
    expect(looksLikeTargetLanguage("雨が降ってきた", "zh-TW")).toBe(false);
    expect(looksLikeTargetLanguage("外面下雨了", "zh-TW")).toBe(true);
  });
});

describe("日本語の節の中身", () => {
  const input = (extras: Record<string, unknown>) => ({
    headword: "傘",
    language: "ja",
    meaning_ja: "umbrella",
    example_sentence: "傘をさす。",
    extras: normalizeExtras(extras),
  });

  it("すべて作り直せる節(押せるのに弾かれない)", () => {
    for (const id of [
      "kanji_breakdown",
      "pitch_accent",
      "conjugation",
      "politeness",
      "counters",
      "word_origin",
      "japan_note",
    ] as const) {
      expect(isRegenSection(id), id).toBe(true);
      expect((REGEN_SECTIONS as readonly string[]).includes(id), id).toBe(true);
    }
  });

  it("空なら『無い』、埋まれば『在る』", () => {
    const empty = input({});
    const full = input({
      kanji_breakdown: [{ kanji: "傘", meaning: "umbrella", on: "サン", kun: "かさ" }],
      pitch_accent: "頭高型(か↘さ)",
      conjugation: [{ form: "dictionary form", text: "さす" }],
      politeness: "Neutral.",
      counters: [{ word: "一本", reading: "いっぽん", note: "long objects" }],
      word_origin: "Native Japanese word (wago).",
      japan_note: "Clear plastic umbrellas are everywhere.",
    });
    for (const id of [
      "kanji_breakdown",
      "pitch_accent",
      "conjugation",
      "politeness",
      "counters",
      "word_origin",
      "japan_note",
    ] as const) {
      expect(sectionHasContent(id, empty), id).toBe(false);
      expect(sectionHasContent(id, full), id).toBe(true);
    }
    expect(missingSections(JA_PROFILE.sections, full).filter((s) => s.length > 0)).not.toContain(
      "kanji_breakdown",
    );
  });

  it("字の無い行・形の無い行は数えない(見出しだけの空の節を作らない)", () => {
    const blank = input({
      kanji_breakdown: [{ kanji: "  ", meaning: "x" }],
      conjugation: [{ form: "x", text: "" }],
    });
    expect(sectionHasContent("kanji_breakdown", blank)).toBe(false);
    expect(sectionHasContent("conjugation", blank)).toBe(false);
  });

  it("extras は形が崩れていても落ちずに既定値になる", () => {
    const ex = normalizeExtras({
      kanji_breakdown: "broken",
      counters: [{ word: "一枚" }],
      conjugation: [{ text: "食べます" }],
      pitch_accent: 3,
    })!;
    expect(ex.kanji_breakdown).toEqual([]);
    expect(ex.counters).toEqual([{ word: "一枚", reading: "", note: "" }]);
    expect(ex.conjugation).toEqual([{ form: "", text: "食べます" }]);
    expect(ex.pitch_accent).toBe("");
    expect(ex.politeness).toBe("");
    expect(ex.word_origin).toBe("");
    expect(ex.japan_note).toBe("");
  });

  it("見えない節は頼まない・返事からも落とす", () => {
    expect(wantsSection(["meaning"], "kanji_breakdown")).toBe(false);
    expect(wantsSection(["kanji_breakdown"], "kanji_breakdown")).toBe(true);
    expect(wantsSection(undefined, "pitch_accent")).toBe(true);
    const out = stripUnrequested({ pitch_accent: "", japan_note: "x" }, ["japan_note"]);
    expect(out).toEqual({ japan_note: "x" });
  });

  it("**日本語の型は12文字まで残す**(台湾華語の8文字で切ると全部落ちる)", () => {
    const chunk = {
      parts: [
        { text: "ハンバーガー", pos: "N" },
        { text: "を", pos: "Ptc" },
        { text: "食べる", pos: "V" },
      ],
      ja: "eat a hamburger",
    };
    expect(refineUsageChunks([chunk], [], "ハンバーガー", "ja")).toHaveLength(1);
    expect(refineUsageChunks([chunk], [], "ハンバーガー", "zh-TW")).toHaveLength(0);
  });

  it("「買う」「好き」だけを足した型は汎用として落とす", () => {
    const parts = (xs: string[]) => xs.map((text) => ({ text }));
    expect(isGenericChunk(parts(["傘", "を", "買う"]), "傘", "ja")).toBe(true);
    expect(isGenericChunk(parts(["傘", "を", "さす"]), "傘", "ja")).toBe(false);
  });
});

describe("日本語の生成の材料", () => {
  it("**母語の干渉は日本語のつまずき**(声調・注音の話を渡さない)", () => {
    for (const l1 of ["en", "zh-TW"]) {
      const text = formatL1Rule(l1Info(l1), "both", "ja");
      expect(text, l1).toContain("高低アクセント");
      expect(text, l1).toContain("助数詞");
      expect(text, l1).toContain("日本語の事情");
      // 台湾華語を学ぶときの見出し・事情(声調・量詞・「台湾華語は繁体字・注音が正」)を渡さない。
      // 台湾の人向けの本文が「中文の無気音(ㄍ・ㄉ・ㄅ)」と母語の側の音を挙げるのは正しい。
      for (const bad of ["【声調】", "【量詞】", "台湾華語は繁体字"]) {
        expect(text.includes(bad), `${l1}: ${bad}`).toBe(false);
      }
    }
    expect(formatL1Rule(l1Info("en"), "both", "ja").includes("ㄅ")).toBe(false);
  });

  it("学習言語を渡さなければ、いままでの台湾華語の干渉のまま", () => {
    expect(formatL1Rule(l1Info("en"), "pronunciation")).toBe(
      formatL1Rule(l1Info("en"), "pronunciation", "zh-TW"),
    );
  });

  it("覚え方の橋は、英語話者にはカタカナ語、台湾の人には同じ漢字", () => {
    expect(mnemonicRule("ja", "en", "英語")).toContain("カタカナ語");
    expect(mnemonicRule("ja", "zh-TW", "繁體中文(台湾)")).toContain("同じ漢字");
  });

  it("例文の生きた話題は日本のもの", () => {
    const rule = worldExampleRule("英語", "ja", new Date("2026-10-01"));
    expect(rule).toContain("日本の");
    expect(rule).toContain("使うなら日本のものを優先する。");
    expect(rule.includes("台湾")).toBe(false);
  });

  it("**台湾華語・英語の例文の話題はいままでどおり**", () => {
    const zh = worldExampleRule("日本語", "zh-TW", new Date("2026-10-01"));
    expect(zh).toContain("台湾の芸能人");
    expect(zh).toContain("使うなら台湾のものを優先する。");
    const en = worldExampleRule("日本語", "en", new Date("2026-10-01"));
    expect(en).toContain("英語圏と世界で広く知られた人物");
  });

  it("単語帳の取り込みは学習言語の規則で整える", () => {
    const raw = [
      { headword: "りんご" },
      { headword: "傘" },
      { headword: "apple" },
      { headword: "12" },
    ];
    expect(cleanWordbookEntries(raw, undefined, "ja").map((e) => e.headword)).toEqual([
      "りんご",
      "傘",
    ]);
    expect(cleanWordbookEntries(raw, undefined, "en").map((e) => e.headword)).toEqual(["apple"]);
    // 学習言語を渡さない古い呼び出しは、いままでどおり漢字の行だけ。
    expect(cleanWordbookEntries(raw).map((e) => e.headword)).toEqual(["傘"]);
  });
});

describe("日本語の読み上げ", () => {
  it("日本語の声で読む(台湾の声に落ちない)", () => {
    const v = ttsVoiceFor("ja");
    expect(v.googleLanguageCode).toBe("ja-JP");
    expect(v.googleVoice.startsWith("ja-JP")).toBe(true);
    expect(v.instructions).toContain("Japanese");
  });

  it("読み上げの会社にも日本語として渡す(台湾華語・英語はそのまま)", () => {
    expect(elevenLabsBody("傘", "eleven_flash_v2_5", 1, "ja").language_code).toBe("ja");
    expect(elevenLabsBody("雨傘", "eleven_flash_v2_5", 1, "zh-TW").language_code).toBe("zh");
    expect(elevenLabsBody("umbrella", "eleven_flash_v2_5", 1, "en").language_code).toBe("en");
    expect(minimaxBody("傘", "m", "v", 1, "ja").language_boost).toBe("Japanese");
    expect(minimaxBody("雨傘", "m", "v", 1, "zh-TW").language_boost).toBe("Chinese");
    expect(minimaxBody("umbrella", "m", "v", 1, "en").language_boost).toBe("English");
  });
});

describe("生成の指示文に分岐を書き足していない", () => {
  const ai = fs.readFileSync("src/lib/ai.functions.ts", "utf8");

  it('関連語・型の例は言語の表から引く(`startsWith("zh") ?` の2分岐に戻さない)', () => {
    expect(ai).toContain("cardProfile.capture.relatedExample");
    expect(ai).toContain("regenProfile.capture.relatedExample");
    expect(ai).toContain("chunk.formulaExample");
    expect(ai.includes('code.startsWith("zh") ?')).toBe(false);
  });

  it("日本語の節は生成と作り直しが同じ書き方を読む", () => {
    expect(ai).toContain("JA_SECTION_RULES.kanji_breakdown(NL)");
    expect(ai).toContain("japaneseSectionLines(wantOwn, NL)");
  });

  it("**日本語の節の指示は解説を読む人の言語で書かせる**(日本語で書かせない)", () => {
    const block = ai.slice(ai.indexOf("const JA_SECTION_RULES"), ai.indexOf("} as const;"));
    expect(block).toContain("${nl}");
    expect(block.includes("日本語で書く")).toBe(false);
  });
});
