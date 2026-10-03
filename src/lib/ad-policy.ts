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
 * - ごほうび広告（リワード）: 本人が押した時だけ。見終わったら**切り抜きを今日1枚追加**
 *   （2026-09-28 変更。解説の作り直しは Pro だけになったので、ごほうびにしない —
 *   `plan-limits.ts`）。
 *
 * ## 場所は後から変えられる（オーナー指示 2026-09-28「あとからどこに広告つけるか
 * 変更できるように」）
 * 出す場所ごとに開発者の設定でオン・オフできる（`AdConfig` の `*Enabled`）。
 * 既定は分析（`docs/monetization.md` §3）で決めた形:
 *
 * | 場所 | 既定 | 理由（短く） |
 * |---|---|---|
 * | 復習の束の区切り（全画面） | オン | 作業が終わった自然な切れ目（AdMob の指針） |
 * | 図鑑の一覧（札の形） | オン | 眺めている時間。邪魔にならない |
 * | 日記の間（札の形） | オン | 縦に流し読みする所。SNS と同じ置き方 |
 * | ごほうび（本人が押す） | オン | 見る人が自分で選ぶので不満が出にくい |
 * | 捕まえた後（全画面） | **オフ** | いちばん嬉しい瞬間。ここを遮ると「終わりの印象」が広告になる（ピーク・エンド） |
 *
 * ## Web 版（Google AdSense。2026-10-03「アプリ内の広告が動く 機能するようにしたい。」）
 * Web では全画面・ごほうびを出さない（Google の決まりでゲーム専用）。復習の区切りは
 * 終わりの画面の下の札にし、回数の決まりはこの `decideInterstitial` をそのまま使う。
 * 読み込む条件と枠の番号は `adsense.ts`。
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
  /** 復習の束の区切りの全画面。 */
  reviewEndEnabled: boolean;
  /** 捕まえた演出が終わって図鑑に戻った所の全画面（既定オフ）。 */
  afterCatchEnabled: boolean;
  /** 何回捕まえるごとに1回か（`afterCatchEnabled` のとき）。 */
  catchesPerInterstitial: number;
  /** 図鑑の一覧の札の形の広告。 */
  dexNativeEnabled: boolean;
  /** 日記（1日ずつの誌面）の間の札の形の広告。 */
  diaryNativeEnabled: boolean;
  /** 日記の何日ごとに1枠か。 */
  diaryEvery: number;
  /** 最初の何日の中には置かないか。 */
  diaryFirst: number;
  /**
   * **サブスク（Pro の購入口）を出すか**（開発者だけが切り替える。既定オフ）。
   * オフの間は、Pro を買う入口がどこにも出ない（開発者は自分で試せるよう設定に出る）。
   */
  subscriptionEnabled: boolean;
  /**
   * **Google AdSense の運営者 ID**（`ca-pub-` + 数字。2026-10-03「アプリ内の広告が動く
   * 機能するようにしたい」）。空なら「まだ用意していない」= Web の広告は何も読み込まない。
   * `/ads.txt` もこの値から作る（`adsense.ts`）。秘密ではない（広告のタグに必ず載る）。
   */
  adsensePublisherId: string;
  /** 図鑑の一覧の広告ユニットの番号（AdSense の `data-ad-slot`。数字だけ。空なら出さない）。 */
  slotDexInFeed: string;
  /** 日記（過去の日）の間の広告ユニットの番号。 */
  slotDiaryInFeed: string;
  /** 復習の区切り（終わりの画面の下の札）の広告ユニットの番号。 */
  slotReviewEnd: string;
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
  reviewEndEnabled: true,
  afterCatchEnabled: false,
  catchesPerInterstitial: 5,
  dexNativeEnabled: true,
  diaryNativeEnabled: true,
  diaryEvery: 5,
  diaryFirst: 2,
  subscriptionEnabled: false,
  adsensePublisherId: "",
  slotDexInFeed: "",
  slotDiaryInFeed: "",
  slotReviewEnd: "",
};

/** AdSense の運営者 ID の形（`ca-pub-` + 数字）。 */
const PUBLISHER_ID = /^ca-pub-\d{10,20}$/;
/** 広告ユニットの番号の形（数字だけ）。 */
const SLOT_ID = /^\d{6,20}$/;

