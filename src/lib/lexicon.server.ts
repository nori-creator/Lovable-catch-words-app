import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getAi } from "./ai-provider.server";

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

// ============================================================================
// 自己改善システム (2026-07-14): アプリは毎日1回、自分で勉強と点検をする。
//  1) runLexiconAudit  — 辞書からランダム抽出してAIが正確性を再検証。
//     AI由来エントリは高確信の修正のみ自動適用、verified行は人間レビュー用に
//     フラグだけ(憲法§2-1: 検証済みデータを機械が書き換えない)。
//  2) ingestCorpusFromNews — 台湾ニュースRSSの見出しを観察し、辞書照合の
//     分かち書きで語の出現頻度だけを corpus_stats に蓄積(本文は保存しない)。
//  トリガーはユーザーの最初のスキャン(サーバー側fire-and-forget)。
//  = ユーザーが1人でも使えば毎日自動で賢くなる。手動実行は管理画面から。
// ============================================================================

const AuditSchema = z.object({
  verdicts: z.array(
    z.object({
      headword: z.string(),
      ok: z.boolean(),
      zhuyin: z.string().default(""),
      pinyin: z.string().default(""),
      meaning_ja: z.string().default(""),
      note: z.string().default(""),
      confidence: z.number().min(0).max(1).default(0.5),
    }),
  ),
});

type LexRow = {
  id: string;
  headword: string;
  zhuyin: string | null;
  pinyin: string | null;
  meaning_ja: string;
  pos: string | null;
  source: string;
};

/** uuidの一様性を使ったランダムサンプリング(order by random() の代替)。 */
async function sampleEntries(source: string, n: number): Promise<LexRow[]> {
  const pivot = crypto.randomUUID();
  const sel = "id, headword, zhuyin, pinyin, meaning_ja, pos, source";
  const { data: a } = await supabaseAdmin
    .from("dictionary_entries")
    .select(sel)
    .eq("language", "zh-TW")
    .eq("source", source)
    .gte("id", pivot)
    .limit(n);
  if ((a?.length ?? 0) >= n) return (a ?? []) as LexRow[];
  const { data: b } = await supabaseAdmin
    .from("dictionary_entries")
    .select(sel)
    .eq("language", "zh-TW")
    .eq("source", source)
    .lt("id", pivot)
    .limit(n - (a?.length ?? 0));
  return [...((a ?? []) as LexRow[]), ...((b ?? []) as LexRow[])];
}

export async function runLexiconAudit(
  batch = 10,
): Promise<{ checked: number; fixed: number; flagged: number }> {
  // AI由来を重点的に、verifiedも毎回2件は抜き打ち(公式データの誤植検知)。
  const [aiRows, verifiedRows] = await Promise.all([
    sampleEntries("ai", Math.max(1, batch - 2)),
    sampleEntries("verified", 2),
  ]);
  const rows = [...aiRows, ...verifiedRows];
  if (rows.length === 0) return { checked: 0, fixed: 0, flagged: 0 };

  const ai = getAi();
  const listing = rows
    .map(
      (r, i) =>
        `${i + 1}. 「${r.headword}」 注音: ${r.zhuyin ?? "?"} / 拼音: ${r.pinyin ?? "?"} / 意味: ${r.meaning_ja} / 品詞: ${r.pos ?? "?"}`,
    )
    .join("\n");
  const { experimental_output } = (await generateText({
    model: ai.gateway(ai.modelRich),
    prompt: `あなたは台湾華語(zh-TW・台湾教育部準拠)の辞書校閲者です。以下の辞書エントリを1件ずつ検証してください。

${listing}

各エントリについて:
- ok: 注音・拼音・日本語の意味がすべて正確なら true
- 誤りがある場合のみ、正しい zhuyin / pinyin / meaning_ja を埋める(正しい項目は空文字)
- note: 何が誤りかを日本語で1文(okなら空文字)
- confidence: あなたの判定への確信度 0〜1。少しでも迷いがあれば 0.7 未満にする
- 大陸中国の発音・簡体字・大陸語彙を「正」としない。台湾の標準を基準にする
- headword は入力と同じ文字列をそのまま返す`,
    experimental_output: Output.object({ schema: AuditSchema }) as never,
  })) as unknown as { experimental_output: z.infer<typeof AuditSchema> };

  let fixed = 0;
  let flagged = 0;
  const byHead = new Map(rows.map((r) => [r.headword, r]));
  for (const v of experimental_output.verdicts) {
    const row = byHead.get(v.headword);
    if (!row) continue;
    let applied = false;
    if (!v.ok && row.source === "ai" && v.confidence >= 0.85) {
      // AI由来のみ、確信の高い修正を自動適用(監査AIはrichモデル)。
      const patch: { zhuyin?: string; pinyin?: string; meaning_ja?: string } = {};
      if (v.zhuyin) patch.zhuyin = v.zhuyin;
      if (v.pinyin) patch.pinyin = v.pinyin;
      if (v.meaning_ja) patch.meaning_ja = v.meaning_ja;
      if (Object.keys(patch).length > 0) {
        const { error } = await supabaseAdmin
          .from("dictionary_entries")
          .update(patch)
          .eq("id", row.id)
          .eq("source", "ai");
        applied = !error;
        if (applied) fixed += 1;
      }
    } else if (!v.ok) {
      flagged += 1; // verified行・低確信 → 人間レビュー待ち(管理画面に表示)
    }
    await supabaseAdmin.from("lexicon_audits").insert({
      entry_id: row.id,
      headword: row.headword,
      source: row.source,
      ok: v.ok,
      confidence: v.confidence,
      suggestion: v.ok
        ? null
        : ({ zhuyin: v.zhuyin, pinyin: v.pinyin, meaning_ja: v.meaning_ja, note: v.note } as never),
      applied,
    });
  }
  return { checked: rows.length, fixed, flagged };
}

