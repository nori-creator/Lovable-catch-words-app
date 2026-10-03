/**
 * 開発者だけ: 利用者ごとの情報（オーナー指示 2026-09-27）。本物の画面の中身
 * （`AdminUserDetailView` / `AdminUserListView` / `AdminOverviewView`）に、決まった見本の数字を
 * 渡して描く（通信・ログイン不要）。
 *
 * 2026-10-02「チャートやグラフをもっと詳しく、細かく、見やすく…名前なしのユーザーは消して、
 * 一覧は最も最近利用した人順に」: 既定はひとりの画面（新しいグラフ）。`?view=list` で全体と
 * 一覧（名前なしの人と、使った時刻がばらばらの人を混ぜて渡し、外れて並ぶのを見せる）。
 * 見本の数は乱数の種を固定して作るので、開くたびに同じ絵になる。
 */
import { useState } from "react";
import {
  AdminOverviewView,
  AdminUserDetailView,
  AdminUserListView,
} from "@/components/AdminUsersViews";
import type { AdminOverview, AdminUserDetail, AdminUserRow } from "@/lib/admin-users.functions";
import {
  addDays,
  aiCostEstimate,
  sessionLengthBuckets,
  type DailyActivity,
  type WeeklyReview,
} from "@/lib/admin-user-stats";

/** 見本の「今」。相対の時刻（何時間前）もこれで決まる。 */
const NOW = Date.parse("2026-10-02T13:00:00Z");
const TODAY = "2026-10-02";

/** 種を固定した乱数（mulberry32）。 */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 90日の動き: 週末に多く撮り、平日の夜に復習。途中に1週間休んだ所を入れる。 */
const DAILY: DailyActivity[] = (() => {
  const r = rng(7);
  return Array.from({ length: 90 }, (_, i) => {
    const day = addDays(TODAY, i - 89);
    const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
    const weekend = wd === 0 || wd === 6;
    const rest = i >= 40 && i <= 46; // 休んだ週
    const start = i < 8; // 登録の前
    if (rest || start)
      return {
        day,
        catches: 0,
        reviews: 0,
        correct: 0,
        opens: 0,
        minutes: 0,
        aiCalls: 0,
        aiUsd: 0,
      };
    const grow = 0.5 + i / 120;
    const catches = Math.round((weekend ? 5 : 1.5) * grow * r() * 1.6);
    const reviews = Math.round((r() < 0.15 ? 0 : 12 + 22 * r()) * grow);
    const acc = 0.62 + i / 400 + 0.12 * r();
    const correct = Math.min(reviews, Math.round(reviews * acc));
    const opens = reviews || catches ? 1 + Math.round(3 * r()) : r() < 0.3 ? 1 : 0;
    const minutes = opens ? Math.round((3 + 14 * r()) * 10) / 10 : 0;
    const aiCalls = catches * 3 + Math.round(reviews * 0.4);
    return {
      day,
      catches,
      reviews,
      correct,
      opens,
      minutes,
      aiCalls,
      aiUsd: +(aiCalls * 0.0021).toFixed(4),
    };
  });
})();

const WEEKLY: WeeklyReview[] = Array.from({ length: 26 }, (_, i) => {
  const to = addDays(TODAY, -7 * (25 - i));
  const from = addDays(to, -6);
  const inDaily = DAILY.filter((x) => x.day >= from && x.day <= to);
  const reviews = inDaily.reduce((s, x) => s + x.reviews, 0);
  const correct = inDaily.reduce((s, x) => s + x.correct, 0);
  return {
    from,
    to,
    reviews,
    correct,
    accuracy: reviews ? Math.round((100 * correct) / reviews) : null,
    responseSec: reviews ? Math.round((5.2 - i * 0.09 + ((i * 7) % 5) * 0.15) * 10) / 10 : null,
  };
});

const hours = Array.from({ length: 24 }, (_, h) =>
  h >= 7 && h <= 9
    ? 9 + h
    : h >= 20 && h <= 22
      ? 12 + (h % 3) * 3
      : h > 11 && h < 14
        ? 5
        : h < 6
          ? 0
          : 2,
);

