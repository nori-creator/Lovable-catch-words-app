import type { UiLang } from "@/lib/i18n";
import type { MemberFunnelEvent, TutorialStep } from "@/lib/funnel-events";

/**
 * **ベータの指標の画面の文字**（開発者だけ、`/admin/beta`）。
 *
 * 管理の画面は日本語だけで書いてきたが（`hardcoded-japanese.test.ts` の KNOWN）、この画面は
 * ベータの相談相手（英語・繁體中文）にもそのまま見せられるよう3つの言語で持つ。
 * 全員の画面が最初に読む翻訳の表（`i18n.tsx`）には入れない — 開発者しか開かない画面の
 * 文字で、全員の最初の読み込みを重くしないため。この表はこの画面の塊にだけ入る。
 */
type Text = Record<UiLang, string>;

export const BETA_LABELS = {
  title: {
    ja: "ベータの指標",
    en: "Beta metrics",
    "zh-TW": "Beta 指標",
  },
  toKpi: {
    ja: "KPI へ",
    en: "KPI",
    "zh-TW": "KPI",
  },
  privacy: {
    ja: "登録前のチュートリアルは、日ごとの段の数だけを数えます（写真・語・メール・IP は集めません）。人数・費用は匿名の口座と管理者を除いた数です。",
    en: "The pre-signup tutorial is counted only as daily step totals (no photos, words, emails or IPs). User counts and costs exclude anonymous accounts and admins.",
    "zh-TW":
      "註冊前的教學只記錄每天各步驟的次數（不收集照片、單字、電子郵件或 IP）。人數與費用不含匿名帳號與管理者。",
  },
  window: {
    ja: "期間",
    en: "Period",
    "zh-TW": "期間",
  },
  days: {
    ja: "日",
    en: " days",
    "zh-TW": " 天",
  },
  loading: {
    ja: "読み込み中…",
    en: "Loading…",
    "zh-TW": "載入中…",
  },
  failed: {
    ja: "読み込めませんでした",
    en: "Couldn't load",
    "zh-TW": "無法載入",
  },
  retry: {
    ja: "もう一度",
    en: "Retry",
    "zh-TW": "重試",
  },
  truncated: {
    ja: "行が多すぎて一部を読み切れていません（数は少なめに出ています）。",
    en: "Some tables hit the read limit; numbers may be undercounted.",
    "zh-TW": "部分資料超過讀取上限，數字可能偏低。",
  },
  funnel: {
    ja: "ファネル",
    en: "Funnel",
    "zh-TW": "漏斗",
  },
  tutorialFunnel: {
    ja: "登録前のチュートリアル（セッション数）",
    en: "Pre-signup tutorial (sessions)",
    "zh-TW": "註冊前教學（工作階段數）",
  },
  signupFunnel: {
    ja: "登録 → 最初のキャッチ → 最初の復習（この期間に登録した人）",
    en: "Signup → first catch → first review (users who signed up in this period)",
    "zh-TW": "註冊 → 第一次捕捉 → 第一次複習（此期間註冊的使用者）",
  },
  ofFirst: {
    ja: "最初の段から",
    en: "of first step",
    "zh-TW": "相對第一步",
  },
  memberFunnel: {
    ja: "登録した人の段（人数 / 回数）",
    en: "Signed-in steps (users / events)",
    "zh-TW": "已註冊使用者的步驟（人數 / 次數）",
  },
  users: {
    ja: "人",
    en: "users",
    "zh-TW": "人",
  },
  events: {
    ja: "回",
    en: "events",
    "zh-TW": "次",
  },
  candidateLatency: {
    ja: "撮ってから候補が並ぶまで",
    en: "Shutter → candidates shown",
    "zh-TW": "拍照到顯示候選字",
  },
  retention: {
    ja: "継続（登録日ごと）",
    en: "Retention (by signup day)",
    "zh-TW": "留存（依註冊日）",
  },
  retentionNote: {
    ja: "D1/D7/D30 = ちょうどその日に使った人の割合（使った = 利用の記録・復習・撮影のどれか）。終わっていない日の人は数に入れません。下の小さい数字は「その日以降のどこかで戻った」割合。",
    en: "D1/D7/D30 = share active exactly on that day (active = any usage event, review or catch). Users whose day hasn't finished are not counted. The small figure is the share who came back on or after that day.",
    "zh-TW":
      "D1/D7/D30 = 剛好在當天使用的比例（使用 = 任何使用紀錄、複習或捕捉）。當天尚未結束的使用者不計入。下方小字為當天或之後回來的比例。",
  },
  signupDay: {
    ja: "登録日",
    en: "Signup day",
    "zh-TW": "註冊日",
  },
  newUsers: {
    ja: "新規",
    en: "New",
    "zh-TW": "新使用者",
  },
  orLater: {
    ja: "以降",
    en: "or later",
    "zh-TW": "之後",
  },
  engagement: {
    ja: "使い方（週ごと）",
    en: "Engagement (weekly)",
    "zh-TW": "使用情況（每週）",
  },
  week: {
    ja: "週",
    en: "Week",
    "zh-TW": "週",
  },
  activeUsers: {
    ja: "使った人",
    en: "Active",
    "zh-TW": "活躍人數",
  },
  catchesPerActive: {
    ja: "撮影 / 人",
    en: "Catches / user",
    "zh-TW": "捕捉 / 人",
  },
  reviewsPerActive: {
    ja: "復習 / 人",
    en: "Reviews / user",
    "zh-TW": "複習 / 人",
  },
  reviewSessionMin: {
    ja: "復習1回の長さ（中央値）",
    en: "Median review session",
    "zh-TW": "單次複習長度（中位數）",
  },
  minutes: {
    ja: "分",
    en: " min",
    "zh-TW": " 分",
  },
  cost: {
    ja: "AI・音声の費用（推定）",
    en: "AI / TTS cost (estimate)",
    "zh-TW": "AI／語音費用（估算）",
  },
  costNote: {
    ja: "推定です。呼び出し回数 × 仮の単価（下で変えられます）。正確な額は各サービスの請求で確かめてください。管理者の分は除いています。",
    en: "Estimate only: call counts × assumed unit costs (editable below). Check each provider's bill for real amounts. Admin usage is excluded.",
    "zh-TW":
      "僅為估算：呼叫次數 × 假設單價（可在下方修改）。實際金額請以各服務的帳單為準。不含管理者的用量。",
  },
  cost30: {
    ja: "30日の推定費用",
    en: "30-day estimated cost",
    "zh-TW": "30 天估算費用",
  },
  perActiveMonth: {
    ja: "アクティブ1人あたり / 月（推定）",
    en: "Per active user / month (est.)",
    "zh-TW": "每位活躍使用者 / 月（估算）",
  },
  active30: {
    ja: "30日のアクティブ人数",
    en: "30-day active users",
    "zh-TW": "30 天活躍人數",
  },
  guestCost: {
    ja: "うち登録前（チュートリアル）",
    en: "of which pre-signup (tutorial)",
    "zh-TW": "其中註冊前（教學）",
  },
  excludedCost: {
    ja: "除外した管理者の分",
    en: "Excluded admin usage",
    "zh-TW": "已排除的管理者用量",
  },
  dailyCost: {
    ja: "日ごとの推定費用（米ドル）",
    en: "Daily estimated cost (USD)",
    "zh-TW": "每日估算費用（美元）",
  },
  kind: {
    ja: "種類",
    en: "Kind",
    "zh-TW": "種類",
  },
  calls: {
    ja: "回数",
    en: "Calls",
    "zh-TW": "次數",
  },
  unit: {
    ja: "単価",
    en: "Unit",
    "zh-TW": "單價",
  },
  estimate: {
    ja: "推定",
    en: "Estimate",
    "zh-TW": "估算",
  },
  editCosts: {
    ja: "単価を変える（米ドル / 1回）",
    en: "Edit unit costs (USD per call)",
    "zh-TW": "修改單價（美元 / 每次）",
  },
  save: {
    ja: "保存",
    en: "Save",
    "zh-TW": "儲存",
  },
  saved: {
    ja: "保存しました",
    en: "Saved",
    "zh-TW": "已儲存",
  },
  saveFailed: {
    ja: "保存できませんでした",
    en: "Couldn't save",
    "zh-TW": "無法儲存",
  },
  reliability: {
    ja: "最初のキャッチの解析",
    en: "First-catch analysis reliability",
    "zh-TW": "第一次捕捉的分析穩定度",
  },
  reliabilityNote: {
    ja: "会員は ai_runs、登録前は app_config の記録（登録前の記録は14日で消えます）。待ち時間は失敗した回も含みます。",
    en: "Members from ai_runs, pre-signup from app_config records (pre-signup records are kept 14 days). Latency includes failed runs.",
    "zh-TW":
      "會員來自 ai_runs，註冊前來自 app_config 紀錄（註冊前紀錄保留 14 天）。等待時間包含失敗的次數。",
  },
  source: {
    ja: "対象",
    en: "Source",
    "zh-TW": "來源",
  },
  runs: {
    ja: "回数",
    en: "Runs",
    "zh-TW": "次數",
  },
  success: {
    ja: "成功",
    en: "Success",
    "zh-TW": "成功",
  },
  all: {
    ja: "全体",
    en: "All",
    "zh-TW": "全部",
  },
  member: {
    ja: "会員",
    en: "Members",
    "zh-TW": "會員",
  },
  guest: {
    ja: "登録前",
    en: "Pre-signup",
    "zh-TW": "註冊前",
  },
  noData: {
    ja: "まだデータがありません",
    en: "No data yet",
    "zh-TW": "尚無資料",
  },
} satisfies Record<string, Text>;

