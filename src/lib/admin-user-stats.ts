/**
 * **開発者だけが見る、利用者ごとの数字の計算**（オーナー指示 2026-09-27「開発者の私だけ、
 * 設定の欄から、それぞれのユーザーの詳しい情報を見れるようにして」）。
 *
 * 画面（`/admin/users`）とサーバ（`admin-users.functions.ts`）の間で使う、通信を
 * しない計算だけをここに置く（テストで確かめる）。
 */

/** 何日続けて撮ったか（今の連続と、いちばん長い連続）。日は "YYYY-MM-DD"。 */
export function streaks(days: string[], today: string): { current: number; best: number } {
  const set = [...new Set(days)].sort();
  if (!set.length) return { current: 0, best: 0 };
  const next = (d: string) => {
    const x = new Date(`${d}T12:00:00Z`);
    x.setUTCDate(x.getUTCDate() + 1);
    return x.toISOString().slice(0, 10);
  };
  let best = 1;
  let run = 1;
  for (let i = 1; i < set.length; i++) {
    run = next(set[i - 1]) === set[i] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  // 今の連続: 今日か昨日で終わっていれば続いている。
  const has = new Set(set);
  let cur = 0;
  let d = has.has(today) ? today : next(set[set.length - 1]) === today ? set[set.length - 1] : "";
  while (d && has.has(d)) {
    cur++;
    const x = new Date(`${d}T12:00:00Z`);
    x.setUTCDate(x.getUTCDate() - 1);
    d = x.toISOString().slice(0, 10);
  }
  return { current: cur, best };
}

export function median(nums: Array<number | null | undefined>): number | null {
  const v = nums
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    .sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

/** 画面の区分（離れる直前にいた画面の記録に使う）。 */
export const LEAVE_SCREENS = [
  "home",
  "dex",
  "capture",
  "scan",
  "review",
  "settings",
  "other",
] as const;
export type LeaveScreen = (typeof LEAVE_SCREENS)[number];

export function screenOf(pathname: string): LeaveScreen {
  const seg = pathname.replace(/^\/+/, "").split(/[/?#]/)[0];
  return (LEAVE_SCREENS as readonly string[]).includes(seg) ? (seg as LeaveScreen) : "other";
}

/**
 * 1回あたりの滞在（分）。`session_start` と、その後の最初の `session_end` を組にする。
 * 3時間より長い組は数えない（閉じ忘れ・記録の取りこぼし）。
 */
export function sessionMinutes(events: Array<{ kind: string; created_at: string }>): {
  sessions: number;
  medianMin: number | null;
  totalMin: number;
} {
  const ev = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lens: number[] = [];
  let start: number | null = null;
  for (const e of ev) {
    const t = Date.parse(e.created_at);
    if (e.kind === "session_start") start = t;
    else if (e.kind === "session_end" && start !== null) {
      const m = (t - start) / 60000;
      if (m >= 0 && m <= 180) lens.push(m);
      start = null;
    }
  }
  const total = lens.reduce((s, m) => s + m, 0);
  return {
    sessions: lens.length,
    medianMin: lens.length ? Math.round((median(lens.map((m) => m * 10)) ?? 0) / 10) : null,
    totalMin: Math.round(total),
  };
}

/**
 * **AI の費用の概算（米ドル）。** 呼び出し1回あたりの仮の単価 × 回数。
 * 単価は仮置き — 正確な額は各 AI の管理画面で確かめる（モデルと文の長さで変わる）。
 */
export const AI_UNIT_COST_USD: Record<string, number> = {
  scan_detect: 0.002,
  scan_parts: 0.002,
  suggest: 0.001,
  card: 0.004,
  phrase_card: 0.002,
  speaking_feedback: 0.002,
  correction: 0.003,
  journal_prompt: 0.001,
  wordbook: 0.004,
  quests: 0.001,
  tts: 0.0015,
  tts_pregen: 0.0015,
  removebg: 0.02,
};

export function aiCostEstimate(counts: Record<string, number>): {
  usd: number;
  byKind: Array<{ kind: string; count: number; usd: number }>;
} {
  const byKind = Object.entries(counts)
    .filter(([k]) => k in AI_UNIT_COST_USD)
    .map(([kind, count]) => ({ kind, count, usd: +(count * AI_UNIT_COST_USD[kind]).toFixed(4) }))
    .sort((a, b) => b.usd - a.usd);
  return { usd: +byKind.reduce((s, x) => s + x.usd, 0).toFixed(3), byKind };
}
