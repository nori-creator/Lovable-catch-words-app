/**
 * 語のカードの節。**画面と生成側で1つの出所を共有する。**
 *
 * ## なぜ切り出したか
 * 「作り直せる節」の一覧が `WordCard.tsx` と `ai.functions.ts` の
 * **2箇所に別々に書かれていた**。片方だけに足すと、
 *   ・画面にだけ足す → 「作る」を押せるのに server が弾く
 *   ・server にだけ足す → 作れるのにボタンが出ない
 * どちらも**エラーにならず、押した人にだけ起きる**。
 * `quick_facts` を足したときは両方に手で書いて、たまたま合っていた。
 * たまたま合うものは、いつか合わなくなる。
 */

/** カードに並ぶ節。**順序はここでは決めない**(既定の並びは画面側)。 */
export const SECTION_IDS = [
  "meaning",
  "web_images",
  "usage_context",
  "encounter",
  "example",
  "examples_extra",
  "usage_chunks",
  "measure_words",
  "related_words",
  "pronunciation_tips",
  "etymology",
  "mnemonic",
  "taiwan_note",
  "real_usage",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

/**
 * AI で作り直せる節。外部リンク系(`web_images` / `real_usage`)は
 * 生成物ではないので入らない。
 */
export const REGEN_SECTIONS = [
  "meaning",
  "usage_context",
  "example",
  "examples_extra",
  "usage_chunks",
  "measure_words",
  "related_words",
  "pronunciation_tips",
  "etymology",
  "mnemonic",
  "taiwan_note",
] as const;

export type RegenSection = (typeof REGEN_SECTIONS)[number];

/**
 * その節が AI で作り直せるか。
 *
 * **型を絞る形で書く。** `REGEN_SECTIONS.includes(id)` を直に書くと、
 * `id` が広い型のままなので、server に渡す所で型が合わなくなる
 * (合わせるためにキャストを置くと、食い違いを検査で捕まえられなくなる)。
 */
export function isRegenSection(id: SectionId): id is RegenSection {
  return (REGEN_SECTIONS as readonly string[]).includes(id);
}
