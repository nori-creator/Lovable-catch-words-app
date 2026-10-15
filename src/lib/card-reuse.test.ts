import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CARD_REUSE_VERSION,
  CARD_REUSE_WINDOW_MS,
  pickReusableCard,
  trustedCardFrom,
  type CardGenKey,
  type GeneratedCardRow,
} from "./generated-cards";

const NOW = Date.parse("2026-10-15T10:05:00Z");
const gen: CardGenKey = {
  v: CARD_REUSE_VERSION,
  levels: "TOCFL-1>TOCFL-3",
  model: "gemini-2.5-pro",
  pro: true,
  sections: null,
};
const card = (over: Record<string, unknown> = {}) => ({
  headword_zh: "草莓蛋糕",
  meaning_ja: "いちごのケーキ",
  reading_zhuyin: "ㄘㄠˇ ㄇㄟˊ ㄉㄢˋ ㄍㄠ",
  pinyin: "cǎoméi dàngāo",
  level: "TOCFL-0",
  category_key: "dessert",
  example_sentence: "我想吃草莓蛋糕。",
  example_translation: "いちごのケーキが食べたい。",
  extras: {
    usage_context: "ケーキ屋で",
    usage_chunks: [{ parts: [{ text: "草莓蛋糕" }], ja: "いちごのケーキ" }],
    related_words: [{ word: "蛋糕", kind: "rel", note: "ケーキ" }],
  },
  gen,
  ...over,
});
const row = (
  c: unknown,
  minutesAgo: number,
  over: Partial<GeneratedCardRow> = {},
): GeneratedCardRow => ({
  language: "zh-TW",
  headword: "草莓蛋糕",
  explain_lang: "ja",
  l1: "ja",
  kind: "card",
  card: c,
  created_at: new Date(NOW - minutesAgo * 60_000).toISOString(),
  ...over,
});
const pick = (rows: GeneratedCardRow[], want: Partial<CardGenKey> = {}) =>
  pickReusableCard(rows, { explainLang: "ja", l1: "ja", gen: { ...gen, ...want }, now: NOW });

describe("同じ入力のカードは作り直さない（2026-10-15: 草莓蛋糕 が 20 分で3回作られた）", () => {
  it("同じ語・読む人の言語・母語・級・AI・作り方の版なら、控えのカードを返す", () => {
    const got = pick([row(card(), 19)]);
    expect(got?.headword_zh).toBe("草莓蛋糕");
    expect(got?.example_sentence).toBe("我想吃草莓蛋糕。");
  });

  it("入力が1つでも違えば作り直す", () => {
    expect(pick([row(card(), 1)], { levels: "TOCFL-2>TOCFL-4" })).toBeNull();
    expect(pick([row(card(), 1)], { model: "gemini-2.5-flash" })).toBeNull();
    expect(pick([row(card(), 1, { explain_lang: "en" })])).toBeNull();
    expect(pick([row(card(), 1, { l1: "en" })])).toBeNull();
    expect(pick([row(card(), 1, { kind: "candidate" })])).toBeNull();
    expect(pick([row(card({ gen: { ...gen, v: CARD_REUSE_VERSION - 1 } }), 1)])).toBeNull();
    // 印の無い古い控え（この変更より前）は使わない。
    expect(pick([row(card({ gen: undefined }), 1)])).toBeNull();
  });

  it("Pro の人には Pro の AI で作った物だけ。無料の人には Pro の物も返す", () => {
    const free = card({ gen: { ...gen, pro: false } });
    expect(pick([row(free, 1)])).toBeNull();
    expect(pick([row(free, 1)], { pro: false })).not.toBeNull();
    expect(pick([row(card(), 1)], { pro: false })).not.toBeNull();
  });

  it("頼まれた節が、作った時に頼んだ節に全部入っている時だけ（全部で作った物はどの頼み方にも）", () => {
    expect(pick([row(card(), 1)], { sections: ["example", "meaning"] })).not.toBeNull();
    const partial = card({ gen: { ...gen, sections: ["example", "meaning", "usage_chunks"] } });
    expect(pick([row(partial, 1)], { sections: ["example", "meaning"] })).not.toBeNull();
    expect(pick([row(partial, 1)], { sections: ["example", "related_words"] })).toBeNull();
    expect(pick([row(partial, 1)])).toBeNull();
  });

  it("期間（1日）を過ぎた物・中身の欠けた物は使わない", () => {
    expect(pick([row(card(), CARD_REUSE_WINDOW_MS / 60_000 + 1)])).toBeNull();
    expect(pick([row(card({ example_sentence: "" }), 1)])).toBeNull();
    expect(pick([row(card({ extras: { usage_context: "" } }), 1)])).toBeNull();
    // チャンクを頼まない呼び方なら、チャンクの無いカードでもよい。
    const noChunks = card({
      extras: { usage_context: "x", related_words: [{ word: "蛋糕" }] },
      gen: { ...gen, sections: ["example", "related_words"] },
    });
    expect(pick([row(noChunks, 1)], { sections: ["example", "related_words"] })).not.toBeNull();
  });

  it("新しい方を選ぶ", () => {
    const old = card({ example_sentence: "古い文。" });
    expect(pick([row(old, 30), row(card(), 2)])?.example_sentence).toBe("我想吃草莓蛋糕。");
  });

  it("控えは見出し語と入力の印を残すが、共有の列には出さない", () => {
    const t = trustedCardFrom(card());
    expect(t.headword_zh).toBe("草莓蛋糕");
    expect(t.gen).toEqual(gen);
    expect(trustedCardFrom({ meaning_ja: "x", gen: { v: "1" } }).gen).toBeUndefined();
  });

  it("generateCard: AI の前に控えを見る。返す回は確保した1回を返し、AI も使用の行も使わない", () => {
    const ai = fs.readFileSync(path.join(__dirname, "ai.functions.ts"), "utf8");
    const fn = ai.slice(ai.indexOf("export const generateCard"), ai.indexOf("// --- Phrase cards"));
    const reuseAt = fn.indexOf("pickReusableCard(await copies");
    const aiAt = fn.indexOf("runAiAttempts(");
    expect(reuseAt).toBeGreaterThan(0);
    expect(aiAt).toBeGreaterThan(reuseAt);
    expect(fn).toMatch(
      /if \(held\.ok && held\.usageId != null\) await releaseAiCall\(held\.usageId\)/,
    );
    expect(fn).toMatch(/recordCardReuse\(context/);
    // 控えには入力の印を付ける。
    expect(fn).toMatch(/card: \{ \.\.\.out, gen: genKey \}/);
    // 枠を確保できなかった回は、控えを返せない時だけ断る。
    expect(fn).toMatch(/if \(!held\.ok\) throw held\.error;/);
    expect(fn).not.toMatch(/assertWithinDailyCap\(context\.userId, "card"\)/);
  });
});
