/**
 * **節目の日の記念アルバム**（オーナー指示 2026-09-27「ユーザーがこのアプリを使って
 * 何日目とかの節目の日の記念で厳選した写真を選んで、その時の一言も含めて1枚の
 * ホームアルバムを自動生成して、通知が行くようにしたい」）。
 *
 * - 節目: 使い始めて **7・30・100・200・365日目**、その後は1年ごと。
 * - 厳選: 写真のある札から最大8枚。**日をまたいで散らす**（同じ日の写真ばかりに
 *   しない）。同じ日の中では、撮った時の一言がある札 → 新しい札 を選ぶ。
 * - 通知: 節目の日の 19:30 に端末へ予約（スマホのアプリのみ）。押すとホームで
 *   記念アルバムが開く。
 */
export const MILESTONE_DAYS = [7, 30, 100, 200, 365] as const;
export const MEMORIAL_MAX = 8;
/** 通知を鳴らす時刻（夕方、1日を振り返る時間）。 */
export const MEMORIAL_HOUR = 19;
export const MEMORIAL_MINUTE = 30;

const DAY = 24 * 60 * 60 * 1000;
const localMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** 使い始めた日を1日目として、今日が何日目か。 */
export function dayNumber(start: Date, now: Date): number {
  return Math.round((localMidnight(now).getTime() - localMidnight(start).getTime()) / DAY) + 1;
}

export function isMilestone(n: number): boolean {
  if ((MILESTONE_DAYS as readonly number[]).includes(n)) return true;
  return n > 365 && n % 365 === 0;
}

/** 今日が節目ならその日数、でなければ null。 */
export function milestoneToday(start: Date, now: Date): number | null {
  const n = dayNumber(start, now);
  return n >= 1 && isMilestone(n) ? n : null;
}

/** 次の節目の日（今日が節目でも、その次）。1000年先までは探さない。 */
export function nextMilestone(start: Date, now: Date): { n: number; date: Date } | null {
  const today = dayNumber(start, now);
  for (let n = Math.max(1, today + 1); n < today + 800; n++) {
    if (isMilestone(n)) {
      const d = localMidnight(start);
      d.setDate(d.getDate() + n - 1);
      return { n, date: d };
    }
  }
  return null;
}

export type MemorialCandidate = {
  id: string;
  created_at: string;
  caption?: string | null;
  hasPhoto: boolean;
};

/**
 * 記念アルバムに貼る札を選ぶ。**古い順**に返す（アルバムの時間の流れ）。
 *
 * 写真のある札を日ごとに束ね、日を均等な間隔で選び、その日の中で
 * 「一言がある → 新しい」の順で1枚。日の数が足りなければ、一言のある札から足す。
 */
export function pickHighlights<T extends MemorialCandidate>(items: T[], max = MEMORIAL_MAX): T[] {
  const withPhoto = items.filter((s) => s.hasPhoto);
  if (withPhoto.length <= max) {
    return [...withPhoto].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  const byDay = new Map<string, T[]>();
  for (const s of withPhoto) {
    const k = s.created_at.slice(0, 10);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const rank = (a: T, b: T) =>
    Number(!!b.caption?.trim()) - Number(!!a.caption?.trim()) ||
    b.created_at.localeCompare(a.created_at);
  const days = [...byDay.keys()].sort();
  const picked: T[] = [];
  const take = Math.min(max, days.length);
  for (let i = 0; i < take; i++) {
    // 最初と最後の日を必ず含め、その間を均等に。
    const idx = take === 1 ? 0 : Math.round((i * (days.length - 1)) / (take - 1));
    const best = [...byDay.get(days[idx])!].sort(rank)[0];
    if (!picked.includes(best)) picked.push(best);
  }
  if (picked.length < max) {
    const rest = withPhoto.filter((s) => !picked.includes(s)).sort(rank);
    picked.push(...rest.slice(0, max - picked.length));
  }
  return picked.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// ---- 一度見た節目は、その日のうちは閉じたままにする -----------------------------

const SEEN_KEY = "memorial-seen-v1";

export function wasMemorialDismissed(n: number): boolean {
  try {
    return (JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as number[]).includes(n);
  } catch {
    return false;
  }
}

export function dismissMemorial(n: number): void {
  try {
    const list = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as number[];
    localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...list, n])].slice(-20)));
  } catch {
    /* 保存できなければ次に開いた時もう一度出る（害は無い） */
  }
}
