import {
  checkMainExampleLabel,
  mainExampleLabelRule,
  mainExampleNeedsTidy,
  mainExamplePatch,
  mainSceneFor,
  needsMainSceneLabel,
  sceneMaxChars,
  type CheckedMainLabel,
} from "./example-patterns";
import { normalizeExtras } from "./extras";
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
 */

/** 同じ行を呼び直すまでの間（同じ実行環境の中だけ）。 */
export const RETRY_AFTER_MS = 30 * 60 * 1000;
const recent = new Map<string, number>();

/** 試験用: 呼び直しの記録を消す。 */
export function forgetMainExampleLabelAttempts(): void {
  recent.clear();
}

type ExplanationKey = { explainLang: string; l1: string };

type ReaderRow = {
  example_translation: string | null;
  extras: Record<string, unknown> | null;
  source: string;
};

export type MainExampleLabelDeps = {
  /** service role の Supabase クライアント（`words` / `stickers` を読み書きする）。 */
  admin: unknown;
  /** 読む人の行を1つ引く（`readReaderExplanation`）。 */
  readReader: (admin: unknown, wordId: string, key: ExplanationKey) => Promise<ReaderRow | null>;
  /** 読む人の行に重ねて書く（`mergeIntoReaderExplanation`）。 */
  mergeReader: (
    admin: unknown,
    wordId: string,
    key: ExplanationKey,
    patch: {
      extras: Record<string, unknown>;
      example_translation?: string | null;
      replaceKeys?: readonly string[];
    },
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
      eq: (k: string, v: string) => PromiseLike<{ error: unknown }>;
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
      label = { scene: existing, translation: "", chunks: [], sameAsMain: [] };
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
          extras: extrasList,
        }),
        `{"example_main":{"scene":"短い1行(${nl})",${wantTranslation ? `"translation":"訳(${nl})",` : ""}"scene_fits":true${extrasList?.length ? `,"same_as_main":[]` : ""}}}`,
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

    let wrote = false;
    if (readerTodo && reader) {
      const fix = mainExamplePatch(readerExtras, {
        sentence,
        headword: head,
        label: needsMainSceneLabel(sentence, readerExtras) ? label : null,
        samePattern,
      });
      if (fix) {
        wrote =
          (await deps.mergeReader(deps.admin, input.wordId, input.key, {
            extras: fix.patch,
            replaceKeys: fix.replaceKeys,
            example_translation:
              viaAi && !(reader.example_translation ?? "").trim() ? label?.translation : null,
          })) || wrote;
      }
    }
    if (sharedTodo) {
      // 書く直前に読み直す（裏の項目の生成と重なるので — `runSectionRegen` と同じ理由）。
      const fresh = await readWord(deps.admin, input.wordId);
      if (
        fresh &&
        sameText(fresh.example_sentence, sentence) &&
        sharedInLang(fresh.extras, input.key.explainLang)
      ) {
        const fix = mainExamplePatch(fresh.extras, {
          sentence,
          headword: head,
          label: needsMainSceneLabel(sentence, fresh.extras) ? label : null,
          samePattern,
        });
        if (fix) {
          // 共有の extras は ExtrasSchema に無いキー（復習の足場の控えなど）も残す（丸ごと重ねるだけ）。
          const { error } = await (deps.admin as LooseDb)
            .from("words")
            .update({ extras: { ...(fresh.extras ?? {}), ...fix.patch } })
            .eq("id", input.wordId);
          if (error) console.warn("labelMainExample: 共有の行に書けない", error);
          else wrote = true;
        }
      }
    }
    if (!wrote) return { outcome: "failed", reason: "nothing written" };
    return { outcome: viaAi || needLabel ? "labelled" : "tidied" };
  } catch (e) {
    return { outcome: "failed", reason: e instanceof Error ? e.message : String(e) };
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
      mergeReader: explanation.mergeIntoReaderExplanation,
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
