import { createServerFn } from "@tanstack/react-start";
import { DEFAULT_TARGET_LANGUAGE } from "./target-lang";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { commonsCandidates, commonsSearchUrl, type CommonsResponse } from "./commons-images";
import {
  DEFAULT_LOVABLE_IMAGE_MODEL,
  imagePrompt,
  pickOpenRouterImage,
  readImageConfig,
} from "./image-provider";

export type ImageCandidate = {
  url: string;
  thumb: string;
  source: "unsplash" | "commons" | "ai";
  credit?: { name: string; link: string };
};

const SearchInput = z.object({
  query: z.string().min(1).max(120),
  language: z.string().default(DEFAULT_TARGET_LANGUAGE),
});

/**
 * Search Unsplash for image candidates representing the given word.
 * Falls back to AI generation when Unsplash is unavailable or yields no result.
 */
export const searchImageCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SearchInput.parse(input))
  .handler(async ({ data }): Promise<{ candidates: ImageCandidate[] }> => {
    const key = process.env.UNSPLASH_ACCESS_KEY;
    const candidates: ImageCandidate[] = [];
    const imageConfig = readImageConfig(process.env);

    // **AI を先に**（`IMAGE_SEARCH_MODE=ai-first`）。1枚作って先頭に置き、
    // 後ろに写真の候補も並べる（AI が失敗しても写真で選べる）。
    if (imageConfig.mode === "ai-first") {
      const ai = await generateOneAiImage(data.query);
      if (ai) candidates.push(ai);
    }

    if (key) {
      try {
        const url = new URL("https://api.unsplash.com/search/photos");
        url.searchParams.set("query", data.query);
        url.searchParams.set("per_page", "6");
        url.searchParams.set("content_filter", "high");
        url.searchParams.set("orientation", "squarish");
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
        });
        if (res.ok) {
          const json = (await res.json()) as {
            results?: Array<{
              urls: { regular: string; small: string };
              user: { name: string; links: { html: string } };
            }>;
          };
          for (const r of json.results ?? []) {
            candidates.push({
              url: r.urls.regular,
              thumb: r.urls.small,
              source: "unsplash",
              credit: { name: r.user.name, link: r.user.links.html },
            });
          }
        }
      } catch (e) {
        console.warn("unsplash search failed", e);
      }
    }

    /**
     * **鍵の要らない出所を1つ持つ**(オーナー報告 2026-08-27 ④
     * 「単語の詳細のネットの画像がよく表示されない」)。
     *
     * ここまでの出所は Unsplash（鍵が要る）だけで、控えは AI の生成
     * （鍵と残高が要る）だけだった。どちらかが切れると候補は 0 件になり、
     * 画面には「画像がありません」しか残らない。**切れ方が見えない**ので、
     * 使う人には「よく出ない機能」としか映らない。
     *
     * コモンズは鍵が要らず、素性のはっきりした自由利用の画像がある。
     * 街で見かける具体的な物には特に強い。読み替えは `commons-images.ts`。
     */
    if (candidates.every((c) => c.source === "ai")) {
      try {
        const res = await fetch(commonsSearchUrl(data.query), {
          // コモンズは名乗らない相手を弾くことがある。
          headers: { "User-Agent": "Catchwords/1.0 (language learning app)" },
        });
        if (res.ok) {
          for (const c of commonsCandidates((await res.json()) as CommonsResponse)) {
            candidates.push({ ...c, source: "commons" });
          }
        }
      } catch (e) {
        console.warn("commons search failed", e);
      }
    }

    // Always offer at least one AI fallback option so user has a choice when
    // photo search returns nothing or is unconfigured.
    if (candidates.length === 0) {
      const ai = await generateOneAiImage(data.query);
      if (ai) candidates.push(ai);
    }

    return { candidates: candidates.slice(0, 6) };
  });

/**
 * AI で1枚作る。**どこで作るかは設定で切り替える**（`image-provider.ts`）。
 * どこで失敗しても `null` — 画面は写真の候補だけで続ける。
 */
async function generateOneAiImage(query: string): Promise<ImageCandidate | null> {
  const config = readImageConfig(process.env);
  if (config.provider === "off") return null;
  if (config.provider === "openrouter") return generateWithOpenRouter(query, config.model);
  if (config.provider === "higgsfield") {
    const r = await generateWithHiggsfield(query, config.model);
    if (r.ok) return r.candidate;
    console.warn("higgsfield image failed", r.reason);
    // Higgsfield が駄目でも、Lovable の口で1枚は作る（画面を空にしない）。
    return generateWithLovable(query);
  }
  return generateWithLovable(query);
}

/**
 * **Higgsfield で1枚作る**。返ってくるのは Higgsfield の置き場の URL なので、
 * **サーバで取りに行って data URL にして返す**（Lovable の口と同じ形）。
 * こうすると保存の時にネットの画像の許可リスト（SSRF 除け）を広げなくて済む。
 */
async function generateWithHiggsfield(
  query: string,
  model: string,
): Promise<
  { ok: true; candidate: ImageCandidate; ms: number } | { ok: false; reason: string; ms: number }