/**
 * 運営者 ID を揃える。前後の空白を削り、`pub-…`（`ads.txt` の書き方）で貼られても
 * `ca-pub-…` に直す。形が違えば空（= 未設定）。
 */
export function normalizePublisherId(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const v = raw.trim();
  const id = /^pub-\d+$/.test(v) ? `ca-${v}` : v;
  return PUBLISHER_ID.test(id) ? id : "";
}

/** 広告ユニットの番号を揃える（数字だけ。違えば空）。 */
export function normalizeSlotId(raw: unknown): string {
  const v = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  return SLOT_ID.test(v) ? v : "";
}

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
    reviewEndEnabled: r.reviewEndEnabled !== false,
    afterCatchEnabled: r.afterCatchEnabled === true,
    catchesPerInterstitial: int("catchesPerInterstitial", 1, 50),
    dexNativeEnabled: r.dexNativeEnabled !== false,
    diaryNativeEnabled: r.diaryNativeEnabled !== false,
    diaryEvery: int("diaryEvery", 2, 60),
    diaryFirst: int("diaryFirst", 0, 60),
    subscriptionEnabled: r.subscriptionEnabled === true,
    adsensePublisherId: normalizePublisherId(r.adsensePublisherId),
    slotDexInFeed: normalizeSlotId(r.slotDexInFeed),
    slotDiaryInFeed: normalizeSlotId(r.slotDiaryInFeed),
    slotReviewEnd: normalizeSlotId(r.slotReviewEnd),
  };
}

export type AdMoment =
  | "review_batch_end"
  | "app_open"
  | "onboarding"
  | "capture"
  | "scan"
  | "catch_saved"
  /** 捕まえた演出が終わり、図鑑に戻った所（`afterCatchEnabled` のときだけ候補）。 */
  | "catch_done";

export type AdHistory = {
  /** 最後に全画面広告を出した時刻（ms）。 */
  lastShownAt: number | null;
  /** 今日すでに出した全画面広告の数。 */
  shownToday: number;
  /** 前回の広告から後に終えた復習の束の数（今回の束は含まない）。 */
  batchesSinceLast: number;
  /** 前回の広告から後に捕まえた数（今回は含まない）。 */
  catchesSinceLast?: number;
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
  if (p.moment === "review_batch_end") {
    if (!cfg.reviewEndEnabled) return { show: false, reason: "never_here" };
    if (history.batchesSinceLast + 1 < cfg.batchesPerInterstitial)
      return { show: false, reason: "not_yet" };
  } else if (p.moment === "catch_done") {
    if (!cfg.afterCatchEnabled) return { show: false, reason: "never_here" };
    if ((history.catchesSinceLast ?? 0) + 1 < cfg.catchesPerInterstitial)
      return { show: false, reason: "not_yet" };
  } else return { show: false, reason: "never_here" };
  if (history.lastShownAt !== null && p.now - history.lastShownAt < cfg.minGapMin * 60000)
    return { show: false, reason: "too_soon" };
  if (history.shownToday >= cfg.maxPerDay) return { show: false, reason: "daily_cap" };
  return { show: true, format: "interstitial" };
}

/** 図鑑の一覧で、広告の枠を置く位置（札の並びの何番目の後か。0始まり）。 */
export function nativeSlots(count: number, cfg: AdConfig, isPro: boolean): number[] {
  if (!cfg.enabled || isPro || !cfg.dexNativeEnabled) return [];
  return feedSlots(count, cfg.nativeEvery, cfg.nativeFirst);
}

/**
 * 日記（1日ずつの誌面を縦に並べた所）で、広告の枠を置く位置（何日目の後か。0始まり）。
 * 一番下には置かない（読み終えた所に広告だけが残らないように）。
 */
export function diarySlots(days: number, cfg: AdConfig, isPro: boolean): number[] {
  if (!cfg.enabled || isPro || !cfg.diaryNativeEnabled) return [];
  return feedSlots(days, cfg.diaryEvery, cfg.diaryFirst);
}

function feedSlots(count: number, every: number, first: number): number[] {
  if (count <= first) return [];
  const out: number[] = [];
  for (let i = Math.max(first, every) - 1; i < count - 1; i += every) out.push(i);
  return out;
}

/** ごほうび広告（本人が押す）の入口を出すか。 */
export function rewardedAvailable(cfg: AdConfig, isPro: boolean): boolean {
  return cfg.enabled && cfg.rewardedEnabled && !isPro;
}
