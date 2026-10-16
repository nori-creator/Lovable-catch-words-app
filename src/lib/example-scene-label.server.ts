import {
  checkMainExampleLabel,
  chunksMatchSentence,
  mainExampleLabelRule,
  mainExampleNeedsTidy,
  mainExamplePatch,
  mainSceneFor,
  needsMainSceneLabel,
  sceneMaxChars,
  type CheckedMainLabel,
} from "./example-patterns";
import { normalizeExtras } from "./extras";
import { casSceneFor, rawSceneFor, type CasQuery } from "./scene-label-cas";
import { looksLikeTargetLanguage } from "./text-language";
import { targetProfile } from "./target-profile";
import type { UiLang } from "./i18n";

/**
 * **札の無い古いメインの例文に、札だけを付ける**（オーナー報告 2026-10-16: 冰淇淋 の1つ目の例文
 * 「夏天吃冰淇淋。」に場面の札が無く、2つ目の例文には有る）。
 *
 * 場面の札（2026-10-14）より前に出来た例文は、共有の行（`words.example_sentence`）にそのまま残る
 * （オーナー決定: 古い例文の**文そのもの**は作り直さない）。札だけなら足してよいので、単語の詳細を開いた時
 * （`getWordExplanation`）に、返事の後で**札だけを書く小さな呼び出し**を1回する。札は次に開いた時に出る。
 *
 * - 文は変えない。札は**その文のために**書かせ、`example_scene_for` = その文を付ける（iOS はこれが無いと出さない）
 * - 札の決まりは例文のパターンと同じ（短い1行・読む人の言語・字数の上限 — `mainExampleLabelRule`）
 * - 追加の例文のうちメインと同じパターンの物は落とし、`example_pattern_count` を 1 + 残った数にする
 * - 札がもう片方の行（読む人の行 ⇔ 共有の行）に在れば AI を呼ばずに写す。札が在って同じパターンの追加の
 *   例文だけが残っている行も、AI を呼ばずに直す
 * - 同じ語・同じ読む人には、しばらく呼び直さない（`RETRY_AFTER_MS`。AI が札を書けなかった語で開くたびに呼ばない）
 *
 * **重なり**（PR #189 の点検）: 同じ行の仕事は1つずつ（`inFlight` — 読む前に同期で取るので、同時に来た2つ目は
 * 何もしない）。実行環境をまたぐ重なりは、書く時の条件で止める: 読んだ時の `example_scene_for` のままの行
 * にだけ書く（`casSceneFor`）。先に誰かが札を付けた行には書かない — 同じ行に2度書かない。
 */

/** 同じ行を呼び直すまでの間（同じ実行環境の中だけ）。 */
export const RETRY_AFTER_MS = 30 * 60 * 1000;
const recent = new Map<string, number>();
/** いま仕事中の行（同じ実行環境の中だけ。読む前に取り、終わったら外す）。 */
const inFlight = new Set<string>();

/** 試験用: 呼び直しの記録を消す。 */
export function forgetMainExampleLabelAttempts(): void {
  recent.clear();
  inFlight.clear();
}

export { casSceneFor, rawSceneFor };

const wroteRows = (data: unknown) => Array.isArray(data) && data.length > 0;

type ExplanationKey = { explainLang: string; l1: string };

type ReaderRow = {
  example_translation: string | null;
  extras: Record<string, unknown> | null;
  source: string;
};

/** 読む人の行に書く差分（`build` が、書く直前に読み直した行から作る）。 */
export type ReaderWrite = {
  extras: Record<string, unknown>;
  replaceKeys?: readonly string[];
  example_translation?: string | null;
};