> {
  const { runHiggsfield } = await import("./higgsfield.server");
  const r = await runHiggsfield(
    model,
    { prompt: imagePrompt(query), aspect_ratio: "1:1" },
    { timeoutMs: 45_000 },
  );
  if (!r.ok) return { ok: false, reason: r.reason, ms: r.ms };
  try {
    const img = await fetch(r.url, { signal: AbortSignal.timeout(20_000) });
    const ct = (img.headers.get("content-type") ?? "image/png").split(";")[0].trim();
    if (!img.ok || !ALLOWED_IMAGE_MIME.test(ct))
      return { ok: false, reason: "絵を受け取れませんでした", ms: r.ms };
    const b64 = Buffer.from(new Uint8Array(await img.arrayBuffer())).toString("base64");
    const url = `data:${ct};base64,${b64}`;
    return { ok: true, candidate: { url, thumb: url, source: "ai" }, ms: r.ms };
  } catch {
    return { ok: false, reason: "絵を受け取れませんでした", ms: r.ms };
  }
}

/**
 * **画像生成を実際に1回試す（開発者だけ）**（オーナー指示 2026-09-28「HIGGSFIELD の
 * api を lovable で設定したから実際に検査して」）。
 *
 * 設定の開発者欄のボタンから呼ぶ。**本当に1枚作る**（Higgsfield の残高を使う）。
 * 返すのは: どこで作ったか・鍵を見つけた名前（値は返さない）・結果・かかった時間。
 */
export const testImageGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().min(1).max(60).default("柚子") }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin role required");
    const config = readImageConfig(process.env);
    const { higgsfieldCredentialSource } = await import("./higgsfield.server");
    const credentialName = higgsfieldCredentialSource();
    const started = Date.now();
    if (config.provider === "higgsfield") {
      const r = await generateWithHiggsfield(data.query, config.model);
      return {
        provider: config.provider,
        model: config.model,
        credentialName,
        ok: r.ok,
        image: r.ok ? r.candidate.url : null,
        reason: r.ok ? null : r.reason,
        ms: Date.now() - started,
      };
    }
    const one = await generateOneAiImage(data.query);
    return {
      provider: config.provider,
      model: config.model,
      credentialName,
      ok: !!one,
      image: one?.url ?? null,
      reason: one
        ? null
        : config.provider === "off"
          ? "IMAGE_PROVIDER=off"
          : "生成できませんでした",
      ms: Date.now() - started,
    };
  });

async function generateWithOpenRouter(
  query: string,
  model: string,
): Promise<ImageCandidate | null> {
  const { findKey } = await import("./ai-provider.server");
  const key = findKey("openrouter")?.value;
  if (!key) return null;
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const prompt = imagePrompt(query);
  try {
    // Seedream のような絵だけの型は**専用の口**でしか受けない。
    let res = await fetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers,
      body: JSON.stringify({ model, prompt }),
      signal: AbortSignal.timeout(40_000),
    });
    // 専用の口が無い型（会話で絵も返す型）は、会話の口で頼み直す。
    if (!res.ok && res.status >= 400 && res.status < 500) {
      res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          modalities: ["image", "text"],
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(40_000),
      });
    }
    if (!res.ok) {
      console.warn("openrouter image failed", res.status);
      return null;
    }
    const url = pickOpenRouterImage(await res.json());
    return url ? { url, thumb: url, source: "ai" } : null;
  } catch (e) {
    console.warn("openrouter image failed", e);
    return null;
  }
}

async function generateWithLovable(prompt: string): Promise<ImageCandidate | null> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_LOVABLE_IMAGE_MODEL,
        prompt: imagePrompt(prompt),
        quality: "low",
        size: "1024x1024",
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const first = json.data?.[0];
    if (first?.b64_json) {
      const url = `data:image/png;base64,${first.b64_json}`;
      return { url, thumb: url, source: "ai" };
    }
    if (first?.url) {
      return { url: first.url, thumb: first.url, source: "ai" };
    }
    return null;
  } catch (e) {
    console.warn("AI image fallback failed", e);
    return null;
  }
}

/**
 * Download a remote image URL on the server (avoids browser CORS) and return
 * a base64 data URL ready for upload to Storage.
 */
const FetchInput = z.object({ url: z.string().url().max(2000) });

// Allowlist of external image hosts we're willing to proxy. Keeps this
// endpoint from being abused as an SSRF gadget against internal/metadata
// endpoints (e.g. 169.254.169.254) or arbitrary internal services.
//
// **コモンズの置き場も許す**（2026-09-28 の点検で発見）。候補にコモンズの写真
// （`upload.wikimedia.org`）を出しているのに、ここで断っていたので**選んでも保存
// できなかった**。置き場は固定の1つなので、許可を1つ足すだけで SSRF 除けは保てる。
const ALLOWED_IMAGE_HOSTS = new Set<string>([
  "images.unsplash.com",
  "plus.unsplash.com",
  "upload.wikimedia.org",
]);

const ALLOWED_IMAGE_MIME = /^image\/(jpeg|jpg|png|webp|gif|avif)$/i;

export const fetchImageAsDataUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FetchInput.parse(input))
  .handler(async ({ data }): Promise<{ dataUrl: string }> => {
    let parsed: URL;
    try {
      parsed = new URL(data.url);
    } catch {
      throw new Error("Invalid URL");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("Only https URLs are permitted");
    }
    if (!ALLOWED_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) {
      throw new Error("URL host is not permitted");
    }
    const res = await fetch(parsed.toString(), { redirect: "error" });
    if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
    const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!ALLOWED_IMAGE_MIME.test(ct)) {
      throw new Error("Response is not a permitted image type");
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    // base64 encode (Buffer is available in workers via nodejs_compat)
    const b64 = Buffer.from(buf).toString("base64");
    return { dataUrl: `data:${ct};base64,${b64}` };
  });