/**
 * 独自コーパス: 台湾ニュースRSSの「見出しだけ」を観察し、辞書照合の最長一致で
 * 分かち書きして語の出現回数を蓄積する。記事本文・見出し原文は保存しない
 * (頻度という事実の統計のみ)ため著作権的に安全。
 */
export async function ingestCorpusFromNews(): Promise<{ titles: number; words: number }> {
  // 複数ソースで観察(1つ落ちても他で学ぶ)。見出しのみ取得・原文は保存しない。
  const feeds = [
    "https://news.google.com/rss?hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    "https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    "https://news.pts.org.tw/xml/newsfeed.xml", // 公視(台湾公共メディア)
  ];
  const titles: string[] = [];
  for (const url of feeds) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "CatchwordsCorpusBot/1.0" } });
      if (!res.ok) continue;
      const xml = await res.text();
      const matches = xml.match(/<title>(?:<!\[CDATA\[)?([^<[\]]+)/g) ?? [];
      for (const m of matches.slice(1, 120)) {
        const t = m.replace(/<title>(?:<!\[CDATA\[)?/, "").trim();
        if (t) titles.push(t);
      }
    } catch {
      /* feed down — 明日また来る */
    }
  }
  if (titles.length === 0) return { titles: 0, words: 0 };

  // 辞書の全見出し語をロードして最長一致セグメンテーション
  const heads = new Set<string>();
  let maxLen = 2;
  for (let from = 0; ; from += 1000) {
    const { data } = await supabaseAdmin
      .from("dictionary_entries")
      .select("headword")
      .eq("language", "zh-TW")
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      heads.add(r.headword);
      if (r.headword.length > maxLen) maxLen = Math.min(r.headword.length, 6);
    }
    if (data.length < 1000) break;
  }

  const counts = new Map<string, number>();
  const runs = titles.join("\n").match(/[一-鿿]+/gu) ?? [];
  for (const run of runs) {
    let i = 0;
    while (i < run.length) {
      let step = 1;
      for (let L = Math.min(maxLen, run.length - i); L >= 2; L--) {
        const w = run.slice(i, i + L);
        if (heads.has(w)) {
          counts.set(w, (counts.get(w) ?? 0) + 1);
          step = L;
          break;
        }
      }
      i += step; // 1文字語はノイズが多いのでv1では数えない
    }
  }

  const day = new Date().toISOString().slice(0, 10);
  const words = [...counts.entries()];
  // 同日再実行に耐えるよう既存カウントへ加算
  const existing = new Map<string, number>();
  const list = words.map(([w]) => w);
  for (let i = 0; i < list.length; i += 200) {
    const { data } = await supabaseAdmin
      .from("corpus_stats")
      .select("word, count")
      .eq("day", day)
      .eq("source", "news")
      .in("word", list.slice(i, i + 200));
    for (const r of data ?? []) existing.set(r.word, r.count);
  }
  const rowsUp = words.map(([w, c]) => ({
    word: w,
    day,
    source: "news",
    count: c + (existing.get(w) ?? 0),
  }));
  for (let i = 0; i < rowsUp.length; i += 500) {
    await supabaseAdmin
      .from("corpus_stats")
      .upsert(rowsUp.slice(i, i + 500), { onConflict: "word,day,source" });
  }
  return { titles: titles.length, words: rowsUp.length };
}

/**
 * 1日1回の自己改善(監査+コーパス観察)。トリガーは誰かの最初のスキャン。
 * usage_events(kind='self_improve')で20時間スロットル。失敗しても
 * アプリ本体には絶対に影響しない。コスト: richコール1回/日(≈0.5円)。
 */
export async function maybeRunDailySelfImprovement(userId: string): Promise<void> {
  try {
    const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("kind", "self_improve")
      .gte("created_at", since);
    if ((count ?? 0) > 0) return;
    await supabaseAdmin.from("usage_events").insert({ user_id: userId, kind: "self_improve" });
    await Promise.allSettled([runLexiconAudit(10), ingestCorpusFromNews()]);
  } catch {
    /* 自己改善は本体を絶対に止めない */
  }
}