export type BetaLabelKey = keyof typeof BETA_LABELS;

export const TUTORIAL_STEP_LABELS: Record<TutorialStep, Text> = {
  welcome_view: {
    ja: "最初の画面",
    en: "Welcome viewed",
    "zh-TW": "看到歡迎頁",
  },
  questions_done: {
    ja: "質問に答えた",
    en: "Questions done",
    "zh-TW": "完成問題",
  },
  tutorial_start: {
    ja: "案内が始まった",
    en: "Tutorial started",
    "zh-TW": "開始教學",
  },
  photo_taken: {
    ja: "写真を撮った",
    en: "Photo taken",
    "zh-TW": "拍了照片",
  },
  candidates_shown: {
    ja: "候補が並んだ",
    en: "Candidates shown",
    "zh-TW": "顯示候選字",
  },
  catch_done: {
    ja: "図鑑に入った",
    en: "Catch done",
    "zh-TW": "完成捕捉",
  },
  practice_done: {
    ja: "練習を終えた",
    en: "Practice done",
    "zh-TW": "完成練習",
  },
  signup_view: {
    ja: "登録の画面",
    en: "Signup viewed",
    "zh-TW": "看到註冊頁",
  },
  signup_done: {
    ja: "登録して移せた",
    en: "Signed up",
    "zh-TW": "完成註冊",
  },
};

