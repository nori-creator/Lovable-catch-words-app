/**
 * 生成に渡す**級の指示文**を、学習言語ごとに組む。
 *
 * ## なぜ切り出したか
 * この文は `ai-provider.server.ts` の中に、TOCFL の帯の説明を6行
 * 直に書いた形で埋まっていた。英語を選べるようにした日(2026-08-25、
 * 第4段)から、**英語の学習者に「TOCFL 準備級・注音」の話が渡る**。
 * AI は言われたとおりに従うので、英語のカードに華語の級の話が混ざる。
 * しかも画面には出ないので、**出来上がった中身を読むまで気づけない**。
 *
 * server の中に置いたままだと試験から触れないので、純粋な物として出す。
 *
 * ## 英語側は CEFR-J の文法項目を実際に並べる
 * 「B1 相当で」とだけ書くと、モデルごとに解釈が揺れる。CEFR-J
 * Grammar Profile(第B段で入れた256項目)が「その級までに出てよい型」を
 * 名指しで持っているので、**その名前をそのまま渡す**。
 * 出典: 投野由紀夫研究室(東京外国語大学)。
 *
 * 外の世界に触れるものをここに入れないこと。
 */

import {
  LEVEL_INDEXES,
  parseLevelStep,
  stepLabel,
  type LevelIndex,
  type LevelScale,
} from "./level-scale";
import { grammarAtOrBelow } from "./grammar-profile";

/**
 * 段ごとの中身の説明。**体系ごとに別に持つ。**
 *
 * 「レベルに合わせて」だけではモデルが解釈を揺らすので、
 * 語彙量・文法・話題まで書き下して再現性を持たせる。
 */
const TOCFL_BANDS: Record<LevelIndex, string> = {
  1: "入門級(準備級1級・語彙約500語)。基本文型 是/有/在、SVO、簡単な疑問詞。",
  2: "基礎級(準備級2級・語彙約1000語)。了/過/在〜、比較句、能願動詞(會/能/可以)。",
  3: "進階級(第1級・語彙約2500語)。把構文、被構文、複文(因為…所以)、程度補語。",
  4: "高階級(第2級・語彙約5000語)。方向補語・可能補語、書面語彙、接続詞の使い分け。",
  5: "流利級(第3級・語彙約8000語)。成語・慣用句、抽象的な議論、書面体。",
  6: "精通級(第4級・語彙約8000語超)。専門的・文学的表現、含意の強い言い回し。",
};

/**
 * CEFR の段。**語彙量は CEFR-J Wordlist の規模に合わせた概数**で、
 * 公式の数字ではない(公式は語数を定めていない)。
 *
 * C1/C2 に CEFR-J の文法項目は無い(CEFR-J は B2 まで)。
 * **無い所は無いと言う** — 埋めるために作り話をしない。
 */
const CEFR_BANDS: Record<LevelIndex, string> = {
  1: "A1(語彙約1000語)。be動詞・一般動詞の現在、複数形、a/an と the、簡単な疑問文。",
  2: "A2(語彙約2000語)。過去形、be going to、比較級・最上級、助動詞(can/must)、頻度の副詞。",
  3: "B1(語彙約4000語)。現在完了、関係代名詞、受動態、不定詞・動名詞、条件文(if)。",
  4: "B2(語彙約6000語)。過去完了、仮定法、分詞構文、複雑な関係節、談話標識。",
  5: "C1(語彙約8000語)。抽象的・専門的な話題、含意やニュアンスの差、書き言葉の言い回し。",
  6: "C2(語彙約8000語超)。母語話者に近い含意・文体の操作、比喩・慣用表現。",
};

const BANDS: Record<string, Record<LevelIndex, string>> = {
  TOCFL: TOCFL_BANDS,
  CEFR: CEFR_BANDS,
};

/** 段の説明。知らない体系・読めない段は既定の段(2)に落とす。 */
export function bandDescription(scale: LevelScale, index: LevelIndex): string {
  const table = BANDS[scale.id] ?? TOCFL_BANDS;
  return table[index] ?? table[2];
}

/**
 * その級までに出てよい文法項目を、名前で並べた一言。
 *
 * CEFR 以外の体系では**何も返さない**。CEFR-J は英語の文法の表なので、
 * 華語の級に当てると全く別の言語の型を渡すことになる。
 *
 * 項目は多いので(B2 まで256個)、名前だけを読点で繋ぐ。
 * `limit` を超える分は落として「ほか N 項目」と言う — プロンプトが
 * 長くなるほど、他の指示の効きが薄くなる。
 */
export function grammarAllowance(scale: LevelScale, index: LevelIndex, limit = 40): string {
  if (scale.id !== "CEFR") return "";
  const items = grammarAtOrBelow(index);
  if (items.length === 0) return "";
  const shown = items.slice(0, limit).map((g) => g.ja);
  const rest = items.length - shown.length;
  const tail = rest > 0 ? `、ほか${rest}項目` : "";
  return (
    `この級までに出てよい文法(CEFR-J Grammar Profile / 投野由紀夫研究室): ` +
    `${shown.join("、")}${tail}。**これより上の型は使わない。**`
  );
}

/**
 * 生成に渡す級の指示文をまるごと組む。
 *
 * `current` / `goal` は保存されている形(`"TOCFL-2"` / `"B1"`)で受ける。
 * 読めない値は既定の段に落とす — **未知の級のまま生成させない**。
 */
export function levelRuleText(
  scale: LevelScale,
  current: string,
  goal: string,
  vocabAuthority: string,
): string {
  const goalIndex = indexOf(goal, 2);
  const currentIndex = indexOf(current, Math.max(1, goalIndex - 1) as LevelIndex);
  const currentName = `${scale.id} ${stepLabel(scale, currentIndex)}`;
  const goalName = `${scale.id} ${stepLabel(scale, goalIndex)}`;
  const grammar = grammarAllowance(scale, goalIndex);
  return (
    `学習者の現在レベル: ${currentName}、目標レベル: ${goalName}。` +
    `目標レベルの目安 — ${bandDescription(scale, goalIndex)} ` +
    `**語彙・文法・話題は必ずこの範囲に収める**。${vocabAuthority}に無いような難語や、` +
    `目標級より上の文法は使わない。どうしても必要なときだけ短い注釈を添える。` +
    `例文は現在レベル(${currentName})でも読めることを優先する。` +
    (grammar ? ` ${grammar}` : "")
  );
}

/** 保存されている級から段を読む。6段の外・読めない物は `fallback`。 */
function indexOf(raw: string | null | undefined, fallback: LevelIndex): LevelIndex {
  const step = parseLevelStep(raw);
  return typeof step === "number" && (LEVEL_INDEXES as readonly number[]).includes(step)
    ? (step as LevelIndex)
    : fallback;
}
