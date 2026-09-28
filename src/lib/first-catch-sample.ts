import { CardSchema } from "./card-schema";
import type { FirstCatch } from "./first-catch";

/**
 * **登録前にAIを使えないときの「見本」。**
 *
 * 登録前の体験は、写真をAIで分析するために Supabase の匿名ログインを使う。
 * その設定が切れていると（2026-09-24 時点で切れている）、写真を撮った所で
 * 止まり、登録しないと先に進めなかった。そのときは、この見本の写真と単語で
 * 残りの流れ（はがす → 図鑑 → 単語の詳細 → 登録）を体験できるようにする。
 *
 * - 撮った写真の分析結果として見せることは**しない**。見本の写真に差し替え、
 *   画面に「見本」と書く。
 * - 見本は登録後にアカウントへ引き継がない（`sample: true` の下書きは写真と
 *   単語を保存せず、設定だけ引き継ぐ）。
 * - 確認用画面（`scripts/ui-harness`）も同じ見本を使う。
 */
export const SAMPLE_PHOTO = "/first-catch-cafe.webp";

export function sampleCard(target: FirstCatch["targetLanguage"], ui: FirstCatch["uiLanguage"]) {
  const meaning = {
    ja: "コーヒー",
    en: "coffee",
    "zh-TW": "咖啡",
  }[ui];
  return CardSchema.parse({
    headword_zh: target === "en" ? "coffee" : "咖啡",
    meaning_ja: meaning,
    reading_zhuyin: target === "en" ? "/ˈkɔːfi/" : "ㄎㄚ ㄈㄟ",
    pinyin: target === "en" ? "" : "kā fēi",
    part_of_speech: "N",
    level: "",
    category_key: "drink",
    example_sentence: target === "en" ? "I'd like a coffee, please." : "我想要一杯咖啡。",
    example_translation: {
      ja: "コーヒーを1杯お願いします。",
      en: "I'd like a coffee, please.",
      "zh-TW": "我想要一杯咖啡。",
    }[ui],
  });
}
export function sampleLesson(
  target: FirstCatch["targetLanguage"],
  ui: FirstCatch["uiLanguage"],
): NonNullable<FirstCatch["lesson"]> {
  const meaning = {
    ja: ["コーヒー（飲み物）", "コーヒー（豆・粉）"],
    en: ["coffee as a drink", "coffee beans or ground coffee"],
    "zh-TW": ["作為飲品的咖啡", "咖啡豆或咖啡粉"],
  }[ui];
  const sentence = target === "en" ? "I bought coffee for the train ride." : "我買了咖啡帶上火車。";
  const translation = {
    ja: "列車で飲むためにコーヒーを買いました。",
    en: "I bought coffee for the train ride.",
    "zh-TW": "我買了咖啡帶上火車。",
  }[ui];
  return {
    senses: meaning.map((value) => ({ meaning: value, note: "" })),
    examples: [
      {
        sentence,
        translation,
        situation: {
          ja: "旅先のカフェ",
          en: "A cafe while traveling",
          "zh-TW": "旅行途中的咖啡廳",
        }[ui],
        explanation: {
          ja: "移動中に飲む一杯を買う場面です。",
          en: "Use this for a drink you buy before a journey.",
          "zh-TW": "描述旅途中買來喝的飲品。",
        }[ui],
      },
      {
        sentence:
          target === "en" ? "These coffee beans smell wonderful." : "這些咖啡豆聞起來很香。",
        translation: {
          ja: "このコーヒー豆はとてもいい香りがします。",
          en: "These coffee beans smell wonderful.",
          "zh-TW": "這些咖啡豆聞起來很香。",
        }[ui],
        situation: {
          ja: "豆を選ぶとき",
          en: "Choosing coffee beans",
          "zh-TW": "挑選咖啡豆時",
        }[ui],
        explanation: {
          ja: "豆や粉を指す場合は、後ろに豆などを添えると明確です。",
          en: "Add ‘beans’ when you mean the ingredient rather than the drink.",
          "zh-TW": "指咖啡豆時，加上「豆」更清楚。",
        }[ui],
      },
    ],
  };
}