const sum = (k: keyof DailyActivity) => DAILY.reduce((s, x) => s + Number(x[k]), 0);

const FIXTURE = {
  profile: {
    id: "3f6c2a1e-0000-4000-8000-000000000001",
    display_name: "のり",
    created_at: "2026-07-12T10:00:00Z",
    native_language: "ja",
    ui_language: "ja",
    target_language: "zh-TW",
    level_goal: "TOCFL B1",
    current_level: "A2",
    pronunciation_strictness: "normal",
    review_mode: "hybrid",
    review_daily_limit: 30,
    review_stage_focus: "balanced",
    plan: "free",
    album_bg: "paper",
    onboarded: true,
  },
  lastActive: "2026-10-02T09:40:00Z",
  daily: DAILY,
  weekly: WEEKLY,
  memory: {
    levels: [6, 9, 14, 22, 31, 18],
    schedule: {
      overdue: 12,
      byDay: Array.from({ length: 14 }, (_, i) => ({
        day: addDays(TODAY, i),
        n: [9, 14, 6, 11, 3, 8, 5, 2, 7, 1, 4, 0, 3, 2][i],
      })),
    },
  },
  catches: {
    total: sum("catches"),
    first: "2026-07-12T10:05:00Z",
    last: "2026-10-02T09:30:00Z",
    last30: DAILY.slice(-30).reduce((s, x) => s + x.catches, 0),
    byDay: [],
    topPlaces: [
      ["台北駅", 12],
      ["永康街", 8],
      ["中山駅", 6],
      ["西門町", 4],
      ["大安森林公園", 3],
    ],
    captureTypes: { photo: 71, text: 15 },
    cutouts: 23,
    recentWords: ["獎學金", "雨傘", "捷運", "芒果", "腳踏車", "夜市", "珍珠奶茶"].map((word) => ({
      at: "2026-09-27T12:00:00Z",
      word,
    })),
  },
  streak: { current: 5, best: 12 },
  speed: {
    scans: 140,
    detectMsMedian: 2100,
    tapToAudioMsMedian: 640,
    tapRate: 62,
    scanToDexSecMedian: 18,
  },
  review: {
    total180: sum("reviews"),
    last30: DAILY.slice(-30).reduce((s, x) => s + x.reviews, 0),
    correctPct: Math.round((100 * sum("correct")) / Math.max(1, sum("reviews"))),
    responseMsMedian: 3400,
    cards: 100,
    dueNow: 12,
    matured: 9,
    activeDays30: DAILY.slice(-30).filter((x) => x.reviews).length,
  },
  usage: {
    sessions: { sessions: 52, medianMin: 6, totalMin: 410 },
    sessionBuckets: sessionLengthBuckets([
      0.4, 0.8, 1.5, 2, 2.2, 2.8, 3.5, 4, 4.4, 4.9, 5.5, 6, 6, 7, 7.5, 8, 9, 9.5, 11, 12, 14, 16,
      22, 26, 41,
    ]),
    openDays: DAILY.filter((x) => x.opens).length,
    hours,
    weekdays: [14, 11, 12, 10, 13, 22, 25],
    leaves: [
      { screen: "review", count: 21 },
      { screen: "home", count: 15 },
      { screen: "capture", count: 9 },
      { screen: "dex", count: 7 },
      { screen: "settings", count: 2 },
    ],
    regenerations: 6,
    reportFixes: 2,
    removebg: 23,
    saveFailures: { catch: 1, reencounter: 0, firstTransfer: 0 },
    // 裏の処理の失敗（2026-10-01、`background-failure.ts`）。
    backgroundFailures: { tts: 3, photoUpload: 1, thumbUpload: 0, reviewGrade: 0 },
  },
  ai: {
    ...aiCostEstimate({
      card: 92,
      scan_detect: 140,
      speaking_feedback: 60,
      tts: 300,
      removebg: 23,
    }),
    tokensIn: 0,
    tokensOut: 0,
  },
  compare: [
    { label: "撮った語（合計）", value: 86, median: 24, pct: 88 },
    { label: "撮った語（30日）", value: 41, median: 11, pct: 93 },
    { label: "復習（30日）", value: 610, median: 140, pct: 95 },
    { label: "開いた日（30日）", value: 27, median: 9, pct: 90 },
  ],
  compareBase: 214,
} as unknown as AdminUserDetail;

