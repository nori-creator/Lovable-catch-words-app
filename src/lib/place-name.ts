/**
 * 逆ジオコーディングの答えから「その場所の名前」を1つ選ぶ。
 *
 * ## なぜ作ったか
 * オーナー指摘(2026-08-20):
 * 「単語の詳細の地図の情報、**最も具体的な地名**を書いて。
 *  今は Taipei City みたいに英語であいまいな地名になってる」
 *
 * 元の選び方は `sublocality → locality → administrative_area_level_1` の
 * 3段だけだった。つまり**行政区画しか見ていない**ので、
 *
 * ・区が取れない点では**市の名前**に落ちる(「台北市」= 直径20km)
 * ・目印(夜市・駅・建物)が返っていても**使わない**
 *
 * 撮った場所の記憶は「台北市」では戻ってこない。「士林夜市」で戻る。
 *
 * ## 具体的な順に見る
 * Google は `results` を**具体的な順**に返す。行政区画だけを拾うのを
 * やめて、目印 → 道 → 小さい区 → 区 → 市 の順に見る。
 *
 * ## 国名・郵便番号・番地は名前にしない
 * 「台湾」では場所を指さないし、「110」や「1號」は人が思い出す手掛かりに
 * ならない。**名前として使える型だけ**を通す。
 */

export type GeocodeComponent = { long_name: string; types: string[] };
export type GeocodeResult = {
  formatted_address?: string;
  address_components?: GeocodeComponent[];
  types?: string[];
};

/**
 * 具体的な順。**先に見つかったものを採る。**
 * 目印(`point_of_interest`)がいちばん強い — 人が覚えているのはそれ。
 */
const BY_SPECIFICITY: readonly string[] = [
  "point_of_interest",
  "establishment",
  "transit_station",
  "premise",
  "natural_feature",
  "park",
  "route",
  "sublocality_level_4",
  "sublocality_level_3",
  "sublocality_level_2",
  "sublocality_level_1",
  "sublocality",
  "neighborhood",
  "locality",
];

/** これは名前にしない。 */
const NEVER: readonly string[] = [
  "country",
  "postal_code",
  "postal_code_prefix",
  "street_number",
  "plus_code",
  "administrative_area_level_1",
  "administrative_area_level_2",
];

function usable(c: GeocodeComponent): boolean {
  const name = (c.long_name ?? "").trim();
  if (!name) return false;
  if (c.types.some((t) => NEVER.includes(t))) return false;
  // **数字だけの名前は捨てる。** 「110」「3」は場所を思い出させない。
  if (/^[\d\s\-–—]+$/.test(name)) return false;
  return true;
}

/**
 * いちばん具体的で、人が思い出せる名前を返す。無ければ null。
 *
 * `results` は具体的な順に並んでいるので、**同じ具体度なら先に来たほう**を
 * 採る。市(`locality`)まで落ちるのは最後の手段で、それも無ければ null —
 * **国名だけを返すぐらいなら、何も言わないほうがいい。**
 */
export function pickPlaceName(results: readonly GeocodeResult[] | null | undefined): string | null {
  if (!results || results.length === 0) return null;
  for (const wanted of BY_SPECIFICITY) {
    for (const r of results) {
      for (const c of r.address_components ?? []) {
        if (c.types.includes(wanted) && usable(c)) return c.long_name.trim();
      }
    }
  }
  return null;
}

/**
 * 地図に添える1行。**同じ物を2度言わない。**
 * 「士林夜市(士林區)」は良いが、「士林區(士林區)」は無意味。
 */
export function placeLine(specific: string | null, area: string | null): string | null {
  const a = (specific ?? "").trim();
  const b = (area ?? "").trim();
  if (!a) return b || null;
  if (!b || a === b || a.includes(b) || b.includes(a)) return a;
  return `${a}（${b}）`;
}

/** 区や市のような**広い名前**だけを取る(1行の後ろに添えるため)。 */
export function pickAreaName(results: readonly GeocodeResult[] | null | undefined): string | null {
  if (!results) return null;
  for (const wanted of ["sublocality_level_1", "sublocality", "locality"]) {
    for (const r of results) {
      for (const c of r.address_components ?? []) {
        if (c.types.includes(wanted) && usable(c)) return c.long_name.trim();
      }
    }
  }
  return null;
}
