/**
 * **サーバが作った語の中身の控え**（監査 2026-10-03 H2 / M3）。
 *
 * 共有の語（`words`）と読む人ごとの解説（`word_explanations`）は全員が同じ行を見る。
 * 前はその中身を**画面が送ってきた文**で書いていた（`saveSticker` → `upsertWord` の
 * 新しい語の行、`updateWordExtras` の `extras` / `reader_meaning` / `patch`）。
 * アプリを通さずに呼べば、誰でも好きな文を共有の行に置けた。
 *
 * いまは**サーバが自分で作った物だけ**を共有の行に書く:
 *
 * 1. 中身を作るサーバの関数（`generateCard`・候補を出す `suggestWords` /
 *    `suggestWordCandidates` / `detectScan`・チュートリアルのカード）が、作った物をここに
 *    控える（`generated_cards`、サーバの鍵でしか読み書きできない表）
 * 2. 保存の道（`upsertWord`・`applyWordExtrasUpdate`）は、画面の送った文ではなく
 *    この控えを読んで書く。画面は今までどおり同じ物を送ってくるが、使われない
 *
 * 控えは**誰が作らせたかを問わない**（中身はどれもサーバのプロンプトで作った物で、
 * 人が書いた文ではない）。個人の材料（一言・場所・日記）は、ここに来る生成には一切
 * 渡していない（`runSectionRegen` の注、H1）。
 *
 * 表がまだ無い環境（移行待ち）では `available: false` を返す — 呼ぶ側は前の動き
 * （画面の送った物で空の所だけ埋める）に戻る。**移行を当てるまで穴は開いたまま**なので、
 * 移行 `20261003130100_generated_cards.sql` を先に当てること。
 */

import {
  fillEmptySharedColumns,
  fillEmptySharedExtras,
  sharedColumnsFromCard,
} from "./shared-word-guard";

/** 控えを使う期間。過ぎた物は使わず、時々消す。 */
export const GENERATED_CARD_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** `card` = カード全体（`generateCard` など） / `candidate` = 候補の意味と読みだけ。 */
export type GeneratedCardKind = "card" | "candidate";

/** 控えの中身（共有の行に書いてよい所だけ）。 */
export type TrustedCard = {
  meaning_ja?: string;
  reading_zhuyin?: string;
  pinyin?: string;
  part_of_speech?: string;
  level?: string;
  category_key?: string;
  example_sentence?: string;
  example_translation?: string;
  extras?: Record<string, unknown>;
};

export type GeneratedCardLookup =
  | { available: false }
  | { available: true; card: TrustedCard | null; kind: GeneratedCardKind | null };

const TABLE = "generated_cards";

const TEXT_KEYS = [
  "meaning_ja",
  "reading_zhuyin",
  "pinyin",
  "part_of_speech",
  "level",
  "category_key",
  "example_sentence",
  "example_translation",
] as const;

/** 作った物から、控えに残す所だけを取り出す（知らない鍵・文字列でない値は捨てる）。 */
export function trustedCardFrom(raw: unknown): TrustedCard {
  const out: TrustedCard = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  for (const k of TEXT_KEYS) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  const ex = r.extras;
  if (ex && typeof ex === "object" && !Array.isArray(ex)) {
    out.extras = ex as Record<string, unknown>;
  }
  return out;
}

export type GeneratedCardRow = {
  language: string;
  headword: string;
  explain_lang: string;
  l1: string;
  kind: string;
  card: unknown;
  created_at: string;
};

/**
 * 控えの行から1つを選ぶ（純粋関数）。
 *
 * - 期限（`GENERATED_CARD_TTL_MS`）を過ぎた物は使わない
 * - 鍵（`explainLang` / `l1`）を渡したら、その鍵のカード全体だけ
 * - 渡さなければ、カード全体を候補より優先し、その中で新しい物
 */
