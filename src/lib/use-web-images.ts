import { resolveWordLanguage } from "@/lib/word-language";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { searchImageCandidates, type ImageCandidate } from "@/lib/images.functions";
import { cleanImageQuery, heroSearchQuery } from "@/lib/hero-image";

/**
 * その語のネットの画像。**節を出すかどうかと、節の中身が同じ答えを見る。**
 *
 * オーナー指示 2026-08-27 ④:
 * > 「単語の全ての項目について適応することだけど、解説、画像が表示されない
 * >  時はまずその項目を表示しないで。解説、画像が生成されて始めて項目を
 * >  表示して。」
 *
 * ## なぜ切り出したか
 * 他の節は「行に中身が在るか」で出し入れを決められる（`sectionHasContent`）。
 * ネットの画像だけは**取りに行ってみないと分からない**ので、その節は
 * 「いつでも描ける」として常に並んでいた。1枚も見つからない語では、
 * 見出しと「画像がありません」だけの欄が残る。
 *
 * 判断を画面の外に出して、**節を並べる側と中身を描く側が同じ問い合わせを
 * 読む**ようにする（React Query が同じ鍵で1回にまとめる）。
 * 別々に呼ぶと、片方が「在る」と言い、片方が「無い」と言う —
 * この app が3度やった「描く条件と数える条件のずれ」そのもの。
 *
 * ## 探す言葉は `hero-image.ts` から
 * 詳細が自動であてがう絵と、ここで選び直せる絵が別の検索から来ていると、
 * 「変えたのに似た絵しか出ない」の理由が読めなくなる。
 */
export type WebImages = {
  candidates: ImageCandidate[];
  /** まだ一度も返ってきていない。**この間は節を出さない。** */
  isLoading: boolean;
  /** 取り直している最中（「別の画像」を押した直後）。 */
  isFetching: boolean;
};

export type WebImageWord = {
  headword: string;
  meaningJa: string;
  /** カードを作る時に AI が返した画像検索用の英語（`extras.image_query`）。古いカードは空。 */
  imageQuery?: string | null;
  /** 棚（`category_key`）。候補を並べ直す手がかり。 */
  category?: string | null;
  /** 写っていたら外れの英語（`extras.image_avoid`）。古いカードは空。 */
  avoid?: string[] | null;
  /** 学習言語（`words.language`）。 */
  language?: string | null;
};

export function useWebImages(
  word: WebImageWord,
  /** 「別の画像」を押した回数。0 が最初の検索。 */
  seed = 0,
): WebImages {
  const searchFn = useServerFn(searchImageCandidates);
  const { headword, meaningJa, imageQuery, category, avoid } = word;
  const language = resolveWordLanguage(word.language, headword);
  // 並べ直しに効く物はすべて鍵に入れる（後から避ける語が届いたら取り直す）。
  const avoidKey = (avoid ?? []).join("|");
  const base = heroSearchQuery({ headword, meaning: meaningJa, imageQuery });
  // 英語の検索語に中国語の見出し語を足すと、どの出所でも当たらなくなる。
  // 意味の欄で探している（古いカードの）時だけ、取り直しで見出し語を足す。
  const english = cleanImageQuery(imageQuery).length > 0;
  const query = seed === 0 || english ? base : `${base} ${headword}`;
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["web-images", headword, base, seed, avoidKey, category ?? null, language],
    // 語も意味も無い札に空の検索を投げない。
    enabled: base.length > 0,
    queryFn: async () =>
      (
        await searchFn({
          // 見出し語と意味も渡す（英語の検索語が無いカードは、サーバが意味を決めて探す。
          // 絵を見て確かめる時の手がかりにもなる — `image-sense.ts`）。
          data: {
            query,
            category: category ?? null,
            headword,
            meaning: meaningJa || null,
            avoid: avoid ?? null,
            language,
          },
        })
      ).candidates,
    staleTime: 24 * 60 * 60 * 1000,
  });
  return { candidates: data ?? [], isLoading, isFetching };
}
