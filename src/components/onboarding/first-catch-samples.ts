import { firstCatchSticker, type FirstCatch } from "@/lib/first-catch";
import type { useT } from "@/lib/i18n";
import type { useTargetLang } from "@/lib/target-lang-pref";
import { CardSchema } from "@/lib/card-schema";

/**
 * チュートリアルの見本の4枚（カフェ・花・猫・海）。
 *
 * **画面の部品を読まない所に置く**（2026-10-03 最初の読み込みの監査）。ウェルカム・
 * 質問・登録の画面もこの見本の語を使う。前は `FirstCatchHome.tsx` にあり、そこから
 * 読むとホームの画面（`HomeSurface`）と下のタブの枠まで最初の画面に付いてきた。
 */
export function sampleStickers(
  draft: FirstCatch | null,
  t: ReturnType<typeof useT>,
  target: ReturnType<typeof useTargetLang>,
) {
  const selected = draft?.targetLanguage ?? target;
  return [
    {
      id: "00000000-0000-4000-8000-000000000001",
      photo: "/first-catch-cafe.webp",
      word: selected === "en" ? "coffee" : "咖啡",
      reading: selected === "en" ? ["/ˈkɔːfi/", ""] : ["ㄎㄚ ㄈㄟ", "kāfēi"],
      meaning: t("first.sampleCoffee"),
      category: "drink",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      photo: "/first-catch-flower.webp",
      word: selected === "en" ? "flower" : "花",
      reading: selected === "en" ? ["/ˈflaʊər/", ""] : ["ㄏㄨㄚ", "huā"],
      meaning: t("first.sampleFlower"),
      category: "plant",
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      photo: "/first-catch-cat.webp",
      word: selected === "en" ? "cat" : "貓",
      reading: selected === "en" ? ["/kæt/", ""] : ["ㄇㄠ", "māo"],
      meaning: t("first.sampleCat"),
      category: "animal",
    },
    {
      id: "00000000-0000-4000-8000-000000000004",
      photo: "/first-catch-ready.webp",
      word: selected === "en" ? "sea" : "海",
      reading: selected === "en" ? ["/siː/", ""] : ["ㄏㄞˇ", "hǎi"],
      meaning: t("first.sampleSea"),
      category: "nature",
    },
    // 見本にも読みを持たせる（βテスト 2026-09-30「4択の一つだけしか注音が出てない」）。
  ].map(({ id, photo, word, reading, meaning, category }, i) => ({
    ...firstCatchSticker({
      version: 1,
      id,
      uiLanguage: draft?.uiLanguage ?? "ja",
      targetLanguage: selected,
      dailyMinutes: 10,
      stage: "home",
      photo,
      capturedAt: "2026-09-23T09:00:00.000Z",
      card: CardSchema.parse({
        headword_zh: word,
        meaning_ja: meaning,
        reading_zhuyin: reading[0],
        pinyin: reading[1],
        category_key: category,
        level: "",
      }),
    })!,
    album_x: i % 2 === 0 ? 0.25 : 0.75,
    album_y: 0.3 + Math.floor(i / 2) * 0.68,
    album_scale: 1.35,
    album_rot: 0,
  }));
}