export function pickGeneratedCard(
  rows: readonly GeneratedCardRow[] | null | undefined,
  opts: { explainLang?: string; l1?: string; preferExplainLang?: string; now?: number } = {},
): { card: TrustedCard; kind: GeneratedCardKind } | null {
  const now = opts.now ?? Date.now();
  const fresh = (rows ?? []).filter((r) => {
    const t = Date.parse(r.created_at);
    return Number.isFinite(t) && now - t <= GENERATED_CARD_TTL_MS;
  });
  const keyed =
    opts.explainLang !== undefined
      ? fresh.filter(
          (r) =>
            r.kind === "card" && r.explain_lang === opts.explainLang && r.l1 === (opts.l1 ?? ""),
        )
      : fresh;
  // カード全体 > 候補。カード同士なら、呼んだ人の解説の言語で書かれた物を先に。
  const rank = (r: GeneratedCardRow) =>
    r.kind === "card"
      ? 2 + (opts.preferExplainLang && r.explain_lang === opts.preferExplainLang ? 1 : 0)
      : 0;
  const best = [...keyed].sort(
    (a, b) => rank(b) - rank(a) || Date.parse(b.created_at) - Date.parse(a.created_at),
  )[0];
  if (!best) return null;
  return {
    card: trustedCardFrom(best.card),
    kind: best.kind === "card" ? "card" : "candidate",
  };
}

type LooseError = { message?: string; code?: string } | null;

/** 表がまだ無い（移行待ち）か。 */
export function isMissingGeneratedCardsTable(error: LooseError): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  return new RegExp(TABLE).test(error.message ?? "");
}

type LooseDb = {
  from: (t: string) => unknown;
};

/**
 * 控えを残す。**投げない**（控えが残らないと、その語は保存の時に中身なしになるだけ）。
 * 同じ鍵の控えは新しい物で置き換える。
 */
