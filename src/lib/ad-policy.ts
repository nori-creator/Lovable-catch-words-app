/**
 * **広告を出すかどうかの決まり**（オーナー指示 2026-09-27「Google 広告はどのタイミングで
 * 広告を表示したり、どんな頻度で広告を表示するか考えて。素人だからなるべく自動的やって、
 * 広告は開発者の私はオンオフできるようにして」）。
 *
 * Google AdMob の指針（全画面広告は「区切りの所」にだけ、出しすぎると配信を止められる）に
 * 沿って、**学びの流れを止めない所だけ**に出す。数は開発者の設定（`AdConfig`）で変えられる。
 *
 * - 出さない: Pro の人、使い始めて `graceDays` 日の間、撮る・スキャン・保存の最中、
 *   アプリを開いた瞬間、初回の案内。
 * - 全画面（インタースティシャル）: 復習の束を `batchesPerInterstitial` 回終えるごとに1回。
 *   前回から `minGapMin` 分以上空け、1日 `maxPerDay` 回まで。
 * - 一覧の中の広告（ネイティブ）: 図鑑の一覧で、札 `nativeEvery` 枚ごとに1枠（最初の
 *   `nativeFirst` 枚の中には置かない）。
 * - ごほうび広告（リワード）: 本人が押した時だけ。見終わったら無料の人も解説の作り直しを1回。
 */
export type AdConfig = {
  enabled: boolean;
  graceDays: number;
  batchesPerInterstitial: number;
  minGapMin: number;
  maxPerDay: number;
  nativeEvery: number;
  nativeFirst: number;
  rewardedEnabled: boolean;
};

export const DEFAULT_AD_CONFIG: AdConfig = {
  enabled: false,
  graceDays: 3,
  batchesPerInterstitial: 3,
  minGapMin: 10,
  maxPerDay: 3,
  nativeEvery: 12,
  nativeFirst: 8,
  rewardedEnabled: true,
};

/** 保存されている形を今の形に揃える（範囲の外の数は既定に戻す）。 */
export function normalizeAdConfig(raw: unknown): AdConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const int = (k: keyof AdConfig, min: number, max: number) => {
    const v = Number(r[k]);
    return Number.isInteger(v) && v >= min && v <= max ? v : (DEFAULT_AD_CONFIG[k] as number);
  };
  return {
    enabled: r.enabled === true,
    graceDays: int("graceDays", 0, 60),
    batchesPerInterstitial: int("batchesPerInterstitial", 1, 20),
    minGapMin: int("minGapMin", 0, 240),
    maxPerDay: int("maxPerDay", 0, 20),
    nativeEvery: int("nativeEvery", 4, 100),
    nativeFirst: int("nativeFirst", 0, 100),
    rewardedEnabled: r.rewardedEnabled !== false,
  };
}

export type AdMoment =
  | "review_batch_end"
  | "app_open"
  | "onboarding"
  | "capture"
  | "scan"
  | "catch_saved";

export type AdHistory = {
  /** 最後に全画面広告を出した時刻（ms）。 */
  lastShownAt: number | null;
  /** 今日すでに出した全画面広告の数。 */
  shownToday: number;
  /** 前回の広告から後に終えた復習の束の数（今回の束は含まない）。 */
  batchesSinceLast: number;
};

export type AdDecision =
  | {
      show: false;
      reason: "off" | "pro" | "grace" | "never_here" | "not_yet" | "too_soon" | "daily_cap";
    }
  | { show: true; format: "interstitial" };

export function decideInterstitial(p: {
  moment: AdMoment;
  cfg: AdConfig;
  isPro: boolean;
  installedAt: number;
  now: number;
  history: AdHistory;
}): AdDecision {
  const { cfg, history } = p;
  if (!cfg.enabled) return { show: false, reason: "off" };
  if (p.isPro) return { show: false, reason: "pro" };
  if (p.now - p.installedAt < cfg.graceDays * 86400000) return { show: false, reason: "grace" };
  if (p.moment !== "review_batch_end") return { show: false, reason: "never_here" };
  if (history.batchesSinceLast + 1 < cfg.batchesPerInterstitial)
    return { show: false, reason: "not_yet" };
  if (history.lastShownAt !== null && p.now - history.lastShownAt < cfg.minGapMin * 60000)
    return { show: false, reason: "too_soon" };
  if (history.shownToday >= cfg.maxPerDay) return { show: false, reason: "daily_cap" };
  return { show: true, format: "interstitial" };
}

/** 図鑑の一覧で、広告の枠を置く位置（札の並びの何番目の後か。0始まり）。 */
export function nativeSlots(count: number, cfg: AdConfig, isPro: boolean): number[] {
  if (!cfg.enabled || isPro || count <= cfg.nativeFirst) return [];
  const out: number[] = [];
  for (let i = Math.max(cfg.nativeFirst, cfg.nativeEvery) - 1; i < count - 1; i += cfg.nativeEvery)
    out.push(i);
  return out;
}