export type MainExampleLabelDeps = {
  /** service role の Supabase クライアント（`words` / `stickers` を読み書きする）。 */
  admin: unknown;
  /** 読む人の行を1つ引く（`readReaderExplanation`）。 */
  readReader: (admin: unknown, wordId: string, key: ExplanationKey) => Promise<ReaderRow | null>;
  /**
   * 読む人の行に書く（`updateReaderExplanationIfUnchanged`）: 書く直前に読み直した行から `build` で差分を作り、
   * 読み直した時の `example_scene_for` のままの行にだけ書く。人が確かめた行・差分が無い時は書かない。書けたら true。
   */
  writeReader: (
    admin: unknown,
    wordId: string,
    key: ExplanationKey,
    build: (current: ReaderRow) => ReaderWrite | null,
  ) => Promise<boolean>;
  /** AI を呼んでよいか（同意・その日の枠）。駄目なら投げる。 */
  allow: (userId: string) => Promise<void>;
  /** 指示を渡し、返事の文を受け取る。 */
  generate: (prompt: string) => Promise<string>;
  parseJson: (text: string) => unknown;
  languageName: (lang: string) => string;
  now?: () => number;
};

export type MainExampleLabelResult =
  { outcome: "labelled" | "tidied" } | { outcome: "skipped" | "failed"; reason: string };

type LooseDb = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (
        k: string,
        v: string,
      ) => {
        maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
        eq: (
          k: string,
          v: string,
        ) => {
          limit: (n: number) => {
            maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
          };
        };
      };
    };
    update: (row: unknown) => {
      eq: (k: string, v: string) => CasQuery;
    };
  };
};

type WordRow = {
  headword: string;
  language: string | null;
  example_sentence: string | null;
  extras: Record<string, unknown> | null;
};

async function readWord(admin: unknown, wordId: string): Promise<WordRow | null> {
  const { data, error } = await (admin as LooseDb)
    .from("words")
    .select("headword, language, example_sentence, extras")
    .eq("id", wordId)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  const extras = r.extras;
  return {
    headword: String(r.headword ?? ""),
    language: (r.language as string | null) ?? null,
    example_sentence: (r.example_sentence as string | null) ?? null,
    extras:
      extras && typeof extras === "object" && !Array.isArray(extras)
        ? (extras as Record<string, unknown>)
        : null,
  };
}

/** 共有の解説が読む人の言語で書かれているか（`stickers.functions.ts` の `sharedExtrasInLang` と同じ）。 */
function sharedInLang(extras: Record<string, unknown> | null, lang: string): boolean {
  if (!extras) return false;
  const v = extras.explain_lang;
  return ((typeof v === "string" && v.trim()) || "ja") === lang;
}

const needsWork = (extras: Record<string, unknown> | null, sentence: string, head: string) =>
  needsMainSceneLabel(sentence, extras) || mainExampleNeedsTidy(extras, sentence, head);

/**
 * その語・その読む人の行のメインの例文に、札が無ければ付ける（同じパターンの追加の例文も落とす）。
 * **投げない** — 失敗は結果で返す（呼ぶのは返事の後の裏の仕事）。
 */
