/**
 * 辞書の取り込みで、**言語が混ざらないことを構造で保証する**。
 *
 * ## なぜ要るか
 * オーナーは Supabase に直接触れないので、辞書は**設定の中の取り込み欄**から
 * 入れる。ところがその server（`importDictionaryEntries`）は
 * `language: DEFAULT_TARGET_LANGUAGE` を**決め打っていた**。
 * つまり英語の CSV を貼っても、**台湾華語として入る**。
 *
 * オーナー指示（2026-08-25）:
 * > 「決して英語と台湾華語混ざらないようにやり方を考えて。」
 *
 * ## 「気をつける」で守らない
 * 人が言語を選び間違えることは必ずある。だから**選んだ言語と中身が
 * 食い違ったら、その行を落として数を報告する**。
 *
 * 判定は `target-profile.ts` の `headwordOk` を使う。これは既に
 *
 *   台湾華語 … 漢字を含み、かな・欧文を含まない
 *   英語     … ラテン文字**だけ**でできている
 *
 * と決めてあるので、**繁体字が英語の取り込みを通ることも、
 * 英語の語が台湾華語の取り込みを通ることも、起こり得ない**。
 * 新しい言語を足したときも、その言語の `headwordOk` を書けば自動で効く。
 *
 * ## 落とした行は黙って捨てない
 * 数と、最初のいくつかの実例を返す。25,000行を貼って「12,000件入りました」
 * とだけ出ると、**何が落ちたのか分からないまま半分だけ入った辞書**が残る。
 *
 * 外の世界に触れるものをここに入れないこと。
 */

import { normalizeTargetLanguage, type TargetLanguage } from "./target-lang";
import { targetProfile } from "./target-profile";

/** 取り込む1行（言語に依らない形）。 */
export type DictionaryImportRow = {
  headword: string;
  /** 読み（台湾華語=注音 / 英語=米式IPA）。 */
  reading_primary?: string | null;
  /** 第二の読み（台湾華語=拼音 / 英語=英式IPA）。 */
  reading_alt?: string | null;
  /** 読む人の言語ごとの意味。鍵は表示言語（日本語 / 英語 / 繁體中文）。 */
  meanings?: Record<string, string> | null;
  /** 【旧】日本語の意味。台湾華語の古い取り込みが使う。 */
  meaning_ja?: string | null;
  pos?: string | null;
  /** 級（1〜6）。どの体系かは言語で決まる（TOCFL / CEFR）。 */
  level_step?: number | null;
  /** 【旧】TOCFL の級。 */
  tocfl_level?: number | null;
  /** 頻度の順位。小さいほどよく使う。 */
  freq_rank?: number | null;
  /** 検定の印（toefl / ielts / gre …）。 */
  exam_tags?: string[] | null;
  /** 活用（英語）。 */
  forms?: Record<string, string> | null;
  /** 使われ方。common / written / spoken / rare。 */
  usage_register?: string | null;
  /** 【旧】台湾での使われ方。 */
  taiwan_usage?: string | null;
  source?: string | null;
  entry_type?: string | null;
  scene_tags?: string[] | null;
  notes?: string | null;
};

/** なぜその行を落としたか。 */
export type RejectReason =
  /** 見出し語が空。 */
  | "empty"
  /** **選んだ言語の見出し語ではない**（これが混ざるのを止める門）。 */
  | "wrong_language"
  /** 意味が1つも無い。 */
  | "no_meaning"
  /** 級が6段の外。 */
  | "bad_level";

export type Rejected = { row: number; headword: string; reason: RejectReason };

export type Partitioned = {
  language: TargetLanguage;
  ok: DictionaryImportRow[];
  rejected: Rejected[];
};

/** その行に意味が1つでも入っているか。 */
export function hasMeaning(row: DictionaryImportRow): boolean {
  if (row.meaning_ja && row.meaning_ja.trim()) return true;
  const m = row.meanings ?? {};
  return Object.values(m).some((v) => typeof v === "string" && v.trim() !== "");
}

/** 級が6段の中か（無いのは通す — 級が分からない語は普通に在る）。 */
export function levelOk(row: DictionaryImportRow): boolean {
  for (const v of [row.level_step, row.tocfl_level]) {
    if (v == null) continue;
    if (!Number.isInteger(v) || v < 1 || v > 6) return false;
  }
  return true;
}

/**
 * **選んだ言語に合う行だけを通す。**
 *
 * ここが「混ざらない」の本体。呼ぶ側（server）は `ok` だけを書き込み、
 * `rejected` を必ず利用者に見せること。
 */
export function partitionByLanguage(
  rows: readonly DictionaryImportRow[],
  rawLanguage: string | null | undefined,
): Partitioned {
  const language = normalizeTargetLanguage(rawLanguage);
  const profile = targetProfile(language);
  const ok: DictionaryImportRow[] = [];
  const rejected: Rejected[] = [];

  rows.forEach((row, i) => {
    // CSV のヘッダー行のぶんを足して、人が数える行番号に合わせる。
    const at = i + 2;
    const headword = (row.headword ?? "").trim();
    if (!headword) {
      rejected.push({ row: at, headword: "", reason: "empty" });
      return;
    }
    // **ここが門。** 繁体字は英語の取り込みを通らないし、
    // 英語の語は台湾華語の取り込みを通らない。
    if (!profile.headwordOk(headword)) {
      rejected.push({ row: at, headword, reason: "wrong_language" });
      return;
    }
    if (!hasMeaning(row)) {
      rejected.push({ row: at, headword, reason: "no_meaning" });
      return;
    }
    if (!levelOk(row)) {
      rejected.push({ row: at, headword, reason: "bad_level" });
      return;
    }
    ok.push({ ...row, headword });
  });

  return { language, ok, rejected };
}

/** 落ちた理由を人の言葉で（翻訳キー）。 */
export const REJECT_REASON_KEYS: Record<RejectReason, string> = {
  empty: "admin.rejectEmpty",
  wrong_language: "admin.rejectWrongLanguage",
  no_meaning: "admin.rejectNoMeaning",
  bad_level: "admin.rejectBadLevel",
};