export const MEMBER_EVENT_LABELS: Record<MemberFunnelEvent, Text> = {
  camera_open: {
    ja: "カメラを開いた",
    en: "Camera opened",
    "zh-TW": "開啟相機",
  },
  shutter: {
    ja: "シャッター",
    en: "Shutter",
    "zh-TW": "按下快門",
  },
  candidates_shown: {
    ja: "候補が並んだ",
    en: "Candidates shown",
    "zh-TW": "顯示候選字",
  },
  candidate_picked: {
    ja: "候補を選んだ",
    en: "Candidate picked",
    "zh-TW": "選擇候選字",
  },
  first_audio_played: {
    ja: "発音を聞いた",
    en: "First audio played",
    "zh-TW": "播放發音",
  },
  catch_saved: {
    ja: "図鑑に保存",
    en: "Catch saved",
    "zh-TW": "儲存捕捉",
  },
  review_started: {
    ja: "復習を始めた",
    en: "Review started",
    "zh-TW": "開始複習",
  },
  review_answered: {
    ja: "復習に答えた",
    en: "Review answered",
    "zh-TW": "回答複習",
  },
  review_session_done: {
    ja: "復習を終えた",
    en: "Review session done",
    "zh-TW": "完成複習",
  },
  paywall_viewed: {
    ja: "Pro の案内を見た",
    en: "Paywall viewed",
    "zh-TW": "看到 Pro 方案",
  },
  checkout_started: {
    ja: "支払いへ進んだ",
    en: "Checkout started",
    "zh-TW": "前往付款",
  },
};

export const SIGNUP_STAGE_LABELS: Record<"signup" | "first_catch" | "first_review", Text> = {
  signup: {
    ja: "登録",
    en: "Signed up",
    "zh-TW": "註冊",
  },
  first_catch: {
    ja: "最初のキャッチ",
    en: "First catch",
    "zh-TW": "第一次捕捉",
  },
  first_review: {
    ja: "最初の復習",
    en: "First review",
    "zh-TW": "第一次複習",
  },
};

export function betaLabels(lang: UiLang) {
  return (k: BetaLabelKey): string => BETA_LABELS[k][lang] ?? BETA_LABELS[k].ja;
}