export async function labelMainExample(
  deps: MainExampleLabelDeps,
  input: { userId: string; wordId: string; key: ExplanationKey },
): Promise<MainExampleLabelResult> {
  const now = (deps.now ?? Date.now)();
  const memo = `${input.wordId}:${input.key.explainLang}:${input.key.l1}`;
  const last = recent.get(memo);
  if (last !== undefined && now - last < RETRY_AFTER_MS) return skipped("recently tried");
  // 同じ行の仕事は1つずつ。確かめて取るまでの間に await を挟まない（同時に来た2つ目はここで止まる）。
  if (inFlight.has(memo)) return skipped("in flight");
  inFlight.add(memo);
  try {
    const word = await readWord(deps.admin, input.wordId);
    if (!word) return skipped("no word");
    const sentence = (word.example_sentence ?? "").trim();
    const head = word.headword.trim();
    if (!sentence || !looksLikeTargetLanguage(sentence, word.language)) {
      return skipped("no main example");
    }

    // 自分の図鑑に在る語だけ（`regenerateCardSection` と同じ持ち主の確かめ）。
    const { data: owned } = await (deps.admin as LooseDb)
      .from("stickers")
      .select("id")
      .eq("user_id", input.userId)
      .eq("word_id", input.wordId)
      .limit(1)
      .maybeSingle();
    if (!owned) return skipped("not owned");

    const reader = await deps.readReader(deps.admin, input.wordId, input.key);
    const readerExtras = (reader?.extras ?? null) as Record<string, unknown> | null;
    const readerOpen = !!reader && reader.source !== "verified";
    const sharedOpen = sharedInLang(word.extras, input.key.explainLang);
    const readerTodo = readerOpen && needsWork(readerExtras, sentence, head);
    const sharedTodo = sharedOpen && needsWork(word.extras, sentence, head);
    if (!readerTodo && !sharedTodo) return skipped("nothing to do");

    // 札: 片方の行に在ればそれを写す。どちらにも無ければ AI に札だけを書かせる。
    const readerScene = mainSceneFor(sentence, readerExtras);
    const sharedScene = mainSceneFor(sentence, word.extras);
    const needLabel = (readerTodo && !readerScene) || (sharedTodo && !sharedScene && !readerScene);
    let label: CheckedMainLabel | null = null;
    let viaAi = false;
    /** AI がメインと同じパターンと言った追加の例文の**文**（番号は AI に見せた一覧の中だけの位置）。 */
    let samePattern: string[] = [];
    const existing = readerScene || sharedScene;
    if (existing) {
      recent.set(memo, now);
      // 札を写す行のパーツも、この文を分けた物なら一緒に写す（違えば写さない — 書く側が別の文のパーツを消す）。
      const source = readerScene ? readerExtras : word.extras;
      const chunks = chunksMatchSentence(source?.example_chunks, sentence)
        ? (source?.example_chunks as CheckedMainLabel["chunks"])
        : [];
      label = { scene: existing, translation: "", chunks, sameAsMain: [] };
    } else if (needLabel) {
      await deps.allow(input.userId);
      // 呼んでよいと分かってから記録する（同意の無い人・枠の尽きた人が、ほかの人の札を止めないように）。
      recent.set(memo, now);
      const extrasList = (
        (readerOpen ? readerExtras : word.extras)?.examples_extra as unknown[] | undefined
      )
        ?.map((x) => String((x as { zh?: unknown })?.zh ?? "").trim())
        .filter(Boolean);
      const wantTranslation = readerOpen && !(reader?.example_translation ?? "").trim();
      const profile = targetProfile(word.language);
      // 書く行にこの文のパーツが無ければ（無い・別の文の物）、同じ呼び出しでこの文のパーツも書かせる。
      const wantChunks =
        (readerTodo && !chunksMatchSentence(readerExtras?.example_chunks, sentence)) ||
        (sharedTodo && !chunksMatchSentence(word.extras?.example_chunks, sentence));
      const chunkRoles = wantChunks ? profile.chunkRoles.join(" / ") : undefined;
      const nl = deps.languageName(input.key.explainLang);
      const prompt = [
        `${profile.promptName}の単語「${head}」の例文に、場面の札だけを付けます。例文は変えません。出力はJSONオブジェクト1つだけ(前置き不要)。`,
        mainExampleLabelRule({
          sentence,
          headword: head,
          targetName: profile.promptName,
          nl,
          sceneMax: sceneMaxChars(input.key.explainLang),
          translation: wantTranslation,
          chunkRoles,
          extras: extrasList,
        }),
        `{"example_main":{"scene":"短い1行(${nl})",${wantTranslation ? `"translation":"訳(${nl})",` : ""}${chunkRoles ? `"chunks":[{"text":"","pos":""}],` : ""}"scene_fits":true${extrasList?.length ? `,"same_as_main":[]` : ""}}}`,
      ].join("\n");
      const text = await deps.generate(prompt);
      const raw = deps.parseJson(text) as { example_main?: unknown } | null;
      label = checkMainExampleLabel(raw?.example_main, {
        sentence,
        readerLang: input.key.explainLang,
      });
      if (!label) return { outcome: "failed", reason: "no usable label" };
      viaAi = true;
      samePattern = label.sameAsMain
        .map((i) => extrasList?.[i] ?? "")
        .filter((x): x is string => !!x);
    } else {
      recent.set(memo, now);
    }

    /** 書く直前に読み直した行から差分を作る（その間に札が付いていれば札は書かず、要る掃除だけ）。 */
    const patchFor = (extras: Record<string, unknown> | null) =>
      mainExamplePatch(extras, {
        sentence,
        headword: head,
        label: needsMainSceneLabel(sentence, extras) ? label : null,
        samePattern,
      });
    let wrote = false;
    if (readerTodo) {
      wrote =
        (await deps.writeReader(deps.admin, input.wordId, input.key, (current) => {
          const fix = patchFor(current.extras);
          if (!fix) return null;
          return {
            extras: fix.patch,
            replaceKeys: fix.replaceKeys,
            example_translation:
              viaAi && !(current.example_translation ?? "").trim() ? label?.translation : null,
          };
        })) || wrote;
    }
    if (sharedTodo) {
      // 書く直前に読み直す（裏の項目の生成と重なるので — `runSectionRegen` と同じ理由）。
      const fresh = await readWord(deps.admin, input.wordId);
      if (
        fresh &&
        sameText(fresh.example_sentence, sentence) &&
        sharedInLang(fresh.extras, input.key.explainLang)
      ) {
        const fix = patchFor(fresh.extras);
        if (fix) {
          // 共有の extras は ExtrasSchema に無いキー（復習の足場の控えなど）も残す（丸ごと重ねるだけ）。
          // 読み直した時の目印のままの行にだけ書く（ほかの実行環境が先に書いていたら書かない）。
          const { data, error } = await casSceneFor(
            (deps.admin as LooseDb)
              .from("words")
              .update({ extras: { ...(fresh.extras ?? {}), ...fix.patch } })
              .eq("id", input.wordId),
            rawSceneFor(fresh.extras),
            "id",
          );
          if (error) console.warn("labelMainExample: 共有の行に書けない", error);
          else wrote = wroteRows(data) || wrote;
        }
      }
    }
    if (!wrote) return { outcome: "failed", reason: "nothing written" };
    return { outcome: viaAi || needLabel ? "labelled" : "tidied" };
  } catch (e) {
    return { outcome: "failed", reason: e instanceof Error ? e.message : String(e) };
  } finally {
    inFlight.delete(memo);
  }
}

