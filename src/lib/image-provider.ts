/**
 * **文字検索の絵を AI で作る所の切り替え**（オーナー指示 2026-09-27
 * 「文字検索の画像を AI 生成（OpenRouter / Seedream など）、設定で切り替え、
 * 簡単に設定できるように」）。
 *
 * 設定はサーバの秘密（Lovable Cloud → Secrets）に**名前と値を足すだけ**:
 *
 * | 名前 | 値 | 意味 |
 * |---|---|---|
 * | `IMAGE_PROVIDER` | `lovable`（既定）/ `openrouter` / `higgsfield` / `off` | どこで作るか |
 * | `HF_CREDENTIALS` | `鍵ID:鍵の秘密` | Higgsfield の鍵。これがあり `IMAGE_PROVIDER` が空なら Higgsfield |
 * | `IMAGE_MODEL` | 例 `bytedance-seed/seedream-5-0-pro` | OpenRouter のときの型番 |
 * | `IMAGE_SEARCH_MODE` | `photo-first`（既定）/ `ai-first` | 写真と AI のどちらを先に出すか |
 *
 * 手順書は `docs/image-generation-guide.md`。ここは**値の読み方だけ**を
 * 決める純粋な関数（外の世界に触れないので試せる）。
 */
export type ImageProviderId = "lovable" | "openrouter" | "higgsfield" | "off";
export type ImageSearchMode = "photo-first" | "ai-first";

export type ImageConfig = {
  provider: ImageProviderId;
  /** OpenRouter / Higgsfield の型番。`lovable` のときは使わない。 */
  model: string;
  mode: ImageSearchMode;
};

/**
 * Higgsfield の既定の絵の型（1回ごとに Higgsfield の残高から引かれる）。
 * 型番は Higgsfield の「モデル」画面の API の欄に出ている文字列。
 */
export const DEFAULT_HIGGSFIELD_IMAGE_MODEL = "bytedance/seedream/v4/text-to-image";
export const HIGGSFIELD_BASE_URL = "https://api.higgsfield.ai";

/**
 * **Higgsfield の鍵を探す**（オーナー指示 2026-09-28「HIGGSFIELD の api を lovable で
 * 設定したから実際に検査して」）。Lovable に入れた名前が分からないので、公式の
 * SDK が読む名前と、よく付けられる名前を順に見る。返すのは**名前と値**。値は
 * サーバの中だけで使い、画面・記録には**名前だけ**を出す。
 *
 * 形は2つ: 1つの秘密に `鍵ID:鍵の秘密`（公式の推奨）／ID と秘密を別々の2つ。
 */
export function readHiggsfieldCredentials(
  env: Record<string, string | undefined>,
): { credentials: string; source: string } | null {
  for (const name of ["HF_CREDENTIALS", "HF_KEY", "HIGGSFIELD_CREDENTIALS", "HIGGSFIELD_KEY"]) {
    const v = (env[name] ?? "").trim();
    if (v.includes(":")) return { credentials: v, source: name };
  }
  for (const [idName, secretName] of [
    ["HF_API_KEY", "HF_API_SECRET"],
    ["HIGGSFIELD_API_KEY", "HIGGSFIELD_API_SECRET"],
    ["HIGGSFIELD_KEY_ID", "HIGGSFIELD_KEY_SECRET"],
  ] as const) {
    const id = (env[idName] ?? "").trim();
    const secret = (env[secretName] ?? "").trim();
    if (id && secret)
      return { credentials: `${id}:${secret}`, source: `${idName} + ${secretName}` };
    // 1つの名前に `ID:秘密` を丸ごと入れた場合も拾う。
    if (id.includes(":") && !secret) return { credentials: id, source: idName };
  }
  return null;
}

/** Higgsfield の状態の返事から、終わったか・絵/動画の URL を取り出す。 */
export function pickHiggsfieldResult(json: unknown): {
  status: string;
  requestId: string | null;
  url: string | null;
} {
  const j = json as {
    status?: string;
    request_id?: string;
    images?: Array<{ url?: string }>;
    video?: { url?: string };
  };
  return {
    status: typeof j?.status === "string" ? j.status : "unknown",
    requestId: typeof j?.request_id === "string" ? j.request_id : null,
    url: j?.images?.[0]?.url || j?.video?.url || null,
  };
}

/** 型番を指定しなかったときの OpenRouter の既定。 */
export const DEFAULT_OPENROUTER_IMAGE_MODEL = "bytedance-seed/seedream-5-0-pro";
export const DEFAULT_LOVABLE_IMAGE_MODEL = "openai/gpt-image-1-mini";

/** 秘密の値から設定を読む。**知らない値は既定に戻す**（打ち間違いで止めない）。 */
export function readImageConfig(env: Record<string, string | undefined>): ImageConfig {
  const p = (env.IMAGE_PROVIDER ?? "").trim().toLowerCase();
  // **Higgsfield の鍵があって、どこで作るかを決めていないなら Higgsfield**。
  // 鍵を入れただけで使われる（名前を1つ足す手間を省く）。
  const provider: ImageProviderId =
    p === "openrouter" || p === "off" || p === "higgsfield"
      ? p
      : !p && readHiggsfieldCredentials(env)
        ? "higgsfield"
        : "lovable";
  const m = (env.IMAGE_MODEL ?? "").trim();
  const model =
    provider === "openrouter"
      ? m || DEFAULT_OPENROUTER_IMAGE_MODEL
      : provider === "higgsfield"
        ? m || DEFAULT_HIGGSFIELD_IMAGE_MODEL
        : DEFAULT_LOVABLE_IMAGE_MODEL;
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
