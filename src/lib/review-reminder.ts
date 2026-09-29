/**
 * **復習の通知の時刻**（オーナー指示 2026-09-27「チュートリアル中に通知の時刻を
 * 設定できるようにしてるんだけど、それを設定の項目に追加して実装して。…ユーザーが
 * 独自に通知時刻を設定できるようにして。独自に設定する以外に AI で最適化の通知を
 * 選択できるようにして、復習の SRS のベストの復習タイミングのとき、また1日前に
 * ユーザーがこのアプリを使った時刻に通知して」）。
 *
 * ## 3つの形
 * - `off`    … 鳴らさない（既定）。
 * - `custom` … 本人が決めた時刻（1日3つまで）。チュートリアルの「朝 9:00 /
 *              夜 21:00」はここに読み替える。
 * - `ai`     … おまかせ。次の2つから1日2回まで:
 *     ① **復習がたまる時刻**（SRS）: これから24時間で、復習の時が来る語が
 *        `MIN_BATCH` 語そろう時刻。そこが「忘れかけ」のいちばん効く所で、
 *        1語ずつ鳴らすより、まとまった所で1回のほうが開いてもらえる。
 *     ② **昨日アプリを開いた時刻**: その時刻はその人の生活の中の空き時間。
 *   2つが近い（90分以内）ときは1回にまとめる。
 *
 * ## 静かな時間
 * 22:00〜8:00 は鳴らさない（翌朝 8:00 に回す）。夜中の通知は通知ごと
 * 切られる一番の理由になる。
 *
 * ## 正直に、できること・できないこと
 * - スマホのアプリ（Capacitor）では、端末に予約して**アプリを閉じていても鳴る**。
 *   予約はアプリを開くたびに次の24時間ぶんを作り直す（復習の状況が変わるため）。
 * - ブラウザ版は、閉じている間に鳴らす仕組み（Web Push とサーバの送信）が
 *   まだ無いので、**開いている間だけ**鳴る。
 */

export type ReminderMode = "off" | "custom" | "ai";
export type ReminderPrefs = {
  mode: ReminderMode;
  /** "HH:MM"（24時間）。`custom` のときの時刻。 */
  times: string[];
  /** `ai` のときに使う手がかり。 */
  ai: { srs: boolean; habit: boolean };
};
export type ReminderReason = "custom" | "srs" | "habit";
export type PlannedReminder = { at: Date; reason: ReminderReason };

export const MAX_CUSTOM_TIMES = 3;
/** 「まとまった」とみなす語数。 */
export const MIN_BATCH = 5;
/** これより近い2つの通知は1つにまとめる。 */
export const MERGE_WINDOW_MS = 90 * 60 * 1000;
/** 静かな時間（分。22:00〜翌 8:00）。 */
export const QUIET_START_MIN = 22 * 60;
export const QUIET_END_MIN = 8 * 60;

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  mode: "off",
  times: ["09:00"],
  ai: { srs: true, habit: true },
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(v: unknown): v is string {
  return typeof v === "string" && HHMM.test(v);
}

/** 重なりを除き、早い順に並べ、上限で切る。 */
export function cleanTimes(times: unknown[]): string[] {
  return [...new Set(times.filter(isValidTime))].sort().slice(0, MAX_CUSTOM_TIMES);
}

/**
 * 保存されている形（新旧どちらでも）を今の形に揃える。
 *
 * チュートリアルは `{ morning, evening }` だけを保存している（`first-catch.ts`）。
 * それを「朝 9:00 / 夜 21:00 の自分で決めた時刻」と読む。どちらも OFF なら `off`。
 */
export function normalizeReminderPrefs(raw: unknown): ReminderPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_REMINDER_PREFS };
  const r = raw as Record<string, unknown>;
  if (r.mode === "off" || r.mode === "custom" || r.mode === "ai") {
    const times = cleanTimes(Array.isArray(r.times) ? r.times : []);
    const ai = (r.ai ?? {}) as Record<string, unknown>;
    return {
      mode: r.mode,
      times: times.length ? times : [...DEFAULT_REMINDER_PREFS.times],
      ai: { srs: ai.srs !== false, habit: ai.habit !== false },
    };
  }
  const legacy = [r.morning === true ? "09:00" : null, r.evening === true ? "21:00" : null].filter(
    (v): v is string => v !== null,
  );
  return legacy.length
    ? { mode: "custom", times: legacy, ai: { ...DEFAULT_REMINDER_PREFS.ai } }
    : { ...DEFAULT_REMINDER_PREFS };
}

const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** 静かな時間に当たったら、その次の朝 8:00 に回す。 */
export function outsideQuietHours(d: Date): Date {
  const m = minuteOfDay(d);
  if (m >= QUIET_END_MIN && m < QUIET_START_MIN) return d;
  const out = new Date(d);
  if (m >= QUIET_START_MIN) out.setDate(out.getDate() + 1);
  out.setHours(QUIET_END_MIN / 60, 0, 0, 0);
  return out;
}

