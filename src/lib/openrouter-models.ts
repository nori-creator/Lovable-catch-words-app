/**
 * OpenRouter のモデル一覧（`GET https://openrouter.ai/api/v1/models`）を、
 * 開発者の設定画面で選べる形に整える。
 *
 * 形の出どころ: 公式 SDK `@openrouter/sdk` 1.3.17 の `models/model.js`
 * （受け取る側の名前は snake_case: `context_length` /
 *  `architecture.input_modalities` / `pricing.prompt` / `pricing.completion`）。
 * 値段は**1トークンあたりの米ドルを文字列で**返す（例 "0.0000003"）。
 * 画面では 100万トークンあたりに直して出す。
 *
 * 形が合わない行は黙って落とす — 一覧の1行が壊れていても、選べる物は選べる。
 */
export type OpenRouterModel = {
  id: string;
  name: string;
  /** 100万トークンあたりの米ドル（入力 / 出力）。不明なら null。 */
  inPerM: number | null;
  outPerM: number | null;
  /** 画像を読めるか（スキャンに使えるか）。 */
  vision: boolean;
  context: number | null;
};

const perMillion = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1_000_000 * 1000) / 1000;
};

export function parseOpenRouterModels(raw: unknown): OpenRouterModel[] {
  const list = (raw as { data?: unknown })?.data;
  if (!Array.isArray(list)) return [];
  const out: OpenRouterModel[] = [];
  for (const m of list) {
    if (!m || typeof m !== "object") continue;
    const r = m as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id) continue;
    const arch = (r.architecture ?? {}) as { input_modalities?: unknown };
    const pricing = (r.pricing ?? {}) as { prompt?: unknown; completion?: unknown };
    const inputs = Array.isArray(arch.input_modalities) ? arch.input_modalities : [];
    out.push({
      id: r.id,
      name: typeof r.name === "string" && r.name ? r.name : r.id,
      inPerM: perMillion(pricing.prompt),
      outPerM: perMillion(pricing.completion),
      vision: inputs.includes("image"),
      context: typeof r.context_length === "number" ? r.context_length : null,
    });
  }
  // 名前順。同じ提供元（"google/…"）が並ぶので探しやすい。
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** 探す欄の絞り込み。空白で区切った語が**全部**、id か名前に入っている物。 */
export function filterModels(
  models: OpenRouterModel[],
  query: string,
  opts: { visionOnly?: boolean } = {},
): OpenRouterModel[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return models.filter(
    (m) =>
      (!opts.visionOnly || m.vision) &&
      words.every((w) => m.id.toLowerCase().includes(w) || m.name.toLowerCase().includes(w)),
  );
}

/** 画面に出す値段（"$0.30 / $2.50"）。無料は「無料」、不明は空。 */
export function priceLabel(m: OpenRouterModel, freeLabel: string): string {
  if (m.inPerM == null || m.outPerM == null) return "";
  if (m.inPerM === 0 && m.outPerM === 0) return freeLabel;
  const f = (n: number) => `$${n < 1 ? n.toFixed(2) : n.toFixed(n < 10 ? 2 : 0)}`;
  return `${f(m.inPerM)} / ${f(m.outPerM)}`;
}

/** 設定に保存する値（`getAiFor` が読む "provider:model"）。 */
export const OPENROUTER_PREFIX = "openrouter:";
export function toFeatureSpec(modelId: string): string {
  return `${OPENROUTER_PREFIX}${modelId}`;
}
export function fromFeatureSpec(spec: string | undefined): string | null {
  return spec?.startsWith(OPENROUTER_PREFIX) ? spec.slice(OPENROUTER_PREFIX.length) : null;
}
