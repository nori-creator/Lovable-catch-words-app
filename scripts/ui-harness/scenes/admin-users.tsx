/**
 * 開発者だけ: 利用者ごとの情報（オーナー指示 2026-09-27）。本物の画面の中身
 * （`AdminUserDetailView`）に、決まった見本の数字を渡して描く（通信・ログイン不要）。
 */
import { AdminOverviewView, AdminUserDetailView } from "@/routes/_authenticated/admin.users";
import type { AdminOverview, AdminUserDetail } from "@/lib/admin-users.functions";
import { aiCostEstimate } from "@/lib/admin-user-stats";

const hours = Array.from({ length: 24 }, (_, h) =>
  h >= 7 && h <= 9 ? 9 : h >= 20 && h <= 22 ? 12 : h > 11 && h < 14 ? 5 : h < 6 ? 0 : 2,
);

const FIXTURE = {
  profile: {
    id: "3f6c2a1e-0000-4000-8000-000000000001",
    display_name: "のり",
    created_at: "2026-08-29T10:00:00Z",
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
  catches: {
    total: 86,
    first: "2026-08-29T10:05:00Z",
    last: "2026-09-27T21:30:00Z",
    last30: 86,
    byDay: [
      ["2026-09-27", 7],
      ["2026-09-26", 3],
      ["2026-09-25", 5],
      ["2026-09-24", 1],
      ["2026-09-23", 4],
    ],
    topPlaces: [
      ["台北駅", 12],
      ["永康街", 8],
      ["中山駅", 6],
      ["西門町", 4],
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
    total180: 910,
    last30: 910,
    correctPct: 78,
    responseMsMedian: 3400,
    cards: 86,
    dueNow: 12,
    matured: 9,
    activeDays30: 24,
  },
  usage: {
    sessions: { sessions: 52, medianMin: 6, totalMin: 410 },
    openDays: 27,
    hours,
    leaves: [
      { screen: "review", count: 21 },
      { screen: "home", count: 15 },
      { screen: "capture", count: 9 },
      { screen: "dex", count: 7 },
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
    { label: "撮った語（30日）", value: 86, median: 11, pct: 93 },
    { label: "復習（30日）", value: 910, median: 140, pct: 95 },
    { label: "開いた日（30日）", value: 27, median: 9, pct: 90 },
  ],
  compareBase: 214,
} as unknown as AdminUserDetail;

/** 全体の見本（決まった数。本物の画面の部品 `AdminOverviewView` に渡す）。 */
const series = (base: number, amp: number, seed: number) =>
  Array.from({ length: 30 }, (_, i) => ({
    day: new Date(Date.UTC(2026, 7, 30 + i)).toISOString().slice(0, 10),
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
  // 既定は「全体」。?view=user でひとりの画面。
  const user = q.get("view") === "user";
  return (
    <div className="space-y-3 pb-24">
      {user ? <AdminUserDetailView d={FIXTURE} /> : <AdminOverviewView o={OVERVIEW} />}
    </div>
  );
}
