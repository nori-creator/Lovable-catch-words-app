/**
 * **文字検索の絵を AI で作る所の切り替え**（オーナー指示 2026-09-27
 * 「文字検索の画像を AI 生成（OpenRouter / Seedream など）、設定で切り替え、
 * 簡単に設定できるように」）。
 *
 * 設定はサーバの秘密（Lovable Cloud → Secrets）に**名前と値を足すだけ**:
 *
 * | 名前 | 値 | 意味 |
 * |---|---|---|
 * | `IMAGE_PROVIDER` | `lovable`（既定）/ `openrouter` / `off` | どこで作るか |
 * | `IMAGE_MODEL` | 例 `bytedance-seed/seedream-5-0-pro` | OpenRouter のときの型番 |
 * | `IMAGE_SEARCH_MODE` | `photo-first`（既定）/ `ai-first` | 写真と AI のどちらを先に出すか |
 *
 * 手順書は `docs/image-generation-guide.md`。ここは**値の読み方だけ**を
 * 決める純粋な関数（外の世界に触れないので試せる）。
 */
export type ImageProviderId = "lovable" | "openrouter" | "google" | "openai" | "off";
export type ImageSearchMode = "photo-first" | "ai-first";

export type ImageConfig = {
  provider: ImageProviderId;
  /** OpenRouter の型番。`lovable` のときは使わない。 */
  model: string;
  mode: ImageSearchMode;
};

/** 型番を指定しなかったときの OpenRouter の既定。 */
export const DEFAULT_OPENROUTER_IMAGE_MODEL = "bytedance-seed/seedream-5-0-pro";
export const DEFAULT_LOVABLE_IMAGE_MODEL = "openai/gpt-image-1-mini";
export const DEFAULT_GOOGLE_IMAGE_MODEL = "gemini-2.5-flash-image";
export const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1-mini";

/** Admin override contains only routing information, never credentials. */
export function resolveImageConfig(
  env: Record<string, string | undefined>,
  override?: { provider?: string; model?: string } | null,
): ImageConfig {
  const fallback = readImageConfig(env);
  const candidate = override?.provider?.trim().toLowerCase();
  const provider: ImageProviderId =
    candidate === "lovable" ||
    candidate === "openrouter" ||
    candidate === "google" ||
    candidate === "openai" ||
    candidate === "off"
      ? candidate
      : fallback.provider;
  const defaults: Record<ImageProviderId, string> = {
    lovable: DEFAULT_LOVABLE_IMAGE_MODEL,
    openrouter: DEFAULT_OPENROUTER_IMAGE_MODEL,
    google: DEFAULT_GOOGLE_IMAGE_MODEL,
    openai: DEFAULT_OPENAI_IMAGE_MODEL,
    off: "",
  };
  const model =
    override?.model?.trim() ||
    (provider === fallback.provider ? fallback.model : defaults[provider]);
  return { provider, model, mode: fallback.mode };
}

/** 秘密の値から設定を読む。**知らない値は既定に戻す**（打ち間違いで止めない）。 */
export function readImageConfig(env: Record<string, string | undefined>): ImageConfig {
  const p = (env.IMAGE_PROVIDER ?? "").trim().toLowerCase();
  const provider: ImageProviderId =
    p === "openrouter" || p === "google" || p === "openai" || p === "off" ? p : "lovable";
  const m = (env.IMAGE_MODEL ?? "").trim();
  const model =
    m ||
    (
      {
        openrouter: DEFAULT_OPENROUTER_IMAGE_MODEL,
        google: DEFAULT_GOOGLE_IMAGE_MODEL,
        openai: DEFAULT_OPENAI_IMAGE_MODEL,
        lovable: DEFAULT_LOVABLE_IMAGE_MODEL,
        off: "",
      } as const
    )[provider];
  const mode: ImageSearchMode =
    (env.IMAGE_SEARCH_MODE ?? "").trim().toLowerCase() === "ai-first" ? "ai-first" : "photo-first";
  return { provider, model, mode };
}

/** 絵を作らせる指示。物がはっきり分かる、背景の少ない1枚。 */
export function imagePrompt(query: string): string {
  return `A clear, minimalistic photo-realistic image representing: ${query}. Plain background, centered subject, no text.`;
}

/**
 * OpenRouter の返事から絵を取り出す。形が2つある:
 * - 絵の専用の口（`/api/v1/images`）… `data[].b64_json`
 * - 会話の口（`/chat/completions` に `modalities`）… `choices[0].message.images[].image_url.url`
 */
export function pickOpenRouterImage(json: unknown): string | null {
  const j = json as {
    data?: Array<{ b64_json?: string; media_type?: string; url?: string }>;
    choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
  };
  const d = j?.data?.[0];
  if (d?.b64_json) return `data:${d.media_type || "image/png"};base64,${d.b64_json}`;
  if (d?.url) return d.url;
  const c = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  return c || null;
}