function skipped(reason: string): MainExampleLabelResult {
  return { outcome: "skipped", reason };
}

const sameText = (a: string | null | undefined, b: string) => (a ?? "").trim() === b;

/**
 * 札だけの呼び出しをしてよいか。**サーバに記録された今の版の同意が要る**（PR #189 の点検 P2）。
 *
 * `assertAiConsent` は同意の見出しを送らない古い iOS（`/api/native-fn`）を通す — 端末が同意を確かめてから
 * AI の機能を呼ぶから。ここは読むだけの `getWordExplanation` から裏で始まる呼び出しで、端末の確認を経ていない。
 * だから見出し・環境変数に関わらず、記録された同意だけを見る（表が無い・取り消した・古い版なら呼ばない）。
 * 同意があれば、その日の枠（`scene_label`）を1回分とる。駄目なら投げる。
 */
export async function allowSceneLabel(
  userId: string,
  deps: {
    consentStatus: (userId: string) => Promise<{ agreed: boolean; recorded: boolean }>;
    reserve: (userId: string) => Promise<void>;
  },
): Promise<void> {
  const status = await deps.consentStatus(userId);
  if (!status.recorded || !status.agreed) {
    throw new Error("AI_CONSENT_REQUIRED: scene label needs recorded AI consent");
  }
  await deps.reserve(userId);
}

/**
 * 本番の道具をそろえて `labelMainExample` を呼ぶ（AI は速いモデル、枠は `scene_label`、記録された同意が要る）。
 */
