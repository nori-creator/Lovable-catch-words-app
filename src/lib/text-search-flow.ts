/**
 * **文字で調べた語の流れ**の決め事（画面にもサーバにも依らない純粋な所）。
 *
 * オーナー指示 2026-10-08:
 * > 文字検索したときは検索ボタンを押したらその場でくるくるとロード中になり、ユーザーが
 * > 検索したものが学習言語ならそのままシールをはがす場面（シールを表示するときは必ず画像や
 * > 発音が表示されてから、画像も変更出来きるように。）に移行し、母語で一対一の関係ではなく、
 * > 複数の単語の候補がある場合（同じ日本でも台湾華語だと区別があったり一般でな言い方や
 * > 学術的な言い方など）は単語の候補を表示して。
 *
 * 1. 押したら検索の欄のまま回る（別の待ち画面を出さない）。
 * 2. 語を引く（`suggestWordCandidates`）。返事は候補と「打った語がもう学習言語か」。
 * 3. `decideTextSearch` が「そのまま剥がす」「候補を選ばせる」「見つからない」を決める。
 * 4. 剥がす札は**絵と発音がそろってから**出す（`peelReady`）。
 */
import { z } from "zod";
import { coerceTargetHeadword, isTargetHeadword } from "./target-language";
import type { QueryLang } from "./text-query-lang";

/**
 * 候補の**使われ方**の印。画面は表示言語の短い札に直す（`textPick.usage.*`）。
 * - `common` 一般的 / `colloquial` 口語 / `formal` 書き言葉・改まった / `academic` 学術・専門
 * - `local` その土地でよく使う（台湾華語なら「台湾でよく使う」）
 */
export const CANDIDATE_USAGES = ["common", "colloquial", "formal", "academic", "local"] as const;
export type CandidateUsage = (typeof CANDIDATE_USAGES)[number];

/** AI が返した印を直す。知らない値・空は `null`（札を出さない）。 */
export function normalizeUsage(raw: unknown): CandidateUsage | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if ((CANDIDATE_USAGES as readonly string[]).includes(v)) return v as CandidateUsage;
  if (/^(general|standard|neutral|everyday|一般)/.test(v)) return "common";
  if (/^(casual|informal|spoken|slang|口語|口语)/.test(v)) return "colloquial";
  if (/^(written|literary|polite|書面|书面)/.test(v)) return "formal";
  if (/^(technical|scientific|specialist|professional|學術|学術|学术|專業)/.test(v))
    return "academic";
  if (/^(taiwan|regional|台灣|台湾)/.test(v)) return "local";
  return null;
}

/** 生成の形（`suggestWordCandidates`）。足りない欄は空で受ける — 形が崩れても0件にしない。 */
export const WordCandidatesSchema = z.object({
  /**
   * 打った語が**もう学習言語の語か**（「蓮藕」「貓」）。漢字だけの語は手元で見分けられない
   * （「電車」「猫」）ので、ここで AI に判定させる。言わなかった回は `null`。
   */
  query_is_target: z.boolean().nullable().optional(),
  candidates: z
    .array(
      z.object({
        headword: z.string(),
        reading_zhuyin: z.string().default(""),
        pinyin: z.string().default(""),
        meaning_ja: z.string().default(""),
        /** 他の候補との**違い**を一言で(例: トイレに置く方)。 */
        distinction: z.string().default(""),
        /** 使われ方（`CANDIDATE_USAGES`）。知らない値は捨てる。 */
        usage: z.string().nullable().optional(),
        /** 画像検索用の短い英語（札の絵を探す。`heroSearchQuery` が整える）。 */
        image_query: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

/** 画面へ返す候補の1つ。 */
export type TextCandidate = {
  headword: string;
  reading_zhuyin: string;
  pinyin: string;
  meaning_ja: string;
  distinction: string;
  usage: CandidateUsage | null;
  image_query: string;
};

export type TextSearchDecision =
  | { kind: "peel"; pick: TextCandidate; via: "target" | "single" }
  | { kind: "choose"; candidates: TextCandidate[] }
  | { kind: "none" };

/** 並べる候補の上限（多すぎると選べない）。 */
export const MAX_TEXT_CANDIDATES = 5;

/**
 * 語を引いた返事から、次に何をするかを決める。
 *
 * - 打った語が**学習言語**（手元の判定が `target`、または `ambiguous` で AI が「学習言語」と言った）
 *   → 候補を並べず、**打った語そのもの**を剥がす札へ（読み・意味は同じ語の候補から借りる）。
 *   手元で `native` と分かった語（かな・新字体）は、AI が何と言っても母語として扱う。
 * - 母語で、使える候補が1つ → そのまま剥がす札へ（選ぶ物が1つの画面は出さない）。
 * - 2つ以上 → 選ばせる（最大 `MAX_TEXT_CANDIDATES`）。
 * - 0 → 見つからない（打った語のまま札を作らない — 見出しが母語のまま残る）。
 */
export function decideTextSearch(input: {
  query: string;
  local: QueryLang;
  queryIsTarget: boolean | null | undefined;
  candidates: readonly TextCandidate[];
  targetLanguage: string;
}): TextSearchDecision {
  const query = input.query.trim();
  const usable = dedupeCandidates(input.candidates, input.targetLanguage);
  const isTarget =
    input.local === "target" || (input.local === "ambiguous" && input.queryIsTarget === true);
  if (isTarget && isTargetHeadword(query, input.targetLanguage)) {
    const same = usable.find((c) => c.headword === query);
    return {
      kind: "peel",
      via: "target",
      pick: same ?? {
        headword: query,
        reading_zhuyin: "",
        pinyin: "",
        meaning_ja: "",
        distinction: "",
        usage: null,
        image_query: "",
      },
    };
  }
  if (usable.length === 0) return { kind: "none" };
  if (usable.length === 1) return { kind: "peel", via: "single", pick: usable[0] };
  return { kind: "choose", candidates: usable.slice(0, MAX_TEXT_CANDIDATES) };
}

/** 学習言語の見出しとして通る物だけ、同じ語は1つに。 */
export function dedupeCandidates(
  items: readonly TextCandidate[],
  targetLanguage: string,
): TextCandidate[] {
  const out: TextCandidate[] = [];
  const seen = new Set<string>();
  for (const c of items) {
    const head = coerceTargetHeadword(c.headword, targetLanguage);
    if (!head || seen.has(head)) continue;
    seen.add(head);
    out.push({ ...c, headword: head });
  }
  return out;
}

/** 剥がす札を出すまでに待つ上限（ms）。これを過ぎたら、そろった物で出す。 */
export const PEEL_READY_MAX_WAIT_MS = 9000;

/**
 * **剥がす札を出してよいか。** 絵（撮った写真、またはネットの画像を探し終えた）と、
 * 発音（音が届いた・取れないと分かった）と、読みの載ったカードがそろってから。
 * 上限を過ぎたら、そろった物で出す（語を組んだ札・読みの文字だけ）— 待たせ続けない。
 */
export function peelReady(s: {
  hasCard: boolean;
  /** 札の絵が決まったか（写真がある・ネットの画像を探し終えた）。 */
  imageSettled: boolean;
  speech: "none" | "loading" | "ready" | "failed";
  /** 待ち始めてからの時間。 */
  waitedMs: number;
}): boolean {
  if (!s.hasCard) return false;
  if (s.waitedMs >= PEEL_READY_MAX_WAIT_MS) return true;
  const speechDone = s.speech === "ready" || s.speech === "failed";
  return s.imageSettled && speechDone;
}
