import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * 自動で貯まる共有辞書 (2026-07-14):
 * ユーザーが何かをスキャン/キャッチするたび、AIが一度調べた読み・意味を
 * dictionary_entries に source='ai' で蓄積する。次に誰かが同じ語に出会うと
 * 辞書ヒット=AI呼び出しゼロで即表示(最速)+事前音声の対象にもなる。
 *
 * 品質ガード(憲法§2-1: 発音・意味の間違いは致命傷):
 * - insert-only(ON CONFLICT DO NOTHING)— verified行はもちろん、既存の
 *   AI行も上書きしない。後勝ちで悪化させない。
 * - source='ai' なので UI では常に「AI生成・未検証」バッジで表示される。
 *   管理画面で人が確認したものだけ verified に昇格できる。
 * - 高confidence・漢字のみ・読みと意味が揃っている候補だけ受け入れる。
 */

export type LexiconCandidate = {
  headword: string;
  zhuyin?: string | null;
  pinyin?: string | null;
  meaning_ja?: string | null;
  pos?: string | null;
  confidence?: number;
  taiwan_usage?: string | null;
  entry_type?: "word" | "phrase";
};

const CJK_ONLY = /^[㐀-鿿\u{20000}-\u{2FFFF}]{1,8}$/u;

export async function learnLexiconEntries(candidates: LexiconCandidate[]): Promise<void> {
  try {
    const rows = candidates
      .filter(
        (c) =>
          (c.confidence ?? 1) >= 0.8 &&
          CJK_ONLY.test(c.headword) &&
          !!c.zhuyin &&
          !!c.meaning_ja,
      )
      .map((c) => ({
        language: "zh-TW",
        headword: c.headword,
        zhuyin: c.zhuyin!,
        pinyin: c.pinyin || null,
        meaning_ja: c.meaning_ja!,
        pos: c.pos || null,
        taiwan_usage: c.taiwan_usage || null,
        source: "ai",
        entry_type: c.entry_type ?? "word",
      }));
    if (rows.length === 0) return;
    await supabaseAdmin
      .from("dictionary_entries")
      .upsert(rows as never, {
        onConflict: "language,headword,entry_type",
        ignoreDuplicates: true, // = DO NOTHING: 既存(特にverified)を絶対に触らない
      });
  } catch {
    // 蓄積はおまけ — 失敗してもスキャン本体を絶対に止めない。
  }
}
