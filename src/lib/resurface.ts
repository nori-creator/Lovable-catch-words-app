/**
 * **昔の1枚を、ときどき出す**（PRODUCT「Home」: Past memories should be resurfaced
 * selectively (e.g. “three months ago — can you still say this?”) rather than requiring
 * endless archive browsing. / ROADMAP Phase 8-6）。
 *
 * ## 出す条件（全部そろった時だけ）
 * 1. 語が **30 以上**ある（少ないうちは昔の語も今の語と同じくらい近い）。
 * 2. **60 日以上前**に撮った、写真のある札。
 * 3. その語の記憶が**まずまず**（いま思い出せる確率 `memoryOf` が 60% 以上）。
 *    — 「まだ言える？」は、言えそうな語に聞く**楽しい問い**。忘れかけの語を出すと
 *    「たまった借り」に見える（ROADMAP Phase 7-1 と同じ考え）。忘れかけの語は復習の仕事。
 * 4. **1日に1枚まで**、しかも前に出した日から `MIN_GAP_DAYS` 日あける（「ときどき」）。
 * 5. 今日閉じたら、今日はもう出さない。
 *
 * 同じ日のうちは同じ1枚（開き直しても入れ替わらない）。選び方は日付から決まる
 * （試験で確かめられるよう、乱数を使わない）。月の節目（ちょうど 2・3・6 か月前など）の
 * 札があればそれを先に選ぶ — 「3か月前の今日」は「97日前」より思い出しやすい。
 *
 * ここには外の世界に触れるものを入れない（読み書きは `ResurfaceCard` 側）。
 */

import { taipeiDay } from "@/lib/taipei-day";

export const RESURFACE_MIN_WORDS = 30;
export const RESURFACE_MIN_AGE_DAYS = 60;
export const RESURFACE_MIN_RECALL = 60;
/** 出した日から次に出せる日までの日数（2 = 1日おき以上）。 */
export const RESURFACE_MIN_GAP_DAYS = 2;
/** 最近出した札を覚えておく数（同じ札が続けて出ないように）。 */
export const RESURFACE_RECENT = 12;
export const RESURFACE_STORAGE_KEY = "home-resurface-v1";

const DAY_MS = 86_400_000;
const MONTH_DAYS = 30.44;

export type ResurfaceItem = {
  id: string;
  /** 撮った時刻（ISO）。 */
  caughtAt: string;
  hasPhoto: boolean;
};

/** 端末に覚えておく物。 */
export type ResurfaceState = {
  /** 最後に出した日（台湾の日付 `YYYY-MM-DD`）。 */
  day?: string;
  /** その日に出した札。 */
  id?: string;
  /** その日に閉じたか。 */
  dismissed?: boolean;
  /** 最近出した札（新しい順）。 */
  recent?: string[];
};

export type ResurfacePick = {
  id: string;
  ageDays: number;
  /** 見出しの言い方（「3か月前」/「1年前」）。 */
  unit: "months" | "years";
  n: number;
};

export function parseResurfaceState(raw: unknown): ResurfaceState {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v !== "object") return {};
    return {
      day: typeof v.day === "string" ? v.day : undefined,
      id: typeof v.id === "string" ? v.id : undefined,
      dismissed: v.dismissed === true,
      recent: Array.isArray(v.recent)
        ? v.recent.filter((x): x is string => typeof x === "string").slice(0, RESURFACE_RECENT)
        : [],
    };
  } catch {
    return {};
  }
}

/** `YYYY-MM-DD` どうしの日数の差（b − a）。 */
export function dayDiff(a: string, b: string): number {
  const pa = Date.parse(`${a}T00:00:00Z`);
  const pb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(pa) || !Number.isFinite(pb)) return Number.POSITIVE_INFINITY;
  return Math.round((pb - pa) / DAY_MS);
}

/** 経過日数を見出しの言い方に（60〜364 日は「〇か月前」、それより前は「〇年前」）。 */
export function resurfaceAgeLabel(ageDays: number): { unit: "months" | "years"; n: number } {
  if (ageDays >= 365) return { unit: "years", n: Math.floor(ageDays / 365) };
  // 91 日は「3か月前」（切り捨てると「2か月前」になり、見た目の暦とずれる）。
  return { unit: "months", n: Math.min(11, Math.max(2, Math.round(ageDays / MONTH_DAYS))) };
}

/**
 * **「〇〇前に撮ったこの単語、覚えてる？」の「〇〇前」**（オーナー指示 2026-10-07「〇〇前に
 * 撮ったのこの単語覚えてる？に通知の名前を変えて」）。
 *
 * ホームの札は 60 日以上前の語だけ（「〇か月前」「〇年前」）だが、通知の語は撮って間もない
 * 語もあるので、短い方も言えるようにする:
 *   1 日未満 → 「今日撮った」、7 日未満 → 「〇日前」、30 日未満 → 「〇週間前」、
 *   1 年未満 → 「〇か月前」（`resurfaceAgeLabel` と同じ丸め。上は 11 か月）、それより前 → 「〇年前」。
 */
export type CaughtAgoUnit = "today" | "days" | "weeks" | "months" | "years";
export function caughtAgoLabel(ageDays: number): { unit: CaughtAgoUnit; n: number } {
  if (!Number.isFinite(ageDays) || ageDays < 1) return { unit: "today", n: 0 };
  const d = Math.floor(ageDays);
  if (d < 7) return { unit: "days", n: d };
  if (d < 30) return { unit: "weeks", n: Math.floor(d / 7) };
  if (d < 365) return { unit: "months", n: Math.min(11, Math.max(1, Math.round(d / MONTH_DAYS))) };
  return { unit: "years", n: Math.floor(d / 365) };
}

