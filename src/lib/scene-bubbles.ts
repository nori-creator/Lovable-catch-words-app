import type { WordExtrasDTO } from "./extras";

/**
 * 「この語にどこで・いつ・どんな時に出会うか」を、**軸ごとの束に組み直す**所。
 *
 * ## オーナー指示 2026-08-28 ②
 * > 「立扇という単語の時に台湾限定と出た。もう一度単語をどのように
 * >  カテゴライズするか、アルゴリズムを見直して。ネイティブがどんな時に
 * >  どのような媒体でどの時間どの季節にどんな地域で、そのものの物理的な
 * >  性質など。またこれらが散乱しないように、それぞれのカテゴライズを
 * >  同じように表示すると混乱するから、学習者が混乱しないようにカテゴリーの
 * >  表示を工夫して。」
 *
 * ## 何が壊れていたか（本番のデータで確かめた）
 * `region_scope` が入っている語は9つ。中身はこう:
 *
 * | 語 | 種類 | 入っていた値 | 正しいか |
 * |---|---|---|---|
 * | 冷氣(エアコン) | appliance | 台湾 | ✗ |
 * | 立扇(扇風機) | appliance | 台湾 | ✗ |
 * | 棒(すごい) | other | 台湾 | ✗ |
 * | 泡芙(シュークリーム) | dessert | 台湾 | ✗ |
 * | 葡式蛋塔(エッグタルト) | dessert | 台湾 | ✗ |
 * | 文旦・肉燥麵・beef noodle soup | food/fruit | 台湾 | ○ |
 *
 * **9つ中6つが誤り。** 原因は欄の名前と問いにある。`region_scope`
 * (地域の範囲)と訊かれた模型は、この app が台湾の語を扱う以上「台湾」と
 * 答える。訊きたいのは範囲ではなく **「そこにしか無いか」** だった。
 *
 * ## 直し方: 名前ではなく**理由**を要る物にした
 * 地域名だけでは限定を名乗れない。`region_scope_kind` に
 *   `specialty`(その土地の産物・名物) /
 *   `institution`(その土地にしか無い仕組み・店・制度) /
 *   `regional_word`(語そのものがその土地でしか使われない)
 * のどれかが要る。どれとも言えない物は限定ではない — 扇風機は台湾にも
 * 在るが、台湾にしか無いのではない。
 *
 * **古いカードは限定を名乗れなくなる。** 上の表のとおり今入っている値は
 * ほぼ誤りなので、それでいい。作り直せば理由の付いた物だけが戻る。
 *
 * ## 散らばらせない: 軸ごとに束ねる
 * 「夜市」「朝」「メニュー」「熱い」を同じ形で1列に並べると、学習者は
 * **何の一覧なのか**が分からない。軸(どこで/いつ/どんな場面で/どんな物か/
 * どんな気持ちで)ごとに束ね、束ごとに見出しを付ける。
 *
 * ここには外の世界に触れるものを入れないこと。
 */

/** 札の種類（extras に入っている粒度）。 */
export type BubbleKind =
  | "limited"
  | "place"
  | "media"
  | "situation"
  | "emotion"
  | "time"
  | "season"
  | "trait";

/**
 * 束ねる軸。**画面はこの単位で見出しを出す。**
 *
 * 種類(7つ)をそのまま見出しにすると多すぎて、かえって散らばって見える。
 * 学習者が知りたいのは「どこで・いつ・どんな時に・どんな物か」なので、
 * 近いものは同じ束に入れる（場所と媒体は別、時刻と季節は同じ「いつ」）。
 */
export type SceneAxis = "limited" | "where" | "when" | "scene" | "trait" | "feeling";

export type SceneChip = {
  /** 並びの中で一意。 */
  id: string;
  axis: SceneAxis;
  kind: BubbleKind;
  label: string;
};

export type SceneGroup = { axis: SceneAxis; items: SceneChip[] };

/** 一度に出す札の総数の上限。増やすと読む物ではなくなる。 */
export const MAX_BUBBLES = 8;
/** 1つの束に出す上限。1軸が全部を食べないように。 */
export const MAX_PER_AXIS = 4;

/** 種類 → 軸。 */
const AXIS_OF: Record<BubbleKind, SceneAxis> = {
  limited: "limited",
  place: "where",
  time: "when",
  season: "when",
  situation: "scene",
  media: "scene",
  trait: "trait",
  emotion: "feeling",
};

/** 束の並び順。**限定が先頭** — いちばん珍しい話だから。 */
const AXIS_ORDER: readonly SceneAxis[] = ["limited", "where", "when", "scene", "trait", "feeling"];

/** 月 → 季節。 */
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
 * 旬が何ヶ月に跨っているか（**年をまたいでも数えられる**）。
 *
 * 11〜2月の柑橘は「4ヶ月」であって「1〜12月に散らばっている」ではない。
 * 素直に `max - min` で測ると 11 と出て、通年と区別が付かなくなる。
 * 月を輪として見て、**いちばん大きい空きの裏側**を旬とする。
 */
