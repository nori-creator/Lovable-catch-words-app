/**
 * **その語の写真の意味を決め、絵を見て確かめる**（外の世界に触れる部分。理由と決まりは
 * `image-sense.ts`）。
 *
 * - 決める: 覚え → 共有の語の行（`words.extras.image_query`）→ 小さな AI の呼び出し
 * - 確かめる: 上位の小さな絵（最大 6 枚）を写真の読める速いモデル（`scan` の AI）に見せる
 *
 * AI を呼ぶ前に必ず: 同意（`assertAiConsent`）→ 回数の枠（`image_sense`。`ai-cap.ts`）。
 * どちらかで断られたら、AI を使わずに null を返す（呼ぶ側は説明の並べ替えだけで続ける）。
 * どこで失敗しても投げない — 画像の節を止めない。
 */
import { generateText } from "ai";
import { imageQueryOf } from "./hero-image";
import { fetchAllowedImage } from "./image-proxy";
import {
  RESOLVE_TIMEOUT_MS,
  SmallCache,
  VERIFY_MAX_IMAGES,
  VERIFY_TIMEOUT_MS,
  imageAvoidOf,
  imageSensePrompt,
  imageVerifyPrompt,
  parseImageSense,
  parseVerifyVerdict,
  senseKey,
  verdictKey,
  type ImageSense,
} from "./image-sense";

/** 意味を決める・確かめるのに要る語の手がかり。 */
export type SenseWord = {
  headword: string;
  meaning?: string | null;
  language?: string | null;
};

/** 確かめた結果。`checked` は確かめられた候補の位置、`matched` はその意味の物だった位置。 */
export type VerifyResult = { checked: number[]; matched: Set<number> };

/** `searchImagesWith` が使う AI の部分（試験では差し替える）。 */
export type ImageSenseDeps = {
  resolveSense: (word: SenseWord) => Promise<ImageSense | null>;
  verify: (input: {
    word: SenseWord;
    sense: ImageSense;
    images: ReadonlyArray<{ url: string; thumb?: string }>;
  }) => Promise<VerifyResult | null>;
};

/** 決めた意味（空の検索語 = 写真で表せない語、と覚える）。 */
const senseCache = new SmallCache<ImageSense>(1000);
/** 絵ごとの答え（その意味の物だったか）。 */
const verdictCache = new SmallCache<boolean>(4000);

/** 試験から覚えを消す。 */
export function clearImageSenseCaches() {
  senseCache.clear();
  verdictCache.clear();
}

/** 1回の検索の間、同意と枠を1回ずつだけ確かめる。 */
function aiGate(userId: string) {
  let consent: Promise<boolean> | null = null;
  const allowed = () =>
    (consent ??= (async () => {
      try {
        await (await import("./ai-consent.server")).assertAiConsent(userId);
        return true;
      } catch {
        return false;
      }
    })());
  return async (): Promise<boolean> => {
    if (!(await allowed())) return false;
    try {
      const { assertWithinDailyCap } = await import("./ai-provider.server");
      await assertWithinDailyCap(userId, "image_sense");
      return true;
    } catch (e) {
      console.warn("image sense skipped (cap)", e instanceof Error ? e.message.slice(0, 40) : "");
      return false;
    }
  };
}

/** 共有の語の行に、カードの AI が返した検索語が在れば使う（AI を呼ばない）。 */
async function sharedWordSense(word: SenseWord): Promise<ImageSense | null> {
  if (!word.language) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("words")
      .select("extras")
      .eq("language", word.language)
      .eq("headword", word.headword.trim())
      .limit(1);
    const extras = (data as Array<{ extras?: unknown }> | null)?.[0]?.extras;
    const query = imageQueryOf(extras).trim();
    return query ? { query, avoid: imageAvoidOf(extras) } : null;
  } catch {
    return null;
  }
}

async function fastVisionModel() {
  const { getAiAttemptChain } = await import("./ai-provider.server");
  const chain = await getAiAttemptChain("scan");
  return chain[0]?.model ?? null;
}

/** 本番の AI の部分（その人の同意・枠で守る）。 */
export function imageSenseDepsFor(userId: string): ImageSenseDeps {
  const gate = aiGate(userId);
  return {
    async resolveSense(word) {
      const key = senseKey(word);
      const hit = senseCache.get(key);
      if (hit) return hit.query ? hit : null;
      const shared = await sharedWordSense(word);
      if (shared) {
        senseCache.set(key, shared);
        return shared;
      }
      if (!(await gate())) return null;
      try {
        const model = await fastVisionModel();
        if (!model) return null;
        const { parseJsonFromAiText } = await import("./ai-provider.server");
        const res = await generateText({
          model,
          prompt: imageSensePrompt(word),
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
        });
        const sense = parseImageSense(parseJsonFromAiText(res.text));
        // 写真で表せない語も覚える（何度も AI を呼ばない）。
        senseCache.set(key, sense ?? { query: "", avoid: [] });
        return sense;
      } catch (e) {
        console.warn("image sense resolve failed", e instanceof Error ? e.message.slice(0, 80) : e);
        return null;
      }
    },

    async verify({ word, sense, images }) {
      const top = images.slice(0, VERIFY_MAX_IMAGES);
      if (top.length === 0) return null;
      // 全部覚えていれば AI を呼ばない。
      const known = top.map((c) => verdictCache.get(verdictKey(sense, c.url)));
      if (known.every((v) => v !== undefined)) {
        return {
          checked: top.map((_, i) => i),
          matched: new Set(known.flatMap((v, i) => (v ? [i] : []))),
        };
      }
      if (!(await gate())) return null;
      const deadline = AbortSignal.timeout(VERIFY_TIMEOUT_MS);
      try {
        // 小さい絵をサーバで取る（許した置き場だけ。`image-proxy.ts`）。取れない絵は確かめない。
        const fetched = await Promise.all(
          top.map(async (c, i) => {
            try {
              const { dataUrl } = await fetchAllowedImage(c.thumb || c.url, (u, init) =>
                fetch(u, {
                  ...init,
                  signal: init.signal ? AbortSignal.any([init.signal, deadline]) : deadline,
                }),
              );
              const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
              return m ? { i, mediaType: m[1], bytes: Buffer.from(m[2], "base64") } : null;
            } catch {
              return null;
            }
          }),
        );
        const ok = fetched.filter((f): f is NonNullable<typeof f> => !!f);
        if (ok.length === 0) return null;
        const model = await fastVisionModel();
        if (!model) return null;
        const { parseJsonFromAiText } = await import("./ai-provider.server");
        const res = await generateText({
          model,
          maxRetries: 0,
          abortSignal: deadline,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: imageVerifyPrompt({
                    headword: word.headword,
                    meaning: word.meaning,
                    sense,
                    count: ok.length,
                  }),
                },
                ...ok.map((f) => ({
                  type: "image" as const,
                  image: new Uint8Array(f.bytes),
                  mediaType: f.mediaType,
                })),
              ],
            },
          ],
        });
        const verdict = parseVerifyVerdict(parseJsonFromAiText(res.text), ok.length);
        if (!verdict) return null;
        const matched = new Set<number>();
        ok.forEach((f, j) => {
          const yes = verdict.has(j);
          if (yes) matched.add(f.i);
          verdictCache.set(verdictKey(sense, top[f.i].url), yes);
        });
        return { checked: ok.map((f) => f.i), matched };
      } catch (e) {
        console.warn("image verify failed", e instanceof Error ? e.message.slice(0, 80) : e);
        return null;
      }
    },
  };
}