/**
 * 撮った時刻と「いつの時点で言うか」から、その言い方。読めない時刻は `null`。
 * 日数は**台湾の暦の日付の差**で数える（経過時間で数えると、きのう 23 時に撮った語を
 * けさ 8 時の通知で「今日撮った」と言ってしまう）。
 */
export function caughtAgoAt(
  caughtAt: string | null | undefined,
  atMs: number,
): { unit: CaughtAgoUnit; n: number } | null {
  if (!caughtAt) return null;
  const t = Date.parse(caughtAt);
  if (!Number.isFinite(t) || !Number.isFinite(atMs)) return null;
  return caughtAgoLabel(Math.max(0, dayDiff(taipeiDay(new Date(t)), taipeiDay(new Date(atMs)))));
}

/** 言い方 → 辞書の鍵（`i18n.tsx` の `remind.caught*`。ホームの札と通知で同じ文言）。 */
export const CAUGHT_AGO_KEY: Record<CaughtAgoUnit, string> = {
  today: "remind.caughtToday",
  days: "remind.caughtDays",
  weeks: "remind.caughtWeeks",
  months: "remind.caughtMonths",
  years: "remind.caughtYears",
};

/** 文字列から決まる小さな数（同じ日なら同じ札を選ぶため）。 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 条件 2・3 を満たす札。 */
export function resurfaceCandidates(
  items: readonly ResurfaceItem[],
  recall: ReadonlyMap<string, number>,
  nowMs: number,
): Array<ResurfaceItem & { ageDays: number }> {
  const out: Array<ResurfaceItem & { ageDays: number }> = [];
  for (const it of items) {
    if (!it.hasPhoto) continue;
    const at = Date.parse(it.caughtAt);
    if (!Number.isFinite(at)) continue;
    const ageDays = Math.floor((nowMs - at) / DAY_MS);
    if (ageDays < RESURFACE_MIN_AGE_DAYS) continue;
    const r = recall.get(it.id);
    if (r == null || !(r >= RESURFACE_MIN_RECALL)) continue;
    out.push({ ...it, ageDays });
  }
  return out;
}

/** ちょうど〇か月前・〇年前に近いか（前後 3 日）。 */
function nearAnniversary(ageDays: number): boolean {
  const offMonth = ageDays % MONTH_DAYS;
  const offYear = ageDays % 365;
  return Math.min(offMonth, MONTH_DAYS - offMonth) <= 3 || Math.min(offYear, 365 - offYear) <= 3;
}

/**
 * 今日ホームに出す1枚と、端末に覚えておく次の状態。出さない日は `pick: null`。
 * `state` が変わらない時は `next === state`（書き込まなくてよい）。
 */
export function pickResurface({
  items,
  recall,
  nowMs,
  today,
  state,
}: {
  items: readonly ResurfaceItem[];
  /** 札の id → いま思い出せる確率（0〜100、`memoryOf` の %）。 */
  recall: ReadonlyMap<string, number>;
  nowMs: number;
  /** 今日（台湾の日付 `YYYY-MM-DD`）。 */
  today: string;
  state: ResurfaceState;
}): { pick: ResurfacePick | null; next: ResurfaceState } {
  if (items.length < RESURFACE_MIN_WORDS) return { pick: null, next: state };
  const toPick = (c: ResurfaceItem & { ageDays: number }): ResurfacePick => ({
    id: c.id,
    ageDays: c.ageDays,
    ...resurfaceAgeLabel(c.ageDays),
  });

  // 今日もう出した: 閉じていなければ同じ1枚。
  if (state.day === today) {
    if (state.dismissed || !state.id) return { pick: null, next: state };
    const same = items.find((i) => i.id === state.id);
    if (!same) return { pick: null, next: state };
    const at = Date.parse(same.caughtAt);
    const ageDays = Number.isFinite(at) ? Math.floor((nowMs - at) / DAY_MS) : 0;
    return { pick: toPick({ ...same, ageDays }), next: state };
  }
  // 「ときどき」: 前に出した日から間をあける。
  if (state.day && dayDiff(state.day, today) < RESURFACE_MIN_GAP_DAYS) {
    return { pick: null, next: state };
  }

  const recent = new Set(state.recent ?? []);
  const all = resurfaceCandidates(items, recall, nowMs);
  const fresh = all.filter((c) => !recent.has(c.id));
  const pool = fresh.length > 0 ? fresh : all;
  if (pool.length === 0) return { pick: null, next: state };
  const anniversaries = pool.filter((c) => nearAnniversary(c.ageDays));
  const from = anniversaries.length > 0 ? anniversaries : pool;
  // 並びに左右されないよう id で並べてから、日付で1つ選ぶ。
  const sorted = [...from].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const chosen = sorted[hash(today) % sorted.length];
  return {
    pick: toPick(chosen),
    next: {
      day: today,
      id: chosen.id,
      dismissed: false,
      recent: [chosen.id, ...(state.recent ?? []).filter((x) => x !== chosen.id)].slice(
        0,
        RESURFACE_RECENT,
      ),
    },
  };
}

/** 今日は閉じる。 */
export function dismissResurface(state: ResurfaceState, today: string): ResurfaceState {
  return { ...state, day: today, dismissed: true };
}
