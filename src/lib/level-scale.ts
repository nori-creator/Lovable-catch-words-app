/**
 * 学習言語ごとの**級の目盛り**。
 *
 * オーナー指示 2026-08-24:
 * > 「TOEFL と IELTS のレベル対応は **CEFR 換算でいい**」
 * > 「アプリ内のすべての項目について学習言語、英語と台湾華語で変更すべきことを
 * >  変更して」
 *
 * ## なぜ一般化できるのか — 形が同じだから
 * TOCFL は6級を2つずつ3つの帯(A/B/C)にまとめる。**CEFR も同じ形**:
 * A1 A2 B1 B2 C1 C2 の6段が、A/B/C の3帯に2つずつ入る。
 *
 *     TOCFL   1  2 | 3  4 | 5  6      帯 A | B | C
 *     CEFR   A1 A2 |B1 B2 |C1 C2      帯 A | B | C
 *
 * だから `TocflLadder`(段々の絵)は**中身を変えずにそのまま使える**。
 * 変わるのは「段の名前」と「読み取り方」だけ。
 *
 * ## 級の外を「無い」で済ませない
 * どちらの体系にも載っていない語は珍しくない(固有名詞・新語・方言)。
 * そこを `null` のまま画面に渡すと「段が1つも光らない図」になり、壊れて
 * 見える。**級外という段がある**ことにして、6段の外側に置く。
 *
 * ## 色は体系ではなく「どこまで登ったか」を表す
 * 色のトークンは `--level-1`〜`--level-6` と `--level-out`。**体系ごとに
 * 色を分けない** — 同じ「6段の深さ」を表す物なので、TOCFL の3級と CEFR の
 * B1 が同じ濃さで出るのが正しい。学ぶ言語を切り替えたときに色の意味が
 * 変わらないほうが読みやすい。
 *
 * 外の世界に触れるものをここに入れないこと。
 */

/** 級の外(その体系の語彙表に載っていない語)。 */
export const LEVEL_OUT = "out" as const;
export type LevelOut = typeof LEVEL_OUT;

/** 段のどれか。`null` は「まだ分からない」で、`"out"` とは違う。 */
export type LevelStep = number | LevelOut;

/** 帯。どちらの体系も A / B / C の3つ。 */
export const LEVEL_BANDS = ["A", "B", "C"] as const;
export type LevelBand = (typeof LEVEL_BANDS)[number];

/** 段は6つ。TOCFL も CEFR もここが一致しているので絵を共有できる。 */
export const LEVEL_INDEXES = [1, 2, 3, 4, 5, 6] as const;
export type LevelIndex = (typeof LEVEL_INDEXES)[number];

export type LevelScale = {
  /** 体系の名前。画面の目盛りの左に出す(「TOCFL」「CEFR」)。 */
  id: string;
  /**
   * 段の名前(小さい順に6つ)。
   * TOCFL は `["1","2","3","4","5","6"]`、CEFR は `["A1",…,"C2"]`。
   */
  labels: readonly [string, string, string, string, string, string];
  /**
   * 保存されている文字列からその段の名前を作る。
   * `level_goal` に入る形("TOCFL-2" / "B1")もこれで往復できる。
   */
  toStored: (index: LevelIndex) => string;
  /**
   * 「その段の名前 + 帯」の言い方の翻訳キー。
   *
   * **体系ごとに違う。** TOCFL は「2級（Band A）」だが、CEFR で
   * 「A1級」と書くと別の体系に見える — 級は TOCFL の数え方で、
   * CEFR の段はそれ自体が名前。絵で見つけた。
   */
  levelInBandKey: string;
  /** 級外の言い方の翻訳キー。 */
  outKey: string;
  /**
   * 設定の「いまの級 / 目標の級」に並べる文言。
   *
   * **体系ごとに言い方が違う。** TOCFL は `TOCFL Level 3` と書くのが
   * 慣習だが、CEFR に `Level` は付けない(`CEFR B1`)。ここを共通の
   * ひな形にすると、どちらかが慣習から外れた表記になる。
   */
  optionLabel: (label: string) => string;
};

/** 台湾華語: 華語文能力測驗。 */
export const TOCFL_SCALE: LevelScale = {
  id: "TOCFL",
  labels: ["1", "2", "3", "4", "5", "6"],
  toStored: (i) => `TOCFL-${i}`,
  levelInBandKey: "tocfl.levelInBand",
  outKey: "tocfl.out",
  optionLabel: (label) => `TOCFL Level ${label}`,
};

/**
 * 英語: CEFR。TOEFL と IELTS は**この段に添える派生の目盛り**として出す
 * (オーナー承認済み「CEFR 換算でいい」)。
 */
export const CEFR_SCALE: LevelScale = {
  id: "CEFR",
  labels: ["A1", "A2", "B1", "B2", "C1", "C2"],
  toStored: (i) => CEFR_SCALE.labels[i - 1],
  levelInBandKey: "cefr.levelInBand",
  outKey: "cefr.out",
  // CEFR に `Level` は付けない。`CEFR B1` がその体系の書き方。
  optionLabel: (label) => `CEFR ${label}`,
};

/**
 * 保存されている値から段を読む。
 *
 * TOCFL は数字を拾う。CEFR は `A1`〜`C2` の綴りを拾う。
 * **どちらの形も受ける** — 学ぶ言語を切り替えた人の古い `level_goal` が
 * 残っていても、知らない形として静かに落ちるだけで壊れない。
 *
 * - 6段の外(0 や 7)は級ではない → `LEVEL_OUT`
 * - 数字も綴りも無い(`"級外"` `"unknown"` `""`)→ `null`(分からない)
 *
 * **「範囲外」と「分からない」を混ぜない。** 混ぜると、辞書の取りこぼしと
 * 本当に級外の語が同じ見た目になり、どちらを直せばいいか分からなくなる。
 */