export async function runMainExampleLabel(input: {
  userId: string;
  wordId: string;
  key: ExplanationKey;
}): Promise<MainExampleLabelResult> {
  const [{ supabaseAdmin }, ai, consent, explanation, { generateText }] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("./ai-provider.server"),
    import("./ai-consent.server"),
    import("./word-explanation.functions"),
    import("ai"),
  ]);
  return labelMainExample(
    {
      admin: supabaseAdmin,
      readReader: async (admin, wordId, key) => {
        const row = await explanation.readReaderExplanation(admin, wordId, key);
        return row
          ? {
              example_translation: row.example_translation,
              extras: (row.extras ?? null) as Record<string, unknown> | null,
              source: row.source,
            }
          : null;
      },
      writeReader: explanation.updateReaderExplanationIfUnchanged,
      allow: (userId) =>
        allowSceneLabel(userId, {
          consentStatus: (id) => consent.getAiConsentStatus(id),
          reserve: (id) => ai.assertWithinDailyCap(id, "scene_label"),
        }),
      generate: async (prompt) => {
        const cfg = await ai.getAiFor("card", "section_regen");
        const result = await ai.withModelFallback(cfg, cfg.modelFast, (m) =>
          generateText({
            model: cfg.gateway(m),
            prompt,
            abortSignal: AbortSignal.timeout(20_000),
          }),
        );
        return result.text;
      },
      parseJson: ai.parseJsonFromAiText,
      languageName: (lang) => ai.explanationLanguageName(lang as UiLang),
    },
    input,
  );
}

/**
 * `getWordExplanation` から、札を付けに行くか。**画面に出す行**（`extras`・`source`）で決める:
 * - 人が確かめた行（verified）は書き換えないので頼まない（頼んでも直せず、開くたびに頼み直すだけ — PR #189 の点検）
 * - その行のメインの例文に札が無い・同じパターンの追加の例文が残っている時だけ
 * - 記録された AI の同意がある人・自分の図鑑に在る語だけ（どちらかが無ければ仕事は何もできず、開くたびに
 *   頼み直すだけになる。`labelPending` も立てない）
 */
export async function shouldLabelMainExample(input: {
  userId: string;
  wordId: string;
  shown: { extras: unknown; source?: string | null } | null;
  word: { language: string | null; headword: string; example_sentence: string | null };
  consentStatus?: (userId: string) => Promise<{ agreed: boolean; recorded: boolean }>;
  owns?: (userId: string, wordId: string) => Promise<boolean>;
}): Promise<boolean> {
  if (!input.shown?.extras || input.shown.source === "verified") return false;
  if (
    !mainExampleNeedsWork(
      input.shown.extras,
      input.word.example_sentence,
      input.word.headword,
      input.word.language,
    )
  ) {
    return false;
  }
  const status = input.consentStatus
    ? await input.consentStatus(input.userId)
    : await (await import("./ai-consent.server")).getAiConsentStatus(input.userId);
  if (!status.recorded || !status.agreed) return false;
  return (input.owns ?? ownsWord)(input.userId, input.wordId);
}

/** 自分の図鑑にその語の札が在るか（`labelMainExample` と同じ確かめ）。 */
async function ownsWord(userId: string, wordId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as unknown as LooseDb)
    .from("stickers")
    .select("id")
    .eq("user_id", userId)
    .eq("word_id", wordId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * `getWordExplanation` から: 返事の後で札を付ける（返事は待たせない）。結果は記録に残すだけ。
 */
export async function scheduleMainExampleLabel(input: {
  userId: string;
  wordId: string;
  key: ExplanationKey;
}): Promise<void> {
  const { runAfterResponse } = await import("./after-response");
  await runAfterResponse(
    "getWordExplanation: label the main example",
    async () => {
      const r = await runMainExampleLabel(input);
      if (r.outcome === "labelled" || r.outcome === "tidied") {
        console.info(`labelMainExample: ${r.outcome}`, { word_id: input.wordId });
      } else if (r.outcome === "failed") {
        console.warn("labelMainExample: failed", { word_id: input.wordId, reason: r.reason });
      }
    },
    { timeoutMs: 1_000 },
  );
}

/** 読む人の行を `normalizeExtras` の形で比べたい呼び出し側のために（`getWordExplanation`）。 */
export function mainExampleNeedsWork(
  extras: unknown,
  sentence: string | null | undefined,
  headword: string,
  language: string | null | undefined,
): boolean {
  const s = (sentence ?? "").trim();
  if (!s || !looksLikeTargetLanguage(s, language)) return false;
  const ex = (normalizeExtras(extras) ?? null) as Record<string, unknown> | null;
  return needsWork(ex, s, headword.trim());
}
