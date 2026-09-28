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
  resolveImageConfig,
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
  purpose: z.enum(["text-catch", "candidates"]).default("candidates"),
});

/**
 * Search Unsplash for image candidates representing the given word.
 * Falls back to AI generation when Unsplash is unavailable or yields no result.
 */
export const searchImageCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SearchInput.parse(input))
  .handler(async ({ data }): Promise<{ candidates: ImageCandidate[] }> => {
    // Typed catches use an original generated illustration, never stock photos.
    if (data.purpose === "text-catch") {
      const ai = await generateOneAiImage(data.query);
      return { candidates: ai ? [ai] : [] };
    }
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
  let override: { provider?: string; model?: string } | null = null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_config")
      .select("value")
      .eq("key", "image_generation")
      .maybeSingle();
    override = (data as { value?: typeof override } | null)?.value ?? null;
  } catch (error) {
    console.warn("image config unavailable; using environment default", error);
  }
  const config = resolveImageConfig(process.env, override);
  if (config.provider === "off") return null;
  if (config.provider === "openrouter") return generateWithOpenRouter(query, config.model);
  if (config.provider === "google") return generateWithGoogle(query, config.model);
  if (config.provider === "openai") return generateWithOpenAI(query, config.model);
  return generateWithLovable(query, config.model);
}

async function generateWithGoogle(query: string, model: string): Promise<ImageCandidate | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: imagePrompt(query) }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
        signal: AbortSignal.timeout(40_000),
      },
    );
    if (!res.ok) {
      console.warn("google image failed", res.status);
      return null;
    }
    const json = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
      }>;
    };
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!part?.data) return null;
    const url = `data:${part.mimeType || "image/png"};base64,${part.data}`;
    return { url, thumb: url, source: "ai" };
  } catch (error) {
    console.warn("google image failed", error);
    return null;
  }
}

async function generateWithOpenAI(query: string, model: string): Promise<ImageCandidate | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: imagePrompt(query),
        size: "1024x1024",
        quality: "low",
      }),
      signal: AbortSignal.timeout(40_000),
    });
    if (!res.ok) {
      console.warn("openai image failed", res.status);
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const first = json.data?.[0];
    const url = first?.b64_json ? `data:image/png;base64,${first.b64_json}` : first?.url;
    return url ? { url, thumb: url, source: "ai" } : null;
  } catch (error) {
    console.warn("openai image failed", error);
    return null;
  }
}

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

async function generateWithLovable(
  prompt: string,
  model = DEFAULT_LOVABLE_IMAGE_MODEL,
): Promise<ImageCandidate | null> {
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
        model,
        prompt: imagePrompt(prompt),
        quality: "low",
        size: "1024x1024",
      }),
      signal: AbortSignal.timeout(40_000),
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
const ALLOWED_IMAGE_HOSTS = new Set<string>(["images.unsplash.com", "plus.unsplash.com"]);

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