/**
 * 一覧の見本。**わざと登録順に並べ、名前なし（null・空・空白）を混ぜて渡す。**
 * 画面では名前なしが消え、最後に使った順（記録なしは最後）に並び替わる。
 */
const user = (
  n: number,
  display_name: string | null,
  last_active: string | null,
  stickers: number,
  created_at: string,
): AdminUserRow => ({
  id: `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`,
  display_name,
  created_at,
  target_language: n % 3 ? "zh-TW" : "en",
  ui_language: "ja",
  plan: n === 2 ? "pro" : "free",
  stickers,
  last_active,
});
const LIST: AdminUserRow[] = [
  user(1, "ゆうき", "2026-09-30T08:00:00Z", 12, "2026-09-29T10:00:00Z"),
  user(2, null, "2026-10-02T12:50:00Z", 0, "2026-09-28T10:00:00Z"),
  user(3, "Mei", "2026-10-02T12:20:00Z", 140, "2026-09-20T10:00:00Z"),
  user(4, "   ", null, 0, "2026-09-18T10:00:00Z"),
  user(5, "たかし", null, 0, "2026-09-15T10:00:00Z"),
  user(6, "のり", "2026-10-02T09:40:00Z", 86, "2026-07-12T10:00:00Z"),
  user(7, "", "2026-09-01T10:00:00Z", 2, "2026-07-01T10:00:00Z"),
  user(8, "Alex", "2026-08-14T10:00:00Z", 31, "2026-06-20T10:00:00Z"),
  user(9, "さくら", "2026-10-01T22:10:00Z", 57, "2026-06-02T10:00:00Z"),
];

/** 全体の見本（決まった数。本物の画面の部品 `AdminOverviewView` に渡す）。 */
const series = (base: number, amp: number, seed: number) =>
  Array.from({ length: 30 }, (_, i) => ({
    day: addDays(TODAY, i - 29),
    n: Math.max(0, Math.round(base + amp * Math.sin((i + seed) / 3) + i * 0.4)),
  }));
const OVERVIEW = {
  totals: {
    users: 214,
    pro: 9,
    new7: 23,
    active1: 41,
    active7: 96,
    active30: 158,
    catches: 6120,
    reviews30: 18400,
  },
  series: { active: series(38, 8, 1), catches: series(160, 40, 4), signups: series(3, 2, 2) },
  retention: {
    d1: { rate: 58, eligible: 205 },
    d7: { rate: 34, eligible: 180 },
    d30: { rate: 19, eligible: 96 },
  },
  languages: [
    ["zh-TW", 171],
    ["en", 43],
  ],
  plans: [
    ["free", 205],
    ["pro", 9],
  ],
  catchesBuckets: [
    { bucket: "0", n: 31 },
    { bucket: "1–9", n: 58 },
    { bucket: "10–49", n: 74 },
    { bucket: "50–199", n: 42 },
    { bucket: "200+", n: 9 },
  ],
  medians: { catches: 24, reviews30: 140, open30: 9 },
} as unknown as AdminOverview;

export function AdminUsersScene({ q }: { q: URLSearchParams }) {
  // 既定はひとりの画面（今回直したグラフ）。?view=list で全体＋一覧（本物の一覧ページと同じ並び）。
  const [open, setOpen] = useState<string | null>(null);
  const view = q.get("view") ?? "user";
  if (view === "user" || open)
    return (
      <div className="space-y-3 pb-24">
        <AdminUserDetailView d={FIXTURE} nowMs={NOW} />
      </div>
    );
  return (
    <div className="space-y-3 pb-24">
      <AdminOverviewView o={OVERVIEW} />
      <AdminUserListView rows={LIST} onOpen={setOpen} nowMs={NOW} />
    </div>
  );
}