export function monthSpan(months: readonly number[]): number {
  const uniq = [...new Set(months)].sort((a, b) => a - b);
  if (uniq.length === 0) return 0;
  if (uniq.length === 1) return 1;
  let maxGap = 0;
  for (let i = 0; i < uniq.length; i++) {
    const next = uniq[(i + 1) % uniq.length];
    const gap = i === uniq.length - 1 ? next + 12 - uniq[i] : next - uniq[i];
    if (gap > maxGap) maxGap = gap;
  }
  return 12 - maxGap + 1;
}

/**
 * その語の旬が1つの季節に**寄っている**ならその季節、寄っていなければ null。
 *
 * ## 「全部が同じ季節」では厳しすぎた
 * 文旦の旬は 8〜10月。8月は夏で 9・10月は秋なので、「全部が1つの季節」を
 * 求めると落ちる — しかし文旦は誰が見ても**秋の物**。逆に扇風機の 5〜9月
 * (5ヶ月)は季節の話ではない。
 *
 * だから2つで見る:
 *   ① 旬が **4ヶ月以内**（それより長ければ、季節ではなく「暖かい時期」）
 *   ② そのうち **3分の2以上**が1つの季節に入る
 */
export function seasonOf(months: readonly number[] | null | undefined): string | null {
  const clean = [
    ...new Set((months ?? []).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)),
  ];
  if (clean.length === 0) return null;
  if (monthSpan(clean) > 4) return null;
  const count = new Map<string, number>();
  for (const m of clean) {
    const s = SEASON_OF_MONTH[m];
    count.set(s, (count.get(s) ?? 0) + 1);
  }
  const need = Math.ceil((clean.length * 2) / 3);
  for (const [season, n] of count) if (n >= need) return season;
  return null;
}

/**
 * その語の「限定」の理由。**名前だけでは限定を名乗れない。**
 *
 * `specialty`      … その土地の産物・名物（文旦、肉燥麵）
 * `institution`    … その土地にしか無い仕組み・店・制度（悠遊卡、鐵路便當）
 * `regional_word`  … 語そのものがその土地でしか使われない（機車の言い方）
 */
export const REGION_SCOPE_KINDS = ["specialty", "institution", "regional_word"] as const;
export type RegionScopeKind = (typeof REGION_SCOPE_KINDS)[number];

/**
 * 地域限定と言い切れるか。**理由が無ければ言い切らない。**
 *
 * これが「立扇 → 台湾限定」を止める門。地域名は在ったが理由が無いので、
 * 限定にはならない。
 */
export function limitedRegion(
  region: string | null | undefined,
  kind: string | null | undefined,
): string | null {
  const name = (region ?? "").trim();
  if (!name) return null;
  return (REGION_SCOPE_KINDS as readonly string[]).includes(kind ?? "") ? name : null;
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
 * 軸ごとの束を作る。
 *
 * **同じ字の札を2つ出さない。** `encounter_labels` に「台南」が入っていて
 * 限定も「台南」のとき、「台南」と「台南限定」が並ぶ。限定のほうが情報が
 * 多いので、素の札は落とす。
 */
export function sceneGroups(input: SceneBubbleInput): SceneGroup[] {
  const ex = input.extras ?? {};
  const chips: SceneChip[] = [];
  const seen = new Set<string>();

  const push = (kind: BubbleKind, label: string) => {
    const text = (label ?? "").trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    chips.push({ id: `${kind}:${text}`, axis: AXIS_OF[kind] ?? "where", kind, label: text });
  };

  // ① 限定。**素の札より先に入れる**ので、同じ字の素の札が落ちる。
  const region = limitedRegion(ex.region_scope, ex.region_scope_kind);
  if (region) {
    push("limited", input.limitedTo(region));
    // 「台南」という素の札も落とす（「台南限定」と2つ並べない）。
    seen.add(region);
  }
  const season = seasonOf(ex.season_months);
  if (season) push("limited", input.limitedTo(input.seasonName(season)));

  // ② その語に出会う所・時・場面・物の性質・気持ち。
  for (const l of ex.encounter_labels ?? []) {
    push((l?.kind as BubbleKind) ?? "place", l?.label ?? "");
  }

  // ③ 軸ごとに束ね、束の中も上限で切る。**総数の上限は束を跨いで効く。**
  const out: SceneGroup[] = [];
  let total = 0;
  for (const axis of AXIS_ORDER) {
    if (total >= MAX_BUBBLES) break;
    const items = chips
      .filter((c) => c.axis === axis)
      .slice(0, Math.min(MAX_PER_AXIS, MAX_BUBBLES - total));
    if (items.length === 0) continue;
    total += items.length;
    out.push({ axis, items });
  }
  return out;
}

/** 束を平らにした一覧（数を数える所・古い呼び出しのため）。 */
export function sceneBubbles(input: SceneBubbleInput): SceneChip[] {
  return sceneGroups(input).flatMap((g) => g.items);
}
