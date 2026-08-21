/**
 * TOCFL(華語文能力測驗)の級。
 *
 * オーナー:
 * > 「**積み木のイメージではなく、かたちとして積み木のように TOCFL の
 * >  レベル別に段々になっていて、色分けさせていて、この単語がどのレベルか
 * >  視覚的に分かるようにして。**」
 *
 * 前は `TOCFL-2` という文字の札が1つ出ているだけで、**2が6段のうちの
 * どこなのか**が分からなかった。段の形にするには「全部で何段か」「この語は
 * 何段目か」「表に載っていない語をどう置くか」を決める必要があり、
 * その3つはここで決める。
 *
 * ## 級外を「無い」で済ませない
 * 辞書に級が無い語は珍しくない(固有名詞・新語・方言)。そこを `null` の
 * まま画面に渡すと「段が1つも光らない図」になり、壊れて見える。
 * **級外という段がある**ことにして、6段の外側に置く。
 *
 * 外の世界に触れるものをここに入れないこと。
 */

export const TOCFL_LEVELS = [1, 2, 3, 4, 5, 6] as const;
export type TocflLevel = (typeof TOCFL_LEVELS)[number];

/** 級外(TOCFL の語彙表に載っていない語)。 */
export const TOCFL_OUT = "out" as const;

/** 段のどれか。`null` は「まだ分からない」で、`"out"` とは違う。 */
export type TocflStep = TocflLevel | typeof TOCFL_OUT;

/**
 * `"TOCFL-2"` `"tocfl 2"` `"2"` `"Level 3"` のどれからでも級を取り出す。
 *
 * - 1〜6 の外(0 や 7)は級ではない → `TOCFL_OUT`
 * - 数字が1つも無い(`"級外"` `"不明"` `""`)→ `null`(分からない)
 *
 * **「範囲外」と「分からない」を混ぜない。** 混ぜると、辞書の取りこぼしと
 * 本当に級外の語が同じ見た目になり、どちらを直せばいいか分からなくなる。
 */
export function parseTocflStep(raw: string | number | null | undefined): TocflStep | null {
  if (raw == null) return null;
  const s = String(raw);
  // **マイナスを読まない。** `TOCFL-2` のハイフンは区切りであって符号では
  // ないので、`-?` を付けると 2級が -2 になり、丸ごと級外へ落ちる。
  const m = s.match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n)) return null;
  return (TOCFL_LEVELS as readonly number[]).includes(n) ? (n as TocflLevel) : TOCFL_OUT;
}

/** 段の高さ(0〜1)。1級がいちばん低く、6級がいちばん高い。 */
export function stepHeight(level: TocflLevel): number {
  const i = TOCFL_LEVELS.indexOf(level);
  // 一番低い段も**見える高さ**を持たせる。0 から始めると、1級の語で
  // 「段が無い」ように見える。
  return 0.35 + (0.65 * i) / (TOCFL_LEVELS.length - 1);
}

/** 色のトークン名(`src/styles.css` の `--tocfl-*`)。素の16進を書かない。 */
export function stepColorVar(step: TocflStep): string {
  return step === TOCFL_OUT ? "var(--tocfl-out)" : `var(--tocfl-${step})`;
}

/** その段の名前の翻訳キー。 */
export function stepLabelKey(step: TocflStep): string {
  return step === TOCFL_OUT ? "tocfl.out" : "tocfl.level";
}

/**
 * TOCFL の帯(Band)。
 *
 * オーナー指摘 2026-08-21:
 * > 「1.2.3.4.5.6.だけだとこれが TOCFL のレベルだと分かりづらい。
 * >  また 1.2.3.4.5.6 だけでなく Band A,B,C にも視覚的に分けて」
 *
 * TOCFL は6つの級を**2つずつ3つの帯**にまとめている。級だけを並べると
 * 「6段のうちの何段目か」しか読めないが、帯まで見えると
 * 「入門のかたまりの中の上」のように**位置の意味**が読める。
 */
export const TOCFL_BANDS = ["A", "B", "C"] as const;
export type TocflBand = (typeof TOCFL_BANDS)[number];

/** その級が属する帯。1-2=A / 3-4=B / 5-6=C。 */
export function bandOf(level: TocflLevel): TocflBand {
  return level <= 2 ? "A" : level <= 4 ? "B" : "C";
}

/** 帯に属する級(小さい順)。 */
export function levelsInBand(band: TocflBand): TocflLevel[] {
  return TOCFL_LEVELS.filter((l) => bandOf(l) === band);
}

/** 帯の名前の翻訳キー。 */
export function bandLabelKey(band: TocflBand): string {
  return `tocfl.band${band}`;
}
