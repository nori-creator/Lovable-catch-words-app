import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ImageCandidate = {
  url: string;
  thumb: string;
  source: "unsplash" | "ai";
  credit?: { name: string; link: string };
};

const SearchInput = z.object({
  query: z.string().min(1).max(120),
  language: z.string().default("zh-TW"),
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

    // Always offer at least one AI fallback option so user has a choice when
    // photo search returns nothing or is unconfigured.
    if (candidates.length === 0) {
      const ai = await generateOneAiImage(data.query);
      if (ai) candidates.push(ai);
    }

    return { candidates: candidates.slice(0, 6) };
  });

async function generateOneAiImage(prompt: string): Promise<ImageCandidate | null> {
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
        model: "openai/gpt-image-1-mini",
        prompt: `A clear, minimalistic photo-realistic image representing: ${prompt}. Plain background, centered subject.`,
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

export const fetchImageAsDataUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FetchInput.parse(input))
  .handler(async ({ data }): Promise<{ dataUrl: string }> => {
    const res = await fetch(data.url);
    if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    const buf = new Uint8Array(await res.arrayBuffer());
    // base64 encode (Buffer is available in workers via nodejs_compat)
    const b64 = Buffer.from(buf).toString("base64");
    return { dataUrl: `data:${ct};base64,${b64}` };
  });
