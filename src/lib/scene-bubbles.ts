import type { WordExtrasDTO } from "./extras";

/**
 * 「この語にどこで出会うか」を、**札の並びに組み直す**所。
 *
 * ## オーナー指示 2026-08-27 ⑤
 * > 「使う場面について、その単語を見かける場面、状況、場所などについての
 * >  カテゴリーを囲って色分けしてバブルのように表示して、それでもバブル
 * >  そのカテゴリーとして説明できない時だけ文章で書いて。つまりこの項目は
 * >  基本この単語の特徴どこで出会うか？などのカテゴリーの説明にする。
 * >  ある場所でしか見かけないとかある場所や季節のもの、ある場所の特産の
 * >  ものを 〇〇限定、とか場所のラベルを表示したい。
 * >  （台南限定、台湾限定、ポケモンの〇〇地方のポケモンみたいな）」
 *
 * ## ここでやること
 * 1. `encounter_labels`（場所・状況・気持ち・時刻・媒体・季節）を札にする
 * 2. **限定の札を作る** — `region_scope`（「台南」）と `season_months`
 *    （旬の月）から、「台南限定」「春限定」を組み立てる。この2つは
 *    もともと extras に在るのに、**画面のどこにも出ていなかった**
 * 3. 札が1つも作れなかったときだけ、地の文に落ちる
 *
 * ## 限定は別格
 * 「台南限定」は「夜市で見る」とは重みが違う — ポケモンの地方限定と同じで、
 * **その語を持っていること自体が珍しい**という話。だから `kind: "limited"`
 * を別に立てて、色も大きさも他と変える。
 *
 * ここには外の世界に触れるものを入れないこと。
 */

/** 札の種類。`limited` だけは extras の別の欄から組み立てる。 */
export type BubbleKind =
  | "limited"
  | "place"
  | "media"
  | "situation"
  | "emotion"
  | "time"
  | "season";

export type SceneBubble = {
  /** 並びの中で一意。物理の輪がこれで札を追う。 */
  id: string;
  kind: BubbleKind;
  label: string;
};

/** 一度に浮かべる数の上限。増やすと札が小さくなって字が読めない。 */
export const MAX_BUBBLES = 8;

/** 種類の並び順。**限定が先頭** — いちばん珍しい話だから。 */
const ORDER: readonly BubbleKind[] = [
  "limited",
  "place",
  "media",
  "situation",
  "emotion",
  "time",
  "season",
];

/** 月から季節へ。旬が季節をまたぐ語（11〜2月）も拾えるよう、月ごとに見る。 */
const SEASON_OF_MONTH: Record<number, "spring" | "summer" | "autumn" | "winter"> = {
  3: "spring",
  4: "spring",
  5: "spring",
  6: "summer",
  7: "summer",
  8: "summer",
  9: "autumn",
  10: "autumn",
  11: "autumn",
  12: "winter",
  1: "winter",
  2: "winter",
};

/**
 * その語の旬が「1つの季節に収まる」ならその季節、収まらなければ null。
 *
 * 通年（空）と「4つの季節に散らばる」は、どちらも季節の話ではない。
 */
export function seasonOf(months: readonly number[] | null | undefined): string | null {
  const clean = (months ?? []).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  if (clean.length === 0 || clean.length >= 10) return null;
  const seasons = new Set(clean.map((m) => SEASON_OF_MONTH[m]));
  return seasons.size === 1 ? [...seasons][0] : null;
}

export type SceneBubbleInput = {
  /**
   * **緩く受ける。** 画面側の `word.extras ?? {}` は `Partial` なので、
   * 厳しく受けると呼ぶ側にキャストを書かせることになる — キャストを置くと、
   * 欄が増えた日に食い違いを検査で捕まえられなくなる。
   */
  extras: Partial<WordExtrasDTO> | null | undefined;
  /** 「{place}限定」の言い方（表示言語で組む）。 */
  limitedTo: (place: string) => string;
  /** 季節の名前（表示言語で組む）。`seasonOf` が返す鍵を受ける。 */
  seasonName: (key: string) => string;
};

/**
 * 札の並びを作る。
 *
 * **同じ字の札を2つ出さない。** `encounter_labels` に「台南」が入っていて
 * `region_scope` も「台南」のとき、「台南」と「台南限定」が並ぶ。
 * 限定のほうが情報が多いので、素の札は落とす。
 */
export function sceneBubbles(input: SceneBubbleInput): SceneBubble[] {
  const ex = input.extras ?? {};
  const out: SceneBubble[] = [];
  const seen = new Set<string>();

  const push = (kind: BubbleKind, label: string) => {
    const text = (label ?? "").trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push({ id: `${kind}:${text}`, kind, label: text });
  };

  // ① 限定。**素の札より先に入れる**ので、同じ字の素の札が落ちる。
  const region = (ex.region_scope ?? "").trim();
  if (region) {
    push("limited", input.limitedTo(region));
    // 「台南」という素の札も落とす（「台南限定」と2つ並べない）。
    seen.add(region);
  }
  const season = seasonOf(ex.season_months);
  if (season) push("limited", input.limitedTo(input.seasonName(season)));

  // ② その語に出会う所・時・気持ち。
  for (const l of ex.encounter_labels ?? []) {
    push((l?.kind as BubbleKind) ?? "place", l?.label ?? "");
  }

  const rank = new Map(ORDER.map((k, i) => [k, i]));
  return out
    .sort((a, b) => (rank.get(a.kind) ?? 99) - (rank.get(b.kind) ?? 99))
    .slice(0, MAX_BUBBLES);
}
