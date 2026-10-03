import { CardSchema } from "./card-schema";
import type { FirstCatch } from "./first-catch";

/**
 * **写真の分析ができない時の「見本」**（2026-10-03 監査で戻した。R26 で参照が0件として
 * 消していたが、失敗の札が「見本の写真で体験できます」と言うのに、そのボタンが無く
 * 「もう一度試す」「撮り直す」しか無い行き止まりになっていた）。
 *
 * 登録前の分析が使えない（匿名ログインが切られている・今日の体験の枠が尽きた・AI が
 * 落ちている）時、失敗の札の「見本で体験を続ける」から、この見本の写真と単語で残りの流れ
 * （はがす → 図鑑 → 単語の詳細 → 復習 → 登録）を体験できる。**AI は呼ばない**（決まった中身）。
 *
 * - 撮った写真の分析結果として見せることは**しない**。見本の写真に差し替え、
 *   画面に「見本」と書く（`first.sampleNote`）。
 * - 見本は登録後にアカウントへ引き継がない（`sample: true` の下書きは写真と
 *   単語を保存せず、設定だけ引き継ぐ。`first-catch-transfer.ts`）。
 * - 意味・訳は表示言語の決まった文（別の言語を混ぜない）。
 */
export const SAMPLE_PHOTO = "/first-catch-cafe.webp";

export function sampleCard(target: FirstCatch["targetLanguage"], ui: FirstCatch["uiLanguage"]) {
  const meaning = {
    ja: "コーヒー",
    en: "coffee",
    "zh-TW": "咖啡",
  }[ui];
  return CardSchema.parse({
    headword_zh: {
      "zh-TW": "咖啡",
      en: "coffee",
      ja: "コーヒー",
    }[target],
    meaning_ja: meaning,
    reading_zhuyin: {
      "zh-TW": "ㄎㄚ ㄈㄟ",
      en: "/ˈkɔːfi/",
      ja: "",
    }[target],
    pinyin: {
      "zh-TW": "kā fēi",
      en: "",
      ja: "",
    }[target],
    part_of_speech: "N",
    level: "",
    category_key: "drink",
    example_sentence: {
      "zh-TW": "我想要一杯咖啡。",
      en: "I'd like a coffee, please.",
      ja: "コーヒーを一杯ください。",
    }[target],
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
  const sentence = {
    "zh-TW": "我買了咖啡帶上火車。",
    en: "I bought coffee for the train ride.",
    ja: "電車で飲むコーヒーを買いました。",
  }[target];
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
        sentence: {
          "zh-TW": "這些咖啡豆聞起來很香。",
          en: "These coffee beans smell wonderful.",
          ja: "このコーヒー豆はいい香りがします。",
        }[target],
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

/** 見本で続ける下書き（AI を呼ばない）。写真の分析・単語のカードの失敗から使う。 */
export function sampleFirstCatch(draft: FirstCatch, now: Date = new Date()): FirstCatch {
  return {
    ...draft,
    sample: true,
    photo: SAMPLE_PHOTO,
    capturedAt: now.toISOString(),
    card: sampleCard(draft.targetLanguage, draft.uiLanguage),
    lesson: sampleLesson(draft.targetLanguage, draft.uiLanguage),
    stage: "card",
  };
}

/**
 * 失敗の札に「見本で体験を続ける」を出すか。端末に保存できない失敗（見本も保存できない）
 * 以外は出す — 分析が使えない・混んでいる・通信が切れた・写真が読めない、のどれでも、
 * 見本でこの先の流れを体験できる（行き止まりにしない）。
 */
export function offersSample(code: string | null): boolean {
  return !!code && code !== "FIRST_CATCH_STORAGE";
}