/** "HH:MM" が次に来る時（今日まだ来ていなければ今日、過ぎていれば明日）。 */
export function nextOccurrence(hhmm: string, now: Date): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

/**
 * ① 復習がたまる時刻。
 *
 * 時が来ている語と、これから24時間で時が来る語を早い順に並べ、
 * `MIN_BATCH` 語目の時刻を返す。24時間で `MIN_BATCH` に届かなければ、
 * 最後の1語の時刻（少なくても、その日のうちに1回は促す）。1語も無ければ null。
 * 既に `MIN_BATCH` 語以上たまっているなら「いま」ではなく**30分後**
 * （開いたばかりの人に即座に鳴らさない）。
 */
export function srsBestTime(dueTimes: Date[], now: Date): Date | null {
  const horizon = now.getTime() + 24 * 60 * 60 * 1000;
  const due = dueTimes
    .map((d) => d.getTime())
    .filter((t) => Number.isFinite(t) && t <= horizon)
    .sort((a, b) => a - b);
  if (due.length === 0) return null;
  const pick = due[Math.min(MIN_BATCH, due.length) - 1];
  const soonest = now.getTime() + 30 * 60 * 1000;
  return outsideQuietHours(new Date(Math.max(pick, soonest)));
}

/**
 * ② 昨日アプリを開いた時刻（いちばん早い1回）の、次に来る同じ時刻。
 * 昨日開いていなければ null。
 */
export function habitTime(opens: Date[], now: Date): Date | null {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const yesterday = opens.filter((d) => sameDay(d, y)).sort((a, b) => a.getTime() - b.getTime());
  if (!yesterday.length) return null;
  const first = yesterday[0];
  const hhmm = `${String(first.getHours()).padStart(2, "0")}:${String(first.getMinutes()).padStart(2, "0")}`;
  return outsideQuietHours(nextOccurrence(hhmm, now));
}

/**
 * 次の24時間に鳴らす予定を作る。早い順。
 *
 * `ai` で手がかりが1つも無い（復習が無い・昨日開いていない）日は鳴らさない —
 * 何もたまっていないのに「復習の時間です」と言うのは嘘になる。
 */
export function planReminders(
  prefs: ReminderPrefs,
  ctx: { dueTimes: Date[]; opens: Date[] },
  now: Date,
): PlannedReminder[] {
  if (prefs.mode === "off") return [];
  let out: PlannedReminder[] = [];
  if (prefs.mode === "custom") {
    out = cleanTimes(prefs.times).map((t) => ({ at: nextOccurrence(t, now), reason: "custom" }));
  } else {
    const srs = prefs.ai.srs ? srsBestTime(ctx.dueTimes, now) : null;
    const habit = prefs.ai.habit ? habitTime(ctx.opens, now) : null;
    if (srs) out.push({ at: srs, reason: "srs" });
    if (habit) {
      const near = srs && Math.abs(habit.getTime() - srs.getTime()) < MERGE_WINDOW_MS;
      if (!near) out.push({ at: habit, reason: "habit" });
    }
  }
  return out
    .filter((p) => p.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

// ---- 端末の記録（アプリを開いた時刻） -------------------------------------------

const OPENS_KEY = "app-opens-v1";
const KEEP_DAYS = 14;

/** 開いた時刻を控える。30分以内に続けて開いたものは1回と数える。 */
export function recordAppOpen(now = new Date()): void {
  try {
    const list = readAppOpens();
    const last = list[list.length - 1];
    if (last && now.getTime() - last.getTime() < 30 * 60 * 1000) return;
    const cutoff = now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000;
    const next = [...list.filter((d) => d.getTime() >= cutoff), now].map((d) => d.toISOString());
    localStorage.setItem(OPENS_KEY, JSON.stringify(next));
  } catch {
    /* 保存できない環境では控えない（おまかせの②が使われないだけ） */
  }
}

export function readAppOpens(): Date[] {
  try {
    const raw = JSON.parse(localStorage.getItem(OPENS_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.map((s) => new Date(String(s))).filter((d) => Number.isFinite(d.getTime()))
      : [];
  } catch {
    return [];
  }
}

// ---- 端末に置く設定の写し ----------------------------------------------------------
// 本物はアカウント（`user_metadata.notification_preferences`）。予約は端末で作るので、
// 開いた瞬間に通信を待たずに読めるよう、端末にも写しを置く。

const PREFS_KEY = "review-reminder-prefs-v1";

export function readLocalReminderPrefs(): ReminderPrefs | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? normalizeReminderPrefs(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeLocalReminderPrefs(p: ReminderPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* 保存できない環境では次に開いたときアカウントから読み直す */
  }
}
