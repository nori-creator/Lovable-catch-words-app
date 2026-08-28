import { SECTION_IDS, type SectionId } from "./card-sections";

/**
 * 節の目印を**名前で決める**所。絵そのものはここには置かない。
 *
 * ## オーナー指示 2026-08-28 ⑧
 * > 「アプリ内のすべての単語の詳細、復習の4択も含めて、すべて単語の
 * >  詳細の項目の鮮やかな青い丸のアイコンに統一して。」
 *
 * ## なぜ絵文字をやめるか
 * これまでは 📖 💬 🧩 … の絵文字を地の上に直に置いていた。3つの理由で
 * 揃わない:
 *
 * ① **端末ごとに違う絵が出る。** 同じ符号でも Apple・Google・Samsung で
 *    形も色も違う。「統一したい」と言われている物が、見る人ごとに
 *    別物になっている。
 * ② **色が揃わない。** 絵文字は多色で、しかも節ごとに色が違う。
 *    青一色の画面の中で、そこだけ賑やかな点が14個並ぶ。
 * ③ **大きさが揃わない。** 絵文字は字として組まれるので、字形によって
 *    高さも幅も変わる。丸の中に入れると中心がずれる。
 *
 * 線の絵を**同じ大きさの青い丸**に入れれば、3つとも消える。
 *
 * ## ここに絵(部品)を置かない理由
 * 部品を持つと、この表を読むだけで React の一式を引き込むことになり、
 * server 側や試験から気軽に読めなくなる。**名前だけ**を持ち、
 * 名前から部品への対応は `components/SectionIcon.tsx` が持つ。
 * 「どの節にどの絵か」は判断なので試験で縛る。「その名前の部品が在るか」
 * は型が縛る。
 */

/**
 * 使う絵の名前(lucide の部品名)。
 *
 * **ここに無い名前は使わない。** 文字列で受けると綴りの誤りが
 * 「絵が出ない」として静かに通ってしまうので、union で閉じる。
 */
export type SectionIconName =
  | "BookOpen"
  | "Images"
  | "ChartColumn"
  | "MessageSquareQuote"
  | "ListPlus"
  | "Blocks"
  | "Network"
  | "AudioLines"
  | "Landmark"
  | "Lightbulb"
  | "Clapperboard"
  | "Hash"
  | "MapPin"
  | "Repeat"
  | "Boxes"
  | "Megaphone"
  | "Link2"
  | "Globe";

/**
 * 節 → 絵の名前。
 *
 * **1つの節に1つ、重ならないように選ぶ。** 同じ絵が2箇所に出ると、
 * 目印としての仕事をしない(「どちらの節だったか」が絵から分からない)。
 * 試験がこれを縛る。
 */
export const SECTION_ICON_NAME: Record<SectionId, SectionIconName> = {
  meaning: "BookOpen",
  web_images: "Images",
  usage_context: "ChartColumn",
  example: "MessageSquareQuote",
  examples_extra: "ListPlus",
  usage_chunks: "Blocks",
  related_words: "Network",
  pronunciation_tips: "AudioLines",
  etymology: "Landmark",
  mnemonic: "Lightbulb",
  real_usage: "Clapperboard",
  // --- 台湾華語のカードだけ -------------------------------------------------
  measure_words: "Hash",
  taiwan_note: "MapPin",
  // --- 英語のカードだけ -----------------------------------------------------
  forms: "Repeat",
  countability: "Boxes",
  stress: "Megaphone",
  phrasal_verbs: "Link2",
  culture_note: "Globe",
};

/** 節の目印の名前。知らない節でも落ちない(既定は「意味」の絵)。 */
export function sectionIconName(id: SectionId): SectionIconName {
  return SECTION_ICON_NAME[id] ?? "BookOpen";
}

/**
 * 節ではない所にも同じ丸を使う。
 *
 * オーナーの「すべて統一して」は節の中だけの話ではない — 復習の4択や
 * 単語の詳細を出すどの面でも、同じ青い丸で出す。**名前の付いた役**を
 * ここに並べておけば、画面側で新しい絵を思い付きで足せなくなる。
 */
export const BADGE_ICON_NAME = {
  /** 復習の4択の見出し(「どれ?」)。 */
  quiz: "Blocks",
  /** 話して答える形。 */
  speak: "AudioLines",
  /** 覚え具合。 */
  memory: "Lightbulb",
} as const satisfies Record<string, SectionIconName>;

/** すべての節に絵が付いているか(画面を描く前に確かめられる)。 */
export function everySectionHasIcon(): boolean {
  return SECTION_IDS.every((id) => !!SECTION_ICON_NAME[id]);
}