export function parseLevelStep(raw: string | number | null | undefined): LevelStep | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // CEFR の綴りを先に見る。"A1" は数字も持っているので、数字から先に
  // 読むと 1 級と取り違える。
  const cefr = s.toUpperCase().match(/\b([ABC])([12])\b/);
  if (cefr) {
    const band = LEVEL_BANDS.indexOf(cefr[1] as LevelBand);
    if (band >= 0) return (band * 2 + Number(cefr[2])) as LevelIndex;
  }
  // **マイナスを読まない。** `TOCFL-2` のハイフンは区切りであって符号では
  // ないので、`-?` を付けると 2級が -2 になり、丸ごと級外へ落ちる。
  const m = s.match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n)) return null;
  return (LEVEL_INDEXES as readonly number[]).includes(n) ? (n as LevelIndex) : LEVEL_OUT;
}

/** その段の名前(画面に出す文字)。級外は呼ぶ側が別に出す。 */
export function stepLabel(scale: LevelScale, index: LevelIndex): string {
  return scale.labels[index - 1] ?? String(index);
}

/** 段の高さ(0〜1)。1段目がいちばん低く、6段目がいちばん高い。 */
export function stepHeight(index: LevelIndex): number {
  const i = LEVEL_INDEXES.indexOf(index);
  // 一番低い段も**見える高さ**を持たせる。0 から始めると、1級の語で
  // 「段が無い」ように見える。
  return 0.35 + (0.65 * i) / (LEVEL_INDEXES.length - 1);
}

/** 段1つの横幅(px)。 */
export const STEP_WIDTH_BASE = 16;
/** 名前が1文字伸びるごとに広げる幅(px)。11px 太字の1文字ぶん。 */
const STEP_WIDTH_PER_CHAR = 6;

/**
 * 段1つの横幅。**その体系でいちばん長い名前が収まる幅**にする。
 *
 * TOCFL の名前は1文字(`1`〜`6`)だが、CEFR は2文字(`A1`〜`C2`)。
 * 16px に決め打ちすると、絵で見たとおり **`A1 A2` がくっついて読めなく
 * なる**(段の間の隙間は2pxしかない)。名前の長さから決めれば、
 * TOCFL は 16px のまま1ドットも動かず、CEFR だけが広がる。
 *
 * 文字数は `[...s]` で数える。`.length` だと将来 2桁の符号や合字が
 * 入ったときに数え間違える。
 */
export function stepWidth(scale: LevelScale): number {
  const longest = Math.max(...scale.labels.map((l) => [...l].length), 1);
  return STEP_WIDTH_BASE + (longest - 1) * STEP_WIDTH_PER_CHAR;
}

/** 色のトークン名(`src/styles.css` の `--level-*`)。素の16進を書かない。 */
export function stepColorVar(step: LevelStep): string {
  return step === LEVEL_OUT ? "var(--level-out)" : `var(--level-${step})`;
}

/** その段が属する帯。1-2=A / 3-4=B / 5-6=C。 */
export function bandOf(index: LevelIndex): LevelBand {
  return index <= 2 ? "A" : index <= 4 ? "B" : "C";
}

/** 帯に属する段(小さい順)。 */
export function stepsInBand(band: LevelBand): LevelIndex[] {
  return LEVEL_INDEXES.filter((i) => bandOf(i) === band);
}

/** 帯の名前の翻訳キー。 */
export function bandLabelKey(band: LevelBand): string {
  return `tocfl.band${band}`;
}

/**
 * CEFR → TOEFL iBT / IELTS のおおよその対応。
 *
 * オーナー承認済み(2026-08-24)「TOEFL と IELTS のレベル対応は CEFR 換算でいい」。
 *
 * **幅で出す。** 換算は公開されている対応表でも幅を持っていて、1点に
 * 決まる物ではない。1つの数字で出すと「その点を取れば B2」と読まれるが、
 * それは言い過ぎになる。
 *
 * A1 は TOEFL iBT にも IELTS にも対応する帯が無い(どちらも A2/B1 から)。
 * **無い所は無いと言う** — 埋めるために作り話をしない。
 */
export const CEFR_EXAM_MAP: Record<string, { toefl: string | null; ielts: string | null }> = {
  A1: { toefl: null, ielts: null },
  A2: { toefl: null, ielts: "3.0–3.5" },
  B1: { toefl: "42–71", ielts: "4.0–5.0" },
  B2: { toefl: "72–94", ielts: "5.5–6.5" },
  C1: { toefl: "95–120", ielts: "7.0–8.0" },
  C2: { toefl: null, ielts: "8.5–9.0" },
};

/** その段に添える検定の目盛り。CEFR 以外の体系では何も返さない。 */
export function examLabels(
  scale: LevelScale,
  index: LevelIndex,
): { toefl: string | null; ielts: string | null } {
  if (scale.id !== "CEFR") return { toefl: null, ielts: null };
  return CEFR_EXAM_MAP[stepLabel(scale, index)] ?? { toefl: null, ielts: null };
}

/**
 * 設定の「いまの級 / 目標の級」に並べる6つ。
 *
 * **保存する形と見せる形を1箇所で作る。** 以前この2つは、片方が
 * `.replace()` で作った表記、もう片方が手書きの6行で、同じ文字列を
 * 別々に作っていた(ずれても誰も気づかない形)。
 */
export function levelOptions(scale: LevelScale): { value: string; label: string }[] {
  return LEVEL_INDEXES.map((n) => ({
    value: scale.toStored(n),
    label: scale.optionLabel(stepLabel(scale, n)),
  }));
}