export async function recordGeneratedCards(
  admin: unknown,
  entries: ReadonlyArray<{
    language: string;
    headword: string;
    explainLang?: string;
    l1?: string;
    kind: GeneratedCardKind;
    card: unknown;
  }>,
  now: Date = new Date(),
): Promise<boolean> {
  const seen = new Set<string>();
  const rows = [];
  for (const e of entries) {
    const headword = (e.headword ?? "").trim();
    const language = (e.language ?? "").trim();
    if (!headword || !language || headword.length > 100) continue;
    const explain_lang = e.kind === "card" ? (e.explainLang ?? "") : "";
    const l1 = e.kind === "card" ? (e.l1 ?? "") : "";
    const k = `${language}\u0000${headword}\u0000${explain_lang}\u0000${l1}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const card = trustedCardFrom(e.card);
    if (!card.meaning_ja && !card.extras) continue;
    rows.push({
      language,
      headword,
      explain_lang,
      l1,
      kind: e.kind,
      card,
      created_at: now.toISOString(),
    });
  }
  if (rows.length === 0) return false;
  try {
    const db = admin as LooseDb;
    const t = db.from(TABLE) as {
      upsert: (r: unknown, o: unknown) => PromiseLike<{ error: LooseError }>;
    };
    const { error } = await t.upsert(rows, { onConflict: "language,headword,explain_lang,l1" });
    if (error) {
      if (isMissingGeneratedCardsTable(error)) {
        console.warn("[generated-cards] 表がまだ無い（移行待ち）", error.message);
      } else {
        console.warn("[generated-cards] 控えを残せない", error.message);
      }
      return false;
    }
    // 古い控えを時々消す（毎回は消さない — 消すのはおまけ）。
    if (Math.random() < 0.02) {
      const cutoff = new Date(now.getTime() - GENERATED_CARD_TTL_MS).toISOString();
      const d = db.from(TABLE) as {
        delete: () => { lt: (c: string, v: string) => PromiseLike<{ error: LooseError }> };
      };
      const { error: delErr } = await d.delete().lt("created_at", cutoff);
      if (delErr) console.warn("[generated-cards] 古い控えを消せない", delErr.message);
    }
    return true;
  } catch (e) {
    console.warn("[generated-cards] 控えを残せない", e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * 控えを引く。表が無ければ `available: false`（呼ぶ側は前の動きに戻る）。
 * 読めない（通信の失敗など）ときは `available: true, card: null` — **画面の文に戻らない**。
 */
export async function findGeneratedCard(
  admin: unknown,
  opts: {
    language: string;
    headword: string;
    explainLang?: string;
    l1?: string;
    /** 鍵で絞らない時、この解説の言語のカードを先に選ぶ。 */
    preferExplainLang?: string;
    now?: number;
  },
): Promise<GeneratedCardLookup> {
  try {
    const db = admin as LooseDb;
    const q = db.from(TABLE) as {
      select: (c: string) => {
        eq: (
          k: string,
          v: string,
        ) => {
          eq: (
            k: string,
            v: string,
          ) => {
            gte: (
              k: string,
              v: string,
            ) => PromiseLike<{ data: GeneratedCardRow[] | null; error: LooseError }>;
          };
        };
      };
    };
    const now = opts.now ?? Date.now();
    const { data, error } = await q
      .select("language, headword, explain_lang, l1, kind, card, created_at")
      .eq("language", opts.language)
      .eq("headword", opts.headword)
      .gte("created_at", new Date(now - GENERATED_CARD_TTL_MS).toISOString());
    if (error) {
      if (isMissingGeneratedCardsTable(error)) return { available: false };
      console.warn("[generated-cards] 控えを読めない", error.message);
      return { available: true, card: null, kind: null };
    }
    const picked = pickGeneratedCard(data, {
      explainLang: opts.explainLang,
      preferExplainLang: opts.preferExplainLang,
      l1: opts.l1,
      now,
    });
    return picked
      ? { available: true, card: picked.card, kind: picked.kind }
      : { available: true, card: null, kind: null };
  } catch (e) {
    console.warn("[generated-cards] 控えを読めない", e instanceof Error ? e.message : e);
    return { available: true, card: null, kind: null };
  }
}

/**
 * **サーバが作ったカードで、既に在る共有の語の空の所を埋める**（`generateCard` から）。
 *
 * キャッチの画面は候補の意味だけでカードを先に出し、`generateCard` の完成を待たずに
 * 保存できる。その時に作られた語の行は、控え（候補）か辞書の分しか中身が無い。
 * カードが出来上がったら、その中身で**空の列・空の項目だけ**を埋める（`fillEmptySharedColumns`
 * / `fillEmptySharedExtras` — 埋まっている所と人が確かめた語は触らない）。
 * 投げない（埋まらなくても、単語の詳細を開いた時の自動生成が埋める）。
 */
export async function fillSharedWordFromCard(
  admin: unknown,
  opts: { language: string; headwords: readonly string[]; card: TrustedCard },
): Promise<number> {
  const heads = [...new Set(opts.headwords.map((h) => (h ?? "").trim()).filter(Boolean))];
  if (heads.length === 0) return 0;
  type WordRow = Record<string, unknown> & { id: string; source?: string | null };
  const db = admin as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          k: string,
          v: string,
        ) => {
          in: (
            k: string,
            v: string[],
          ) => PromiseLike<{ data: WordRow[] | null; error: LooseError }>;
        };
      };
      update: (row: unknown) => {
        eq: (k: string, v: string) => PromiseLike<{ error: LooseError }>;
      };
    };
  };
  try {
    const { data: rows, error } = await db
      .from("words")
      .select(
        "id, source, extras, meaning_ja, reading_zhuyin, pinyin, part_of_speech, level, example_sentence, example_translation",
      )
      .eq("language", opts.language)
      .in("headword", heads);
    if (error) {
      console.warn("[generated-cards] 語を読めない", error.message);
      return 0;
    }
    let written = 0;
    for (const row of rows ?? []) {
      const update: Record<string, unknown> = fillEmptySharedColumns(
        row as never,
        sharedColumnsFromCard(opts.card as Record<string, unknown>),
        { verified: row.source === "verified" },
      );
      const extras = fillEmptySharedExtras(row.extras, opts.card.extras ?? null);
      if (extras) update.extras = extras;
      if (Object.keys(update).length === 0) continue;
      const { error: upErr } = await db.from("words").update(update).eq("id", row.id);
      if (upErr) console.warn("[generated-cards] 語を埋められない", upErr.message);
      else written++;
    }
    return written;
  } catch (e) {
    console.warn("[generated-cards] 語を埋められない", e instanceof Error ? e.message : e);
    return 0;
  }
}
