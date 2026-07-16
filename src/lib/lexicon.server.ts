import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { generateStructured, getAi } from "./ai-provider.server";

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
  const audit = await generateStructured({
    model: ai.gateway(ai.modelRich),
    schema: AuditSchema,
    prompt: `あなたは台湾華語(zh-TW・台湾教育部準拠)の辞書校閲者です。以下の辞書エントリを1件ずつ検証してください。

${listing}

各エントリについて:
- ok: 注音・拼音・日本語の意味がすべて正確なら true
- 誤りがある場合のみ、正しい zhuyin / pinyin / meaning_ja を埋める(正しい項目は空文字)
- note: 何が誤りかを日本語で1文(okなら空文字)
- confidence: あなたの判定への確信度 0〜1。少しでも迷いがあれば 0.7 未満にする
- 大陸中国の発音・簡体字・大陸語彙を「正」としない。台湾の標準を基準にする
- headword は入力と同じ文字列をそのまま返す`,
  });

  let fixed = 0;
  let flagged = 0;
  const byHead = new Map(rows.map((r) => [r.headword, r]));
  for (const v of audit.verdicts) {
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

// ---- コーパス共通ヘルパー ----------------------------------------------------

async function loadHeadwordSet(): Promise<{ heads: Set<string>; maxLen: number }> {
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
  return { heads, maxLen };
}

/**
 * 文単位の分析: 最長一致の分かち書きで
 *  - counts: 語の出現回数(頻度ランキングの元)
 *  - pairs:  同じ文に現れた語の組(共起=「どの単語と一緒に使われるか」の元)
 *  - unknowns: 辞書に無い連続漢字(2〜4字)=新語候補
 */
function analyzeTexts(
  texts: string[],
  heads: Set<string>,
  maxLen: number,
): { counts: Map<string, number>; pairs: Map<string, number>; unknowns: Map<string, number> } {
  const counts = new Map<string, number>();
  const pairs = new Map<string, number>();
  const unknowns = new Map<string, number>();
  for (const text of texts) {
    const found = new Set<string>();
    for (const run of text.match(/[一-鿿]+/gu) ?? []) {
      let i = 0;
      let unkStart = -1;
      const flushUnknown = (end: number) => {
        if (unkStart < 0) return;
        const u = run.slice(unkStart, end);
        if (u.length >= 2 && u.length <= 4) unknowns.set(u, (unknowns.get(u) ?? 0) + 1);
        unkStart = -1;
      };
      while (i < run.length) {
        let step = 0;
        for (let L = Math.min(maxLen, run.length - i); L >= 2; L--) {
          const w = run.slice(i, i + L);
          if (heads.has(w)) {
            counts.set(w, (counts.get(w) ?? 0) + 1);
            found.add(w);
            step = L;
            break;
          }
        }
        if (step === 0) {
          if (unkStart < 0) unkStart = i;
          i += 1; // 1文字語はノイズが多いので数えない
        } else {
          flushUnknown(i);
          i += step;
        }
      }
      flushUnknown(run.length);
    }
    // 共起: 同一文の語ペア(組合せ爆発を防ぐため12語まで)
    const ws = [...found].slice(0, 12);
    for (let a = 0; a < ws.length; a++) {
      for (let b = a + 1; b < ws.length; b++) {
        const [x, y] = ws[a] < ws[b] ? [ws[a], ws[b]] : [ws[b], ws[a]];
        const key = `${x} ${y}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
  }
  return { counts, pairs, unknowns };
}

/** 同日再実行でも加算になるよう、既存カウントへ足し込んで upsert する。 */
async function addCorpusCounts(day: string, source: string, counts: Map<string, number>): Promise<number> {
  const words = [...counts.entries()];
  if (words.length === 0) return 0;
  const existing = new Map<string, number>();
  const list = words.map(([w]) => w);
  for (let i = 0; i < list.length; i += 200) {
    const { data } = await supabaseAdmin
      .from("corpus_stats")
      .select("word, count")
      .eq("day", day)
      .eq("source", source)
      .in("word", list.slice(i, i + 200));
    for (const r of data ?? []) existing.set(r.word, r.count);
  }
  const rows = words.map(([w, c]) => ({ word: w, day, source, count: c + (existing.get(w) ?? 0) }));
  for (let i = 0; i < rows.length; i += 500) {
    await supabaseAdmin.from("corpus_stats").upsert(rows.slice(i, i + 500), { onConflict: "word,day,source" });
  }
  return rows.length;
}

async function addCorpusPairs(day: string, source: string, pairs: Map<string, number>): Promise<number> {
  const top = [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 400);
  if (top.length === 0) return 0;
  const { data: existingRows } = await supabaseAdmin
    .from("corpus_pairs")
    .select("word_a, word_b, count")
    .eq("day", day)
    .eq("source", source)
    .limit(2000);
  const existing = new Map<string, number>();
  for (const r of existingRows ?? []) existing.set(`${r.word_a} ${r.word_b}`, r.count);
  const rows = top.map(([key, c]) => {
    const [word_a, word_b] = key.split(" ");
    return { word_a, word_b, day, source, count: c + (existing.get(key) ?? 0) };
  });
  for (let i = 0; i < rows.length; i += 500) {
    await supabaseAdmin
      .from("corpus_pairs")
      .upsert(rows.slice(i, i + 500), { onConflict: "word_a,word_b,day,source" });
  }
  return rows.length;
}

// ---- ③ 観察: ニュース見出し → 独自コーパス ---------------------------------

export type NewsIngestResult = {
  titles: number;
  words: number;
  pairs: number;
  unknown_candidates: string[];
  feeds: Array<{ url: string; status: number | string; titles: number }>;
};

/**
 * 台湾ニュースRSSの「見出しだけ」を観察し、頻度・共起・新語候補を蓄積する。
 * 原文は保存しない(統計のみ)。フィード別のHTTPステータスを返すので、
 * ブロックされたフィードが管理画面で一目で分かる。
 */
export async function ingestCorpusFromNews(): Promise<NewsIngestResult> {
  const feeds = [
    "https://news.google.com/rss?hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    "https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    "https://news.pts.org.tw/xml/newsfeed.xml", // 公視
    "https://news.ltn.com.tw/rss/all.xml", // 自由時報
    "https://feeds.feedburner.com/rsscna/politics", // 中央社
  ];
  const titles: string[] = [];
  const feedStatus: NewsIngestResult["feeds"] = [];
  for (const url of feeds) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; CatchwordsBot/1.0; +https://word-snap-journey.lovable.app)",
          Accept: "application/rss+xml, application/xml, text/xml, */*",
        },
      });
      let n = 0;
      if (res.ok) {
        const xml = await res.text();
        const matches = xml.match(/<title>(?:<!\[CDATA\[)?([^<[\]]+)/g) ?? [];
        for (const m of matches.slice(1, 120)) {
          const t = m.replace(/<title>(?:<!\[CDATA\[)?/, "").trim();
          if (t) {
            titles.push(t);
            n += 1;
          }
        }
      }
      feedStatus.push({ url, status: res.status, titles: n });
    } catch (e) {
      feedStatus.push({ url, status: (e as Error).message.slice(0, 60), titles: 0 });
    }
  }
  if (titles.length === 0) {
    return { titles: 0, words: 0, pairs: 0, unknown_candidates: [], feeds: feedStatus };
  }

  const { heads, maxLen } = await loadHeadwordSet();
  const { counts, pairs, unknowns } = analyzeTexts(titles, heads, maxLen);
  const day = new Date().toISOString().slice(0, 10);
  const words = await addCorpusCounts(day, "news", counts);
  const pairCount = await addCorpusPairs(day, "news", pairs);
  // 2回以上出た未知語だけを新語候補としてAI検証(synthステップ)へ渡す
  const unknownCandidates = [...unknowns.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([w]) => w);
  return { titles: titles.length, words, pairs: pairCount, unknown_candidates: unknownCandidates, feeds: feedStatus };
}

// ---- ④ AI合成コーパス: AIが「台湾人の今日の言葉」を毎日生成 -------------------

const SynthSchema = z.object({
  sentences: z
    .array(z.object({ text: z.string(), register: z.string().default("") }))
    .max(60),
  new_words: z
    .array(
      z.object({
        word: z.string(),
        zhuyin: z.string().default(""),
        pinyin: z.string().default(""),
        meaning_ja: z.string().default(""),
        pos: z.string().default(""),
        usage: z.string().default(""),
      }),
    )
    .max(20),
});

const SYNTH_SCENES = [
  "夜市・屋台での注文と会話",
  "MRT・バスでの移動",
  "Dcard/Threads風のSNS投稿(若者の口語)",
  "LINEでの友達とのチャット(略語・スラングOK)",
  "職場・学校での雑談",
  "コンビニ・スーパーでの買い物",
  "天気・季節・台風の雑談",
];

/**
 * ニュースでは拾えない「日常・SNSの生きた台湾華語」をAIに毎日生成させ、
 * 頻度(source='ai_synth')・共起・新語(辞書未収録の口語/流行語)を蓄積する。
 * ニュース由来の新語候補もここでまとめて検証する。AI生成データは実測と
 * 別ソースで管理し、UIでも区別する(憲法§2-1)。
 */
export async function generateSyntheticCorpus(
  candidateWords: string[] = [],
): Promise<{ sentences: number; words: number; pairs: number; new_words: number }> {
  const ai = getAi();
  const dayIdx = Math.floor(Date.now() / 86400000);
  const scenes = [0, 1, 2].map((k) => SYNTH_SCENES[(dayIdx + k * 2) % SYNTH_SCENES.length]);

  const out = await generateStructured({
    model: ai.gateway(ai.modelRich),
    schema: SynthSchema,
    prompt: `あなたは台湾(台北)在住のネイティブです。今日、台湾人が実際に書いたり話したりしそうな自然な短文を40個生成してください。

シーン(均等に): ${scenes.join(" / ")}

要件:
- 台湾華語(繁体字・台湾語彙・注音文化圏の口語)。大陸語彙は使わない
- SNS風の文には実際に使われる口語・流行語・スラングを自然に混ぜる
- 各文は10〜30字程度。registerには「SNS」「会話」「チャット」などの場面を書く

new_words には、上の文で使った(または今の台湾で流行っている)辞書に載りにくい口語・新語・流行語を最大10個。各語に正確な注音(zhuyin)・拼音・日本語の意味・品詞・使う場面(usage、日本語1文)を必ず付ける。自信のない語は含めない。
${candidateWords.length > 0 ? `\n加えて、次はニュース見出しから機械抽出した辞書未収録の候補です。**実在する台湾華語の語だけ**を new_words に含めて正確に定義してください(単なる固有名詞の断片や切り出しミスは無視): ${candidateWords.join("、")}` : ""}`,
  });

  const texts = out.sentences.map((s) => s.text).filter(Boolean);

  const { heads, maxLen } = await loadHeadwordSet();
  const { counts, pairs } = analyzeTexts(texts, heads, maxLen);
  const day = new Date().toISOString().slice(0, 10);
  const words = await addCorpusCounts(day, "ai_synth", counts);
  const pairCount = await addCorpusPairs(day, "ai_synth", pairs);

  // 新語を共有辞書へ(insert-only・AIバッジ付き)。usageはtaiwan_usageに保存。
  await learnLexiconEntries(
    out.new_words.map((w) => ({
      headword: w.word,
      zhuyin: w.zhuyin,
      pinyin: w.pinyin,
      meaning_ja: w.meaning_ja,
      pos: w.pos,
      taiwan_usage: w.usage || null,
      confidence: 1,
    })),
  );

  return { sentences: texts.length, words, pairs: pairCount, new_words: out.new_words.length };
}

// ---- 実行オーケストレーター(全ステップをログに残す) -------------------------

export type SelfImproveStep = { step: string; ok: boolean; detail: unknown };

/**
 * 自己改善の本体。各ステップを順に実行し、成否と詳細を self_improve_runs に
 * 必ず記録する — 「機能してない」を無言にしないための可視化。
 * force=false(自動)は20時間スロットル、force=true(管理画面)は常に実行。
 */
export async function runSelfImprovement(
  userId: string,
  force = false,
): Promise<{ skipped: boolean; steps: SelfImproveStep[] }> {
  if (!force) {
    const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("kind", "self_improve")
      .gte("created_at", since);
    if ((count ?? 0) > 0) return { skipped: true, steps: [] };
  }
  await supabaseAdmin.from("usage_events").insert({ user_id: userId, kind: "self_improve" });

  const steps: SelfImproveStep[] = [];
  const record = (step: string, ok: boolean, detail: unknown) => steps.push({ step, ok, detail });

  try {
    record("audit", true, await runLexiconAudit(10));
  } catch (e) {
    record("audit", false, { error: (e as Error).message.slice(0, 300) });
  }

  let candidates: string[] = [];
  try {
    const r = await ingestCorpusFromNews();
    candidates = r.unknown_candidates;
    record("news", r.titles > 0, r);
  } catch (e) {
    record("news", false, { error: (e as Error).message.slice(0, 300) });
  }

  try {
    record("synth", true, await generateSyntheticCorpus(candidates));
  } catch (e) {
    record("synth", false, { error: (e as Error).message.slice(0, 300) });
  }

  for (const s of steps) {
    await supabaseAdmin
      .from("self_improve_runs")
      .insert({ step: s.step, ok: s.ok, detail: s.detail as never })
      .then(({ error }) => {
        if (error) console.error("[self-improve] log failed:", error.message);
      });
  }
  return { skipped: false, steps };
}

/** 自動トリガー用(その日最初のスキャンから fire-and-forget で呼ばれる)。 */
export async function maybeRunDailySelfImprovement(userId: string): Promise<void> {
  try {
    await runSelfImprovement(userId, false);
  } catch {
    /* 自己改善は本体を絶対に止めない */
  }
}
