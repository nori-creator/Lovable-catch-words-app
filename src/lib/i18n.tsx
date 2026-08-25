import { useCallback, useEffect, useState } from "react";
import type { TargetLanguage } from "./target-lang";

/**
 * 軽量i18n(2026-07-25): アプリの主要な操作面(ナビ・見出し・設定)を
 * 切り替える。設定の「表示言語」= profiles.ui_language を localStorage に
 * ミラーして、プロフィール取得を待たずに描画できるようにする。
 * 学習コンテンツ(単語の意味・解説)は対象外 — それは学習者の母語設定の話。
 *
 * ## 2026-08-25: 繁體中文を足した
 * オーナー決定「日本語、英語、台湾華語に絞って」。英語を学ぶ台湾人にとって、
 * ここが無いと**アプリが日本語か英語のまま**で、指摘⑬の半分が埋まらない。
 */

export type UiLang = "ja" | "en" | "zh-TW";

/** 表示言語の一覧。**先頭が既定**(サーバー側と初回描画はこれ)。 */
export const UI_LANGS = ["ja", "en", "zh-TW"] as const;

const KEY = "ui-lang-v1";
const EVENT = "ui-lang-changed";

/** 知らない値を既定に落とす。**未知の言語のまま描かない。** */
export function normalizeUiLang(raw: string | null | undefined): UiLang {
  const v = (raw ?? "").trim();
  return (UI_LANGS as readonly string[]).includes(v) ? (v as UiLang) : "ja";
}

export function getUiLang(): UiLang {
  if (typeof window === "undefined") return "ja";
  try {
    return normalizeUiLang(localStorage.getItem(KEY));
  } catch {
    return "ja";
  }
}

/**
 * 表示言語の名前の翻訳キー。
 *
 * **`UI_LANGS` と対で持つ。** 設定の一覧はここを回すので、言語を足して
 * ここを直し忘れると型で落ちる（訳したのに選べない、が起きない）。
 */
export const UI_LANG_LABEL_KEYS: Record<UiLang, string> = {
  ja: "settings.langJa",
  en: "settings.langEn",
  "zh-TW": "settings.langZhTw",
};

/**
 * **プロンプトの中でその言語を何と呼ぶか。**
 *
 * `UI_LANG_LABEL_KEYS` は画面に出す名前(その言語自身で書く)、
 * こちらは AI への指示文の中で使う名前で、**指示文が日本語なので
 * 日本語で書く**。用途が違うので同じ表にはしない。
 *
 * server 側(`ai-provider.server.ts`)に置きたくなるが、そちらに置くと
 * `"zh-TW"` の直書きが1つ増えて `target-lang.test.ts` の門に当たる。
 * 表示言語の一覧を持っているのはここなので、名前もここが持つのが正しい。
 */
export const UI_LANG_PROMPT_NAMES: Record<UiLang, string> = {
  ja: "日本語",
  en: "英語",
  "zh-TW": "繁體中文(台湾)",
};

/**
 * **学んでいる言語**の名前の翻訳キー。
 *
 * `UI_LANG_LABEL_KEYS`(表示言語)とは別物。いまは両方に `ja` があるが、
 * 意味が違う — あちらは「画面を日本語にする」、こちらは「日本語を学ぶ」。
 * 同じ表にすると、日本語を学ぶ版を足した日に片方の意味が壊れる。
 *
 * 鍵の一覧そのものは `target-lang.ts` の `TARGET_LANGUAGES` が持つ。
 * ここは名前だけ。設定の一覧はここを回すので、言語を足して
 * ここを直し忘れると**型で落ちる**(選べない言語ができない)。
 */
export const TARGET_LANG_LABEL_KEYS: Record<TargetLanguage, string> = {
  "zh-TW": "settings.langZhTw",
  en: "settings.langEn",
};

/**
 * 日付・数の書式に使う locale。
 *
 * **1箇所に集める。** これまで `localeOf(useUiLang())` が
 * 13箇所に散っていた。3つ目の言語を足すと、その全部で台湾の人が
 * **日本語の日付書式**になる — 型でもビルドでも lint でも落ちない。
 * この app が声・写真・演出で繰り返してきた形なので、口を1つにする。
 */
export function localeOf(lang: UiLang): string {
  return LOCALES[lang] ?? LOCALES.ja;
}

const LOCALES: Record<UiLang, string> = {
  ja: "ja-JP",
  en: "en-US",
  // 台湾の書式(民国暦ではなく西暦。2026/8/25 の順)。
  "zh-TW": "zh-TW",
};

/**
 * `lang` 属性に入れる値。
 *
 * 繁體中文は `zh-Hant` を必ず付ける — 漢字は同じ文字コードでも言語で
 * 字形が違う(直/直、每/毎)。付けないと日本語のフォントに落ちて、
 * 台湾の人に日本の字形が出る。
 */
export function htmlLangOf(lang: UiLang): string {
  return lang === "zh-TW" ? "zh-Hant-TW" : lang;
}

export function setUiLang(lang: UiLang) {
  try {
    localStorage.setItem(KEY, lang);
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* storage unavailable */
  }
}

/**
 * 表に出る文字は全部ここに在る。**外に出しているのは検査のため** —
 * 和文の約物の決めごと(`ja-punctuation.ts`)を辞書全体に当てて、
 * 手で直した決めごとが次の文字列で戻らないようにする。
 */
export const DICT: Record<string, Record<UiLang, string>> = {
  // --- 動的ページタイトル ---
  "page.post": {
    ja: "投稿 {id} — Catchwords",
    en: "Post {id} — Catchwords",
    "zh-TW": "貼文 {id} — Catchwords",
  },
  "page.userProfile": {
    ja: "ユーザー {id} のプロフィール — Catchwords",
    en: "{id}'s profile — Catchwords",
    "zh-TW": "{id} 的個人檔案 — Catchwords",
  },
  "page.cardDetail": {
    ja: "カード {id} — Catchwords",
    en: "Card {id} — Catchwords",
    "zh-TW": "字卡 {id} — Catchwords",
  },
  // --- OAuth 同意画面 ---
  "oauth.loadFailed": {
    ja: "認証リクエストを読み込めませんでした",
    en: "Couldn't load the authorization request",
    "zh-TW": "無法載入授權請求",
  },
  "oauth.unknownClient": {
    ja: "外部クライアント",
    en: "an external client",
    "zh-TW": "外部應用程式",
  },
  "oauth.noRedirect": {
    ja: "認証サーバーからリダイレクト先が返されませんでした。",
    en: "The authorization server didn't return a redirect target.",
    "zh-TW": "授權伺服器沒有回傳轉址位址。",
  },
  "oauth.connectTitle": {
    ja: "{client} を Catchwords に接続",
    en: "Connect {client} to Catchwords",
    "zh-TW": "將 {client} 連接到 Catchwords",
  },
  "oauth.explain": {
    ja: "このクライアントは、あなたとしてサインインした状態で Catchwords の有効なツールを呼び出せるようになります。",
    en: "This client will be able to call Catchwords' enabled tools while signed in as you.",
    "zh-TW": "這個應用程式將能以你的身分登入，並呼叫 Catchwords 已啟用的工具。",
  },
  "oauth.redirectTo": { ja: "リダイレクト先:", en: "Redirects to:", "zh-TW": "轉址到：" },
  "oauth.scope1": {
    ja: "・あなたの Catchwords プロフィール（表示名・アバター）",
    en: "· Your Catchwords profile (display name, avatar)",
    "zh-TW": "・你的 Catchwords 個人檔案（顯示名稱、頭像）",
  },
  "oauth.scope2": {
    ja: "・あなたのステッカー（単語カード・キャプション・撮影地）",
    en: "· Your stickers (word cards, captions, capture locations)",
    "zh-TW": "・你的貼紙（單字卡、感想、拍攝地點）",
  },
  "oauth.scope3": {
    ja: "・あなたの SRS 復習の予定",
    en: "· Your SRS review schedule",
    "zh-TW": "・你的 SRS 複習排程",
  },
  "oauth.rlsNote": {
    ja: "このアプリの権限とバックエンドポリシー(RLS)は引き続き適用されます。他ユーザーのデータは公開されません。",
    en: "This app's permissions and backend policies (RLS) still apply. Other users' data is never exposed.",
    "zh-TW": "這個 App 的權限與後端政策（RLS）仍然有效，其他使用者的資料不會被公開。",
  },
  "oauth.approve": { ja: "許可する", en: "Allow", "zh-TW": "允許" },
  "oauth.deny": { ja: "拒否する", en: "Deny", "zh-TW": "拒絕" },
  // --- 共通 ---
  "common.back": { ja: "戻る", en: "Back", "zh-TW": "返回" },
  // --- ページタイトル・復習 ---
  "rv.hearModel": { ja: "お手本を聞く", en: "Listen to the model answer", "zh-TW": "聽示範答案" },
  "rv.hearAlt": {
    ja: "別の言い方を聞く",
    en: "Listen to the alternative",
    "zh-TW": "聽另一種說法",
  },
  "page.home": { ja: "ホーム — Catchwords", en: "Home — Catchwords", "zh-TW": "首頁 — Catchwords" },
  "page.dex": { ja: "図鑑 — Catchwords", en: "Dex — Catchwords", "zh-TW": "圖鑑 — Catchwords" },
  "page.review": {
    ja: "復習 — Catchwords",
    en: "Review — Catchwords",
    "zh-TW": "複習 — Catchwords",
  },
  "page.scan": {
    ja: "スキャン | Catchwords",
    en: "Scan | Catchwords",
    "zh-TW": "掃描 | Catchwords",
  },
  "page.capture": {
    ja: "集める — Catchwords",
    en: "Catch — Catchwords",
    "zh-TW": "收集 — Catchwords",
  },
  "page.settings": {
    ja: "設定 — Catchwords",
    en: "Settings — Catchwords",
    "zh-TW": "設定 — Catchwords",
  },
  "page.feed": {
    ja: "フィード — Catchwords",
    en: "Feed — Catchwords",
    "zh-TW": "動態 — Catchwords",
  },
  "page.notifications": {
    ja: "通知 — Catchwords",
    en: "Notifications — Catchwords",
    "zh-TW": "通知 — Catchwords",
  },
  "page.discover": {
    ja: "発見 — Catchwords",
    en: "Discover — Catchwords",
    "zh-TW": "探索 — Catchwords",
  },
  "page.journal": {
    ja: "日記 — Catchwords",
    en: "Journal — Catchwords",
    "zh-TW": "日記 — Catchwords",
  },
  "page.wordbooks": {
    ja: "単語帳 — Catchwords",
    en: "Wordbooks — Catchwords",
    "zh-TW": "單字本 — Catchwords",
  },
  "page.onboarding": {
    ja: "ようこそ — Catchwords",
    en: "Welcome — Catchwords",
    "zh-TW": "歡迎 — Catchwords",
  },
  "page.auth": {
    ja: "ログイン — Catchwords",
    en: "Sign in — Catchwords",
    "zh-TW": "登入 — Catchwords",
  },
  "page.reset": {
    ja: "パスワード再設定 — Catchwords",
    en: "Reset password — Catchwords",
    "zh-TW": "重設密碼 — Catchwords",
  },
  "page.privacy": {
    ja: "プライバシーポリシー — Catchwords",
    en: "Privacy Policy — Catchwords",
    "zh-TW": "隱私權政策 — Catchwords",
  },
  "page.terms": {
    ja: "利用規約 — Catchwords",
    en: "Terms of Service — Catchwords",
    "zh-TW": "使用條款 — Catchwords",
  },
  // --- 復習・単語カード ---
  "rv.modeAria": { ja: "復習モード", en: "Review mode", "zh-TW": "複習模式" },
  "rv.quietMode": {
    ja: "声を出せない場所用の4択モード",
    en: "Multiple-choice mode for when you can't speak out loud",
    "zh-TW": "不方便出聲時用的四選一模式",
  },
  // --- 日記の足場(要望 #88) ---
  "jr.scaffoldTitle": {
    ja: "今日撮ったものから",
    en: "From what you caught today",
    "zh-TW": "從你今天拍到的東西",
  },
  "jr.aboutCapture": { ja: "「{w}」のこと", en: "about “{w}”", "zh-TW": "關於「{w}」" },
  "jr.useThese": { ja: "この型が使えます", en: "Patterns you can use", "zh-TW": "可以用這些句型" },
  "jr.tapToInsert": {
    ja: "押すと下に入ります",
    en: "Tap to drop it into your draft",
    "zh-TW": "點一下就會加到下面",
  },
  "jr.noCaptures": {
    ja: "今日はまだ何も撮っていないので、質問は出せません。1つ撮ると、その物のことを聞きます。",
    en: "Nothing caught today yet, so there are no questions. Catch one and they'll be about it.",
    "zh-TW": "今天還沒拍任何東西，所以出不了題目。拍一個，題目就會跟它有關。",
  },
  "rv.autoMode": {
    ja: "AI が記憶の段階を見て、出題の形を選びます",
    en: "AI reads how well you remember and picks the task format",
    "zh-TW": "AI 會看你記得多牢，再挑出題的形式",
  },
  "rv.formatSay": {
    ja: "写真を見て、声に出す",
    en: "Look at the photo and say it",
    "zh-TW": "看照片，唸出來",
  },
  "rv.formatSayHint": {
    ja: "いまは1語だけ。文を作るのは、もう少し覚えてから。",
    en: "Just the word for now — sentences come once it sticks.",
    "zh-TW": "現在只唸單字。等記牢一點再造句。",
  },
  "rv.promptSay": {
    ja: "この単語を声に出して",
    en: "Say this word out loud",
    "zh-TW": "把這個單字唸出來",
  },
  "rv.sayCheck": { ja: "言えたか見る", en: "Check it", "zh-TW": "看看唸對了嗎" },
  "rv.sayRetry": { ja: "言い直す", en: "Say it again", "zh-TW": "再唸一次" },
  "rv.streakLine": {
    ja: "復習が{n}日続いています",
    en: "{n}-day review streak",
    "zh-TW": "已經連續複習 {n} 天",
  },
  // --- 単語帳の取り込み(src/lib/wordbook.ts) ---
  "wb.title": { ja: "単語帳", en: "Wordbooks", "zh-TW": "單字本" },
  "wb.shootBook": { ja: "単語帳を撮る", en: "Photograph a wordbook", "zh-TW": "拍單字本" },
  "wb.shootHint": {
    ja: "単語が並んだページを、まっすぐ明るい所で撮ってください。並んでいる語をまとめて取り込みます。",
    en: "Shoot a page of listed words, straight on and well lit. Every word on it comes in at once.",
    "zh-TW": "請在光線充足的地方，正面拍下排列著單字的那一頁。上面的單字會一次全部匯入。",
  },
  "wb.reading": { ja: "読み取っています…", en: "Reading the page…", "zh-TW": "正在讀取這一頁…" },
  "wb.extractFailed": {
    ja: "読み取れませんでした",
    en: "Couldn't read that page",
    "zh-TW": "讀不出這一頁",
  },
  "wb.confirmTitle": {
    ja: "この語で合っていますか",
    en: "Do these look right?",
    "zh-TW": "這些字對嗎",
  },
  "wb.confirmHint": {
    ja: "違う語が混ざっていたら、右の×で外してください。外した語は入りません。",
    en: "Drop anything that came out wrong with the × — dropped words are not saved.",
    "zh-TW": "有認錯的字，就用右邊的 × 移除。移除的字不會存進來。",
  },
  "wb.bookTitle": { ja: "単語帳の名前", en: "Wordbook name", "zh-TW": "單字本名稱" },
  "wb.bookTitlePlaceholder": {
    ja: "例: TOCFL 2級 第3課",
    en: "e.g. TOCFL 2, unit 3",
    "zh-TW": "例：TOCFL 2級 第3課",
  },
  "wb.dropWord": { ja: "「{word}」を外す", en: "Drop “{word}”", "zh-TW": "移除「{word}」" },
  "wb.saveN": { ja: "{n}語を取り込む", en: "Import {n} words", "zh-TW": "匯入 {n} 個單字" },
  "wb.saved": {
    ja: "{n}語を取り込みました",
    en: "Imported {n} words",
    "zh-TW": "已匯入 {n} 個單字",
  },
  "wb.saveFailed": { ja: "取り込めませんでした", en: "Couldn't import those", "zh-TW": "匯入失敗" },
  "wb.emptyTitle": {
    ja: "まだ単語帳がありません",
    en: "No wordbooks yet",
    "zh-TW": "還沒有單字本",
  },
  "wb.emptyBody": {
    ja: "教科書や自作のリストを撮ると、そこに並ぶ語をまとめて取り込んで、図鑑とは別に復習できます。",
    en: "Photograph a textbook page or your own list to bring every word in at once and review it apart from your dex.",
    "zh-TW": "拍下課本的一頁或自己整理的清單，上面的字會一次全部匯入，可以跟圖鑑分開複習。",
  },
  "wb.whatShelf": { ja: "単語帳の一覧", en: "your wordbooks", "zh-TW": "單字本清單" },
  "wb.whatDue": { ja: "今日の出題", en: "today's questions", "zh-TW": "今天的題目" },
  "wb.dueN": { ja: "今日 {n}語", en: "{n} due today", "zh-TW": "今天 {n} 個" },
  "wb.doneForToday": { ja: "今日はおしまい", en: "Done for today", "zh-TW": "今天到這裡" },
  "wb.learnedOf": {
    ja: "覚えた {n}／{total}",
    en: "{n} of {total} learned",
    "zh-TW": "記住 {n}／{total}",
  },
  "wb.review": {
    ja: "この単語帳を復習する",
    en: "Review this wordbook",
    "zh-TW": "複習這本單字本",
  },
  "wb.delete": { ja: "「{title}」を消す", en: "Delete “{title}”", "zh-TW": "刪除「{title}」" },
  "wb.confirmDelete": {
    ja: "「{title}」を語ごと消します。戻せません。",
    en: "Delete “{title}” and every word in it. This can't be undone.",
    "zh-TW": "將連同裡面的單字一起刪除「{title}」，無法復原。",
  },
  "wb.deleteFailed": { ja: "消せませんでした", en: "Couldn't delete it", "zh-TW": "刪除失敗" },
  "wb.reviewTitle": { ja: "単語帳の復習", en: "Wordbook review", "zh-TW": "單字本複習" },
  "wb.backToShelf": { ja: "単語帳の一覧へ", en: "Back to wordbooks", "zh-TW": "回到單字本清單" },
  "wb.pickTheWord": {
    ja: "この意味の語はどれ",
    en: "Which word means this",
    "zh-TW": "哪一個字是這個意思",
  },
  "wb.noMeaning": {
    ja: "（意味が読み取れていません）",
    en: "(no meaning was read)",
    "zh-TW": "（沒有讀到意思）",
  },
  "wb.progress": { ja: "{done}／{total}", en: "{done}/{total}", "zh-TW": "{done}／{total}" },
  "wb.finished": {
    ja: "この本の今日ぶんは終わりです",
    en: "That's today's batch",
    "zh-TW": "這本今天的份結束了",
  },
  "wb.score": {
    ja: "{correct}／{total} 正解",
    en: "{correct} of {total} right",
    "zh-TW": "答對 {correct}／{total}",
  },
  "wb.gradeFailed": {
    ja: "採点を送れませんでした。この語はまた出ます。",
    en: "Couldn't record that answer — the word will come round again.",
    "zh-TW": "無法送出這次的結果，這個字之後還會再出現。",
  },
  "wb.allDoneTitle": {
    ja: "今日出す語はありません",
    en: "Nothing due today",
    "zh-TW": "今天沒有要出的字",
  },
  "wb.allDoneBody": {
    ja: "この本の語は、次に出る日まで休みます。ほかの本を選ぶか、新しく取り込んでください。",
    en: "This book rests until its words come due. Pick another book, or import a new one.",
    "zh-TW": "這本的字要等到下次到期。可以換一本，或匯入新的。",
  },
  "wb.openShelf": { ja: "単語帳で復習する", en: "Review a wordbook", "zh-TW": "用單字本複習" },
  // --- TOCFL の段々(src/lib/tocfl.ts) ---
  "tocfl.title": { ja: "TOCFL", en: "TOCFL", "zh-TW": "TOCFL" },
  "tocfl.level": { ja: "{n}級", en: "Level {n}", "zh-TW": "{n}級" },
  "tocfl.levelInBand": {
    ja: "{n}級（Band {band}）",
    en: "Level {n} · Band {band}",
    "zh-TW": "{n}級（Band {band}）",
  },
  // TOCFL は6級を2つずつ3つの帯にまとめる。帯の名前は公式のもの。
  "tocfl.bandA": { ja: "A", en: "A", "zh-TW": "A" },
  "tocfl.bandB": { ja: "B", en: "B", "zh-TW": "B" },
  "tocfl.bandC": { ja: "C", en: "C", "zh-TW": "C" },
  "tocfl.out": { ja: "級外の語", en: "Not in the lists", "zh-TW": "級外的字" },
  "tocfl.outShort": { ja: "外", en: "—", "zh-TW": "外" },
  // CEFR の言い方(2026-08-24 の二言語化)。
  // **「A1級」と書かない** — 級は TOCFL の数え方で、CEFR の段は
  // それ自体が名前(A1)。数え方の言葉を足すと別の体系に見える。
  "cefr.levelInBand": {
    ja: "{n}（Band {band}）",
    en: "{n} · Band {band}",
    "zh-TW": "{n}（Band {band}）",
  },
  "cefr.out": { ja: "CEFR の外の語", en: "Outside the CEFR bands", "zh-TW": "CEFR 之外的字" },
  // --- コーパスへのリンク(src/lib/corpus-links.ts) ---
  // **取り込みではない。** 許可を取っていないので、見に行く先だけを出す。
  "corpus.more": {
    ja: "もっと詳しく（外部のコーパス・押すと語をコピー）",
    en: "Dig deeper (outside corpora — tapping copies the word)",
    "zh-TW": "看更詳細（外部語料庫・點一下會複製這個字）",
  },
  "corpus.copied": {
    ja: "「{w}」をコピーしました。向こうの検索欄に貼ってください。",
    en: "Copied “{w}” — paste it into their search box.",
    "zh-TW": "已複製「{w}」，貼到那邊的搜尋欄就可以。",
  },
  "corpus.coctLevel": { ja: "国教院・語の級", en: "COCT word levels", "zh-TW": "國教院・詞語分級" },
  "corpus.coctLevelHint": {
    ja: "国教院の詞語分級標準検索。この語が何級かを実データで確かめられます。",
    en: "The Ministry-of-Education word grading system — check this word's official level.",
    "zh-TW": "國教院的詞語分級標準檢索。可以用實際資料確認這個字是幾級。",
  },
  "corpus.coctCore": {
    ja: "国教院・基礎語彙",
    en: "COCT core vocabulary",
    "zh-TW": "國教院・基礎詞彙",
  },
  "corpus.coctCoreHint": {
    ja: "国教院の基礎詞彙検索。教える側が「基礎」と決めた語に入っているかが分かります。",
    en: "The core-vocabulary index — whether teachers count this word as foundational.",
    "zh-TW": "國教院的基礎詞彙檢索。可以知道教學端有沒有把這個字列為基礎。",
  },
  "corpus.sinica": {
    ja: "中研院・平衡語料庫",
    en: "Sinica Balanced Corpus",
    "zh-TW": "中研院・平衡語料庫",
  },
  "corpus.sinicaHint": {
    ja: "中央研究院の現代漢語平衡語料庫。品詞と頻度の裏取りに使えます。",
    en: "Academia Sinica's balanced corpus — the reference for part of speech and frequency.",
    "zh-TW": "中央研究院的現代漢語平衡語料庫，用來查證詞性與頻率。",
  },
  "corpus.cwn": { ja: "中文詞彙網路", en: "Chinese Wordnet", "zh-TW": "中文詞彙網路" },
  "corpus.cwnHint": {
    ja: "語義がいくつに分かれるか、どの語と近いかを、研究の定義で読めます。",
    en: "How many senses a word splits into, and which words sit next to it.",
    "zh-TW": "可以看到一個字分成幾個義項，以及跟哪些字相近，都有研究上的定義。",
  },
  "corpus.coctBilingual": {
    ja: "国教院・華英索引典",
    en: "COCT bilingual concordance",
    "zh-TW": "國教院・華英索引典",
  },
  "corpus.coctBilingualHint": {
    ja: "実際の文と英訳が並びます。どんな文の中に出るかを見るならここ。",
    en: "Real sentences beside their English — the place to see the word in context.",
    "zh-TW": "真實句子和英譯並排。想看這個字出現在什麼樣的句子裡，就看這裡。",
  },
  // --- 英語のコーパス(第4段) -----------------------------------------------
  "corpus.coca": { ja: "COCA（現代アメリカ英語）", en: "COCA", "zh-TW": "COCA（當代美國英語）" },
  "corpus.cocaHint": {
    ja: "10億語のアメリカ英語。頻度と一緒に使う語が読めます（無料の登録が要ります）。",
    en: "A billion words of American English — frequency and collocates (free account needed).",
    "zh-TW": "十億詞的美國英語，可以看頻率和搭配詞（需要免費註冊）。",
  },
  "corpus.bnc": { ja: "BNC（イギリス英語）", en: "BNC", "zh-TW": "BNC（英國英語）" },
  "corpus.bncHint": {
    ja: "イギリス英語の基準になる資料。米英の差を見たいときに（無料の登録が要ります）。",
    en: "The reference corpus for British English — good for US/UK differences (free account needed).",
    "zh-TW": "英國英語的基準語料庫，想看美英差異時很好用（需要免費註冊）。",
  },
  "corpus.mwThesaurus": {
    ja: "Merriam-Webster 類語",
    en: "Merriam-Webster Thesaurus",
    "zh-TW": "Merriam-Webster 同義詞",
  },
  "corpus.mwThesaurusHint": {
    ja: "似た語がどう違うかを、例文つきで並べて見られます。",
    en: "How near-synonyms differ, laid out side by side with examples.",
    "zh-TW": "意思相近的詞差在哪裡，附例句並排著看。",
  },
  "corpus.sketch": { ja: "Sketch Engine", en: "Sketch Engine", "zh-TW": "Sketch Engine" },
  "corpus.sketchHint": {
    ja: "一緒に使う語の一覧が最も詳しい系統。ただしログインが要ります。",
    en: "The best collocation lists anywhere — but it needs an account.",
    "zh-TW": "搭配詞的清單最詳細的一套，不過需要登入帳號。",
  },
  // --- もう一度撮る提案(src/lib/retake.ts) ---
  "retake.title": {
    ja: "、もう一度撮ってみる？",
    en: " — shoot it again?",
    "zh-TW": "，要不要再拍一次？",
  },
  "retake.lapsing": {
    ja: "{n}回出しましたが、まだつまずいています。同じ物をもう一度撮ると、新しい写真・場所・一言が手がかりになります。",
    en: "You've seen it {n} times and it still slips. Catching the same thing again gives you a fresh photo, place and note to hang the memory on.",
    "zh-TW":
      "已經出過 {n} 次，但還是卡住。再拍一次同樣的東西，新的照片、地點和感想都會變成想起來的線索。",
  },
  "retake.stuck": {
    ja: "{n}回出しましたが、間隔が伸びていません。もう一度撮って、思い出す手がかりを増やしませんか。",
    en: "Seen {n} times, but the interval isn't growing. Catch it again to give yourself another way in.",
    "zh-TW": "已經出過 {n} 次，但間隔沒有拉長。再拍一次，多給自己一個想起來的入口。",
  },
  "retake.cta": { ja: "撮りに行く", en: "Go catch it", "zh-TW": "去拍" },
  "retake.hint": {
    ja: "「{w}」をもう一度撮ってみましょう",
    en: "Catch “{w}” again",
    "zh-TW": "再拍一次「{w}」看看",
  },
  "rv.overallTitle": {
    ja: "全体の記憶率（前後2週間）",
    en: "Overall retention (±2 weeks)",
    "zh-TW": "整體記憶率（前後兩週）",
  },
  "rv.tapForCurve": {
    ja: "タップで単語ごとの忘却曲線と「いつ忘れるか」の予測が見られます",
    en: "Tap to see each word's forgetting curve and when you're predicted to forget it",
    "zh-TW": "點一下可以看每個字的遺忘曲線，以及「什麼時候會忘記」的預測",
  },
  "rv.today": { ja: "今日", en: "Today", "zh-TW": "今天" },
  "rv.retention": { ja: "記憶保持率", en: "Retention", "zh-TW": "記憶保持率" },
  "rv.daysLater": { ja: "{n}日後", en: "in {n}d", "zh-TW": "{n} 天後" },
  "rv.daysAgo": { ja: "{n}日前", en: "{n}d ago", "zh-TW": "{n} 天前" },
  "rv.avgRetention": { ja: "平均記憶率", en: "Average retention", "zh-TW": "平均記憶率" },
  "rv.dayN": { ja: "{n}日", en: "{n}d", "zh-TW": "{n} 天" },
  "rv.formula1": {
    ja: "曲線は保持率 R = e−t/S(S = 間隔 × 定着度)。● の復習ごとに 100% へ回復し、",
    en: "The curve is retention R = e−t/S (S = interval × strength). Each ● review restores it to 100%, and",
    "zh-TW": "曲線是保持率 R = e−t/S（S = 間隔 × 熟練度）。每次 ● 複習都會回到 100%，",
  },
  "rv.formula2": {
    ja: "正解すると S が伸びて坂が緩やかになります。",
    en: "getting it right grows S, flattening the slope.",
    "zh-TW": "答對時 S 會變長，坡度就變緩。",
  },
  "rv.formula3": {
    ja: "付近が、思い出す努力が効く一番おいしい復習タイミングです。",
    en: "is the sweet spot where the effort of recall pays off most.",
    "zh-TW": "附近是「回想的努力」最划算的複習時機。",
  },
  "rv.greenLine": { ja: "緑の線(85%)", en: "The green line (85%)", "zh-TW": "綠色的線（85%）" },
  "rv.noAsr": {
    ja: "このブラウザは音声認識に非対応です。テキスト欄に直接入力してください。",
    en: "This browser doesn't support speech recognition. Please type in the box instead.",
    "zh-TW": "這個瀏覽器不支援語音辨識，請直接在文字欄輸入。",
  },
  "rv.notHeard": {
    ja: "音声を聞き取れませんでした。もう一度話すか、下の欄に直接入力してください。",
    en: "Couldn't catch that. Try speaking again, or type in the box below.",
    "zh-TW": "沒有聽清楚。請再說一次，或直接在下面的欄位輸入。",
  },
  "rv.feedbackFailed": {
    ja: "AIフィードバックに失敗しました",
    en: "AI feedback failed",
    "zh-TW": "AI 回饋失敗",
  },
  "rv.targetAlt": { ja: "復習対象", en: "The word being reviewed", "zh-TW": "正在複習的字" },
  "rv.readQuestion": { ja: "質問を読み上げ", en: "Read the question aloud", "zh-TW": "唸出題目" },
  "rv.stop": { ja: "停止", en: "Stop", "zh-TW": "停止" },
  "rv.record": { ja: "録音", en: "Record", "zh-TW": "錄音" },
  "rv.hearCorrection": {
    ja: "添削文を聞く",
    en: "Listen to the correction",
    "zh-TW": "聽修改後的句子",
  },
  "rv.nextArrow": { ja: "次へ", en: "Next", "zh-TW": "下一個" },
  "rv.topChunk": { ja: "よく使う形", en: "Most-used pattern", "zh-TW": "最常用的形式" },
  "rv.relatedWords": { ja: "一緒に覚える語", en: "Words to learn with it", "zh-TW": "一起記的字" },
  "rv.measureWords": { ja: "量詞", en: "Measure words", "zh-TW": "量詞" },
  "rv.goodToKnow": { ja: "知っておくと得", en: "Good to know", "zh-TW": "知道了會加分" },
  "rv.kindSyn": { ja: "似", en: "syn", "zh-TW": "近" },
  "rv.kindAnt": { ja: "反", en: "ant", "zh-TW": "反" },
  "rv.kindRel": { ja: "関", en: "rel", "zh-TW": "關" },
  "dex.truncated": {
    ja: "全{total}件のうち、新しい{n}件を表示しています。これより古いものはまだ出せていません。",
    en: "Showing the newest {n} of {total}. Older ones aren't loaded yet.",
    "zh-TW": "共 {total} 筆，目前顯示最新的 {n} 筆。比這更舊的還沒載入。",
  },
  // 「×3」はこのアプリが決めた記号なので、出ているときは意味を添える。
  "dex.metCountLegend": {
    ja: "は、その言葉に出会った回数です",
    en: "means how many times you've met that word",
    "zh-TW": "是遇到那個字的次數",
  },
  "dex.metCountAria": {
    ja: "{word} — {n}回出会った",
    en: "{word} — met {n} times",
    "zh-TW": "{word} — 遇到 {n} 次",
  },
  "dex.allCategories": { ja: "すべて", en: "All", "zh-TW": "全部" },
  "dex.calendar": { ja: "カレンダー", en: "Calendar", "zh-TW": "行事曆" },
  "dex.calendarEmpty": {
    ja: "まだ写真がありません。撮るとその日のマスに入ります。",
    en: "No photos yet. Each one lands on the day you took it.",
    "zh-TW": "還沒有照片。拍了就會放進那天的格子裡。",
  },
  "dex.prevMonth": { ja: "前の月", en: "Previous month", "zh-TW": "上個月" },
  "dex.nextMonth": { ja: "次の月", en: "Next month", "zh-TW": "下個月" },
  // **英語だけ空なのはわざと。** カレンダーの読み上げに付ける単位で、
  // 日本語と中文は「25日」、英語は「25」と数字だけで言う。
  // 空でないことを見る門（`i18n.test.ts`）に、ここだけ名指しで許してある。
  "dex.dayUnit": { ja: "日", en: "", "zh-TW": "日" },
  "dex.allDays": { ja: "すべての日", en: "All days", "zh-TW": "所有日期" },
  "rv.whichIsBefore": { ja: "「", en: "Which one means “", "zh-TW": "「" },
  "rv.whichIsAfter": { ja: "」はどれ？", en: "”?", "zh-TW": "」是哪一個？" },
  "rv.pronOf": { ja: "{c}の発音", en: "Pronunciation of {c}", "zh-TW": "{c}的發音" },
  "card.moveUp": { ja: "上へ", en: "Move up", "zh-TW": "往上" },
  "card.moveDown": { ja: "下へ", en: "Move down", "zh-TW": "往下" },
  "card.toggleShow": { ja: "表示切替", en: "Show / hide", "zh-TW": "切換顯示" },
  "card.playPron": { ja: "発音を再生", en: "Play pronunciation", "zh-TW": "播放發音" },
  "card.pronZhuyin": { ja: "発音・注音", en: "Pronunciation & Zhuyin", "zh-TW": "發音・注音" },
  "card.posLabel": { ja: "品詞", en: "Part of speech", "zh-TW": "詞性" },
  "card.otherLabel": { ja: "その他", en: "Other", "zh-TW": "其他" },
  "card.reportError": {
    ja: "この語の誤りを報告",
    en: "Report an error in this entry",
    "zh-TW": "回報這個字的錯誤",
  },
  "card.freqAria": { ja: "頻度 {n}/5", en: "Frequency {n}/5", "zh-TW": "頻率 {n}/5" },
  "card.pronOfWord": {
    ja: "「{word}」の発音",
    en: 'Pronunciation of "{word}"',
    "zh-TW": "「{word}」的發音",
  },
  "card.ytLabel": { ja: "YouTubeで聞く", en: "Hear it on YouTube", "zh-TW": "在 YouTube 上聽" },
  "card.ytHint": {
    ja: "台湾の動画をまとめて（複数見られます）",
    en: "Videos from Taiwan — a whole list of them",
    "zh-TW": "彙整台灣的影片（可以看好幾支）",
  },
  "card.yglLabel": {
    ja: "YouGlishで発音例",
    en: "Pronunciation samples on YouGlish",
    "zh-TW": "在 YouGlish 聽發音範例",
  },
  "card.yglHint": {
    ja: "1本ずつ。矢印で次の話者へ",
    en: "One clip at a time — arrows move to the next speaker",
    "zh-TW": "一支一支看，用箭頭換下一位說話者",
  },
  "card.dcardLabel": { ja: "Dcardで見る", en: "See it on Dcard", "zh-TW": "在 Dcard 上看" },
  "card.dcardHint": {
    ja: "台湾の若者のSNSでの使われ方",
    en: "How young people in Taiwan use it on social media",
    "zh-TW": "台灣年輕人在社群上怎麼用",
  },
  "card.newsLabel": {
    ja: "台湾のサイトで検索",
    en: "Search Taiwanese sites",
    "zh-TW": "在台灣的網站搜尋",
  },
  "card.newsHint": {
    ja: "台湾の記事だけに絞った検索結果",
    en: "Results limited to pages from Taiwan",
    "zh-TW": "只限台灣文章的搜尋結果",
  },
  "card.threadsLabel": {
    ja: "Threads で見る",
    en: "See it on Threads",
    "zh-TW": "在 Threads 上看",
  },
  "card.threadsHint": {
    ja: "台湾の人がいま書いている短い文",
    en: "Short posts people in Taiwan are writing now",
    "zh-TW": "台灣人現在正在寫的短句",
  },
  "card.contextLabel": {
    ja: "文の中での使われ方",
    en: "How it sits in a sentence",
    "zh-TW": "在句子裡怎麼用",
  },
  "card.contextHint": {
    ja: "実際の文と対訳を並べて見る",
    en: "Real sentences side by side with translations",
    "zh-TW": "真實句子和對照翻譯並排著看",
  },
  "card.moeLabel": {
    ja: "教育部國語辭典簡編本",
    en: "MOE Concised Mandarin Dictionary",
    "zh-TW": "教育部國語辭典簡編本",
  },
  "card.moeHint": {
    ja: "台湾教育部の公式辞書（定義・注音）",
    en: "Taiwan's official MOE dictionary (definitions, Zhuyin)",
    "zh-TW": "台灣教育部的官方辭典（釋義・注音）",
  },
  // --- 英語のカードの「実際の使われ方」(第4段) -----------------------------
  // **札の名前は使い回す**(YouTube / Threads / ニュース / 文の中)。
  // 一言だけ言語ごとに変える — 中身が変わるのはそこだけ。
  "card.ytHintEn": {
    ja: "英語圏の動画をまとめて（複数見られます）",
    en: "Videos from the English-speaking world — a whole list of them",
    "zh-TW": "彙整英語圈的影片（可以看好幾支）",
  },
  "card.yglHintEn": {
    ja: "アメリカ英語の話者で1本ずつ。矢印で次へ",
    en: "One American-English speaker at a time — arrows move to the next",
    "zh-TW": "一次一位美式英語的說話者，用箭頭換下一位",
  },
  "card.redditLabel": { ja: "Redditで見る", en: "See it on Reddit", "zh-TW": "在 Reddit 上看" },
  "card.redditHint": {
    ja: "普通の人が書いた文での使われ方",
    en: "How ordinary people actually write it",
    "zh-TW": "一般人實際上怎麼寫",
  },
  "card.threadsHintEn": {
    ja: "英語圏の人がいま書いている短い文",
    en: "Short posts English speakers are writing now",
    "zh-TW": "英語圈的人現在正在寫的短句",
  },
  // **札の名前も替える。** 一言だけ替えて名前を使い回したら、英語の
  // カードに「在台灣的網站搜尋（台湾のサイトで検索）」と出た(絵で見つけた)。
  "card.newsLabelEn": {
    ja: "英語のサイトで検索",
    en: "Search English-language sites",
    "zh-TW": "在英語網站搜尋",
  },
  "card.newsHintEn": {
    ja: "英語のサイトだけに絞った検索結果",
    en: "Results limited to English-language pages",
    "zh-TW": "只限英語網站的搜尋結果",
  },
  "card.mwLabel": {
    ja: "Merriam-Webster",
    en: "Merriam-Webster",
    "zh-TW": "Merriam-Webster",
  },
  "card.mwHint": {
    ja: "アメリカ英語の標準的な辞書（定義・発音）",
    en: "The standard American English dictionary (definitions, pronunciation)",
    "zh-TW": "美式英語的標準辭典（釋義・發音）",
  },
  // --- スキャン・カード詳細 ---
  "scan.cameraFailed": {
    ja: "カメラを起動できませんでした",
    en: "Couldn't start the camera",
    "zh-TW": "無法啟動相機",
  },
  "scan.cameraDenied": {
    ja: "カメラの使用が許可されていません。ブラウザの設定で許可するか、下の入力欄から言葉を調べられます。",
    en: "Camera access isn't allowed. Enable it in your browser settings, or look words up using the box below.",
    "zh-TW": "沒有取得相機權限。請到瀏覽器設定裡允許，或用下面的輸入欄查單字。",
  },
  "scan.cameraNotFound": {
    ja: "カメラが見つかりませんでした。下の入力欄から言葉を調べられます。",
    en: "No camera found. You can still look words up using the box below.",
    "zh-TW": "找不到相機。可以用下面的輸入欄查單字。",
  },
  "scan.cameraBusy": {
    ja: "カメラを他のアプリが使用中のようです。他のアプリを閉じて、もう一度お試しください。",
    en: "The camera seems to be in use by another app. Close it and try again.",
    "zh-TW": "相機似乎正被其他 App 使用。請關掉其他 App 再試一次。",
  },
  "scan.noVoice": {
    ja: "この端末は音声入力に対応していません。文字で入力してください。",
    en: "This device doesn't support voice input. Please type instead.",
    "zh-TW": "這個裝置不支援語音輸入，請用文字輸入。",
  },
  "scan.noFrame": {
    ja: "フレームを取得できませんでした",
    en: "Couldn't grab a frame",
    "zh-TW": "無法取得畫面",
  },
  "scan.detectFailed": { ja: "検出に失敗しました", en: "Detection failed", "zh-TW": "偵測失敗" },
  "scan.nothingFound": {
    ja: "文字が見つかりませんでした",
    en: "No words found",
    "zh-TW": "沒有找到文字",
  },
  "scan.nothingFoundHint": {
    ja: "看板やパッケージの中国語に近づけて、もう一度撮ってみてください。",
    en: "Get closer to some Chinese text (a sign or label) and scan again.",
    "zh-TW": "請靠近招牌或包裝上的中文，再拍一次看看。",
  },
  "scan.detailFailed": {
    ja: "詳細検出に失敗しました",
    en: "Detailed detection failed",
    "zh-TW": "細部偵測失敗",
  },
  "scan.partOf": { ja: "{word}（部品）", en: "{word} (part)", "zh-TW": "{word}（零件）" },
  "scan.detectMs": { ja: "検出 {ms}ms", en: "detect {ms}ms", "zh-TW": "偵測 {ms}ms" },
  "scan.audioMs": { ja: "音声 {ms}ms", en: "audio {ms}ms", "zh-TW": "語音 {ms}ms" },
  "scan.whichOne": { ja: "どちらですか？", en: "Which one?", "zh-TW": "是哪一個呢？" },
  "scan.foundDaysAgoBefore": {
    ja: "✨ {n}日前に調べた「",
    en: "✨ You looked this up {n} day(s) ago: ",
    "zh-TW": "✨ 這是 {n} 天前查過的「",
  },
  "scan.foundDaysAgoAfter": {
    ja: "」だ！撮って図鑑を完成させよう",
    en: " — shoot it to complete your dex",
    "zh-TW": "」！拍下來把圖鑑補齊吧",
  },
  "scan.ownedTag": { ja: "取得済み", en: "Collected", "zh-TW": "已收集" },
  "scan.verified": { ja: "✓ 検証済み", en: "✓ Verified", "zh-TW": "✓ 已驗證" },
  "scan.aiUnverified": {
    ja: "AI生成・未検証",
    en: "AI generated · unverified",
    "zh-TW": "AI 生成・未驗證",
  },
  "scan.playPron": { ja: "発音を再生", en: "Play pronunciation", "zh-TW": "播放發音" },
  "scan.partsTitle": {
    ja: "この物体を構成する部品を追加検出",
    en: "Also detect the parts that make up this object",
    "zh-TW": "追加偵測組成這個物體的零件",
  },
  "scan.analyzingParts": { ja: "解析中…", en: "Analyzing…", "zh-TW": "分析中…" },
  "scan.finer": { ja: "細かく", en: "Finer", "zh-TW": "更細" },
  "card.title": { ja: "カード", en: "Card", "zh-TW": "字卡" },
  "card.backToDex": { ja: "図鑑へ戻る", en: "Back to dex", "zh-TW": "回到圖鑑" },
  "card.notFound": {
    ja: "カードが見つかりませんでした。",
    en: "Card not found.",
    "zh-TW": "找不到這張字卡。",
  },
  "card.notFoundHint": {
    ja: "削除されたか、リンクが古いのかもしれません。",
    en: "It may have been deleted, or the link is out of date.",
    "zh-TW": "可能已經被刪除，或是連結太舊了。",
  },
  "card.flipSelfie": { ja: "自撮りを見る", en: "See the selfie", "zh-TW": "看自拍" },
  "card.tapForSelfie": {
    ja: "タップで自撮りへ",
    en: "Tap for the selfie",
    "zh-TW": "點一下看自拍",
  },
  "card.seeAll": {
    ja: "すべての解説を見る",
    en: "See the full explanation",
    "zh-TW": "看全部的說明",
  },
  "card.memoryCurve": {
    ja: "この単語の記憶曲線",
    en: "This word's memory curve",
    "zh-TW": "這個單字的記憶曲線",
  },
  "card.nextDue": { ja: "次回 {date}", en: "next {date}", "zh-TW": "下次 {date}" },
  // --- 図鑑 ---
  "dex.desc": {
    ja: "あなたがキャッチした言葉だけの図鑑。撮ったものから自動でカテゴリーが生まれます。",
    en: "A dex of only the words you caught. Categories appear on their own from what you shoot.",
    "zh-TW": "只收錄你捕捉到的字的圖鑑。分類會依你拍的東西自動長出來。",
  },
  "dex.playPron": {
    ja: "「{word}」の発音を再生",
    en: 'Play the pronunciation of "{word}"',
    "zh-TW": "播放「{word}」的發音",
  },
  "dex.seeOnMap": {
    ja: "「{word}」の場所を地図で見る",
    en: 'See where "{word}" was caught on the map',
    "zh-TW": "在地圖上看「{word}」的地點",
  },
  // --- 品詞グループ ---
  "pos.noun": { ja: "📛 名詞", en: "📛 Nouns", "zh-TW": "📛 名詞" },
  "pos.verb": { ja: "🏃 動詞", en: "🏃 Verbs", "zh-TW": "🏃 動詞" },
  "pos.adj": { ja: "🎨 形容詞", en: "🎨 Adjectives", "zh-TW": "🎨 形容詞" },
  "pos.phrase": { ja: "💬 フレーズ", en: "💬 Phrases", "zh-TW": "💬 片語" },
  "pos.other": { ja: "✨ その他", en: "✨ Other", "zh-TW": "✨ 其他" },
  // --- 図鑑カテゴリー ---
  // 絵文字はここに書かない。CATEGORY_META(lib/category.ts)が持つ —
  // ラベル文字列に混ぜてしまうと、絵文字だけ大きく出すといった扱いができない。
  "cat.fruit": { ja: "果物", en: "Fruit", "zh-TW": "水果" },
  "cat.vegetable": { ja: "野菜", en: "Vegetables", "zh-TW": "蔬菜" },
  "cat.drink": { ja: "飲み物", en: "Drinks", "zh-TW": "飲料" },
  "cat.food": { ja: "食べ物", en: "Food", "zh-TW": "食物" },
  "cat.dessert": { ja: "スイーツ", en: "Desserts", "zh-TW": "甜點" },
  "cat.vehicle": { ja: "乗り物", en: "Vehicles", "zh-TW": "交通工具" },
  "cat.transport": { ja: "交通", en: "Transport", "zh-TW": "交通" },
  "cat.animal": { ja: "動物", en: "Animals", "zh-TW": "動物" },
  "cat.plant": { ja: "植物", en: "Plants", "zh-TW": "植物" },
  "cat.flower": { ja: "花", en: "Flowers", "zh-TW": "花" },
  "cat.building": { ja: "建物", en: "Buildings", "zh-TW": "建築" },
  "cat.street": { ja: "街並み", en: "Streets", "zh-TW": "街景" },
  "cat.sign": { ja: "看板", en: "Signs", "zh-TW": "招牌" },
  "cat.shop": { ja: "お店", en: "Shops", "zh-TW": "店家" },
  "cat.home": { ja: "家", en: "Home", "zh-TW": "家" },
  "cat.furniture": { ja: "家具", en: "Furniture", "zh-TW": "家具" },
  "cat.appliance": { ja: "家電", en: "Appliances", "zh-TW": "家電" },
  "cat.kitchenware": { ja: "調理器具", en: "Kitchenware", "zh-TW": "廚具" },
  "cat.tool": { ja: "道具", en: "Tools", "zh-TW": "工具" },
  "cat.clothes": { ja: "服", en: "Clothes", "zh-TW": "衣服" },
  "cat.accessory": { ja: "アクセ", en: "Accessories", "zh-TW": "配件" },
  "cat.shoes": { ja: "靴", en: "Shoes", "zh-TW": "鞋子" },
  "cat.bag": { ja: "バッグ", en: "Bags", "zh-TW": "包包" },
  "cat.jewelry": { ja: "ジュエリー", en: "Jewelry", "zh-TW": "珠寶" },
  "cat.stationery": { ja: "文房具", en: "Stationery", "zh-TW": "文具" },
  "cat.book": { ja: "本", en: "Books", "zh-TW": "書" },
  "cat.tech": { ja: "テック", en: "Tech", "zh-TW": "科技" },
  "cat.gadget": { ja: "ガジェット", en: "Gadgets", "zh-TW": "3C 小物" },
  "cat.toy": { ja: "おもちゃ", en: "Toys", "zh-TW": "玩具" },
  "cat.game": { ja: "ゲーム", en: "Games", "zh-TW": "遊戲" },
  "cat.sport": { ja: "スポーツ", en: "Sports", "zh-TW": "運動" },
  "cat.instrument": { ja: "楽器", en: "Instruments", "zh-TW": "樂器" },
  "cat.nature": { ja: "自然", en: "Nature", "zh-TW": "自然" },
  "cat.weather": { ja: "天気", en: "Weather", "zh-TW": "天氣" },
  "cat.sky": { ja: "空", en: "Sky", "zh-TW": "天空" },
  "cat.water": { ja: "水", en: "Water", "zh-TW": "水" },
  "cat.mountain": { ja: "山", en: "Mountains", "zh-TW": "山" },
  "cat.body": { ja: "体の部位", en: "Body parts", "zh-TW": "身體部位" },
  "cat.face": { ja: "顔", en: "Face", "zh-TW": "臉" },
  "cat.hand": { ja: "手", en: "Hands", "zh-TW": "手" },
  "cat.clothing_part": { ja: "服の部分", en: "Clothing parts", "zh-TW": "衣服的部分" },
  "cat.person": { ja: "人", en: "People", "zh-TW": "人" },
  "cat.family": { ja: "家族", en: "Family", "zh-TW": "家人" },
  "cat.job": { ja: "仕事", en: "Work", "zh-TW": "工作" },
  "cat.art": { ja: "アート", en: "Art", "zh-TW": "藝術" },
  "cat.decoration": { ja: "装飾", en: "Decoration", "zh-TW": "裝飾" },
  "cat.character": { ja: "文字", en: "Characters", "zh-TW": "文字" },
  "cat.symbol": { ja: "記号", en: "Symbols", "zh-TW": "符號" },
  "cat.color": { ja: "色", en: "Colors", "zh-TW": "顏色" },
  "cat.shape": { ja: "形", en: "Shapes", "zh-TW": "形狀" },
  "cat.money": { ja: "お金", en: "Money", "zh-TW": "金錢" },
  "cat.document": { ja: "書類", en: "Documents", "zh-TW": "文件" },
  "cat.medicine": { ja: "薬", en: "Medicine", "zh-TW": "藥" },
  "cat.other": { ja: "その他", en: "Other", "zh-TW": "其他" },
  // --- 読み込み失敗(空とは別の状態として扱う) ---
  "err.loadTitle": { ja: "読み込めませんでした", en: "Couldn't load", "zh-TW": "無法載入" },
  "err.loadHint": {
    ja: "通信が不安定かもしれません。もう一度お試しください。",
    en: "The connection may be unstable. Please try again.",
    "zh-TW": "網路可能不太穩定，請再試一次。",
  },
  "err.offlineTitle": { ja: "オフラインです", en: "You're offline", "zh-TW": "目前離線" },
  "err.offlineHint": {
    ja: "電波が戻ったら、もう一度お試しください。",
    en: "Try again once you're back online.",
    "zh-TW": "等網路恢復後再試一次。",
  },
  // 「何を」読み込めなかったかの名前。画面ごとに1つ。
  "err.whatWordCard": { ja: "この単語のカード", en: "this word's card", "zh-TW": "這個單字的字卡" },
  "err.whatHome": { ja: "今日のページ", en: "today's page", "zh-TW": "今天的頁面" },
  "err.whatDex": { ja: "図鑑", en: "your dex", "zh-TW": "圖鑑" },
  "err.whatMap": { ja: "地図", en: "the map", "zh-TW": "地圖" },
  "err.whatJournal": { ja: "日記", en: "your journal", "zh-TW": "日記" },
  "err.whatSettings": { ja: "設定", en: "your settings", "zh-TW": "設定" },
  "err.whatFeed": { ja: "みんなの投稿", en: "the feed", "zh-TW": "大家的貼文" },
  "err.whatReview": { ja: "今日の復習", en: "today's review", "zh-TW": "今天的複習" },
  "err.retrying": { ja: "再試行中…", en: "Retrying…", "zh-TW": "重試中…" },
  "err.retryingTitle": {
    ja: "もう一度読み込んでいます",
    en: "Trying again",
    "zh-TW": "正在重新載入",
  },
  "err.retryingHint": {
    ja: "少しお待ちください。",
    en: "This should only take a moment.",
    "zh-TW": "請稍等一下。",
  },
  "err.loadTitleOf": {
    ja: "{what}を読み込めませんでした",
    en: "Couldn't load {what}",
    "zh-TW": "無法載入{what}",
  },
  "err.retry": { ja: "もう一度", en: "Try again", "zh-TW": "再試一次" },
  "dex.shelf": { ja: "棚", en: "Shelf", "zh-TW": "書架" },
  "dex.shelfCount": { ja: "{n}", en: "{n}", "zh-TW": "{n}" },
  // --- 図鑑の部屋(棚のまとまり) ---
  "room.eat": { ja: "食べる", en: "Eat", "zh-TW": "吃" },
  "room.town": { ja: "街", en: "Town", "zh-TW": "街" },
  "room.house": { ja: "家", en: "Home", "zh-TW": "家" },
  "room.wear": { ja: "身につける", en: "Wear", "zh-TW": "穿戴" },
  "room.play": { ja: "学び・遊び", en: "Learn & play", "zh-TW": "學習・玩樂" },
  "room.nature": { ja: "自然", en: "Nature", "zh-TW": "自然" },
  "room.people": { ja: "人・体", en: "People", "zh-TW": "人・身體" },
  "room.marks": { ja: "しるし", en: "Marks", "zh-TW": "標記" },
  // --- 集める・キャッチ・設定 ---
  "cap.pendingNotFound": {
    ja: "保存されていた写真が見つかりませんでした",
    en: "Couldn't find the saved photo",
    "zh-TW": "找不到之前存下的照片",
  },
  "cap.photoReadFailed": {
    ja: "写真を読み込めませんでした。もう一度撮ってみてください。",
    en: "Couldn't read that photo. Please try taking it again.",
    "zh-TW": "無法讀取照片，請再拍一次看看。",
  },
  "cap.aiFailed": {
    ja: "AI処理に失敗しました",
    en: "AI processing failed",
    "zh-TW": "AI 處理失敗",
  },
  "cap.aiFailedRetry": {
    ja: "AI処理に失敗しました。もう一度お試しください。",
    en: "AI processing failed. Please try again.",
    "zh-TW": "AI 處理失敗，請再試一次。",
  },
  "cap.cardFailed": {
    ja: "カード生成に失敗しました",
    en: "Couldn't build the card",
    "zh-TW": "字卡產生失敗",
  },
  "cap.savedButLandingFailed": {
    ja: "図鑑には追加できました（演出の途中で問題が起きました）。",
    en: "It's in your dex — something went wrong during the animation.",
    "zh-TW": "已經加進圖鑑了（動畫途中出了點狀況）。",
  },
  "cap.saveFailed": { ja: "保存に失敗しました", en: "Couldn't save", "zh-TW": "儲存失敗" },
  "cap.recordFailed": { ja: "記録に失敗しました", en: "Couldn't record that", "zh-TW": "紀錄失敗" },
  "cap.photoTaken": { ja: "撮った写真", en: "The photo you took", "zh-TW": "拍下的照片" },
  "cap.photoCutout": { ja: "切り抜いた写真", en: "Cut-out photo", "zh-TW": "去背後的照片" },
  "cap.selfie": { ja: "自撮り", en: "Selfie", "zh-TW": "自拍" },
  "cap.wordPlaceholder": { ja: "例: 椅子", en: "e.g. 椅子", "zh-TW": "例：椅子" },
  "cap.reencBefore": { ja: "この言葉、", en: "You caught this word ", "zh-TW": "這個字，你在" },
  // **{date} が日本語から丸ごと抜けていた。** 「この言葉、にゲットしています。」
  // と、いつ撮ったのかが消えた文が出ていた(オーナーのスクリーンショット)。
  // 差し込み語の抜けは翻訳ファイルの中では目で気づけない。
  "cap.reencAt": {
    ja: "{date}に{place}で",
    en: "at {place} on {date}",
    "zh-TW": "{date} 於 {place}",
  },
  "cap.reencOn": { ja: "{date}に", en: "on {date}", "zh-TW": "{date}" },
  "cap.reencAfter": { ja: "ゲットしています。", en: ".", "zh-TW": "收集過了。" },
  "cap.reunionNth": { ja: "再会{n}回目", en: "Reunion #{n}", "zh-TW": "第 {n} 次重逢" },
  "photos.title": {
    ja: "この言葉に出会った記録",
    en: "Times you met this word",
    "zh-TW": "遇到這個字的紀錄",
  },
  "photos.count": { ja: "{n}枚", en: "{n} photos", "zh-TW": "{n} 張" },
  "photos.first": { ja: "はじめて", en: "First", "zh-TW": "第一次" },
  "photos.alt": {
    ja: "{n}回目に撮った写真",
    en: "Photo from meeting {n}",
    "zh-TW": "第 {n} 次拍的照片",
  },
  "cap.reunionSaving": {
    ja: "この1枚を図鑑に足しています…",
    en: "Adding this photo to your dex…",
    "zh-TW": "正在把這張加進圖鑑…",
  },
  "cap.photoAdded": {
    ja: "この写真を単語に追加しました",
    en: "Photo added to this word",
    "zh-TW": "已把這張照片加到這個字",
  },
  "cap.nextReview": {
    ja: " · 次の復習: {date}",
    en: " · next review: {date}",
    "zh-TW": " · 下次複習：{date}",
  },
  "sheet.catch": { ja: "キャッチ", en: "Catch", "zh-TW": "捕捉" },
  "sheet.file": { ja: "図鑑へ収める", en: "Add to dex", "zh-TW": "收進圖鑑" },
  "sheet.landed": { ja: "図鑑に着地！", en: "Landed in your dex!", "zh-TW": "降落在圖鑑了！" },
  "sheet.noWordInfo": {
    ja: "単語情報を取得できませんでした",
    en: "Couldn't get the word details",
    "zh-TW": "無法取得單字資訊",
  },
  "sheet.firstCatch": {
    ja: "はじめてのキャッチ！明日、この単語を覚えてるか聞くね",
    en: "Your first catch! Tomorrow I'll ask if you still remember it",
    "zh-TW": "第一次捕捉！明天會問你還記不記得這個字",
  },
  "sheet.reunion": {
    ja: "再会！自分の写真になりました✨",
    en: "Reunion! Now it's your own photo ✨",
    "zh-TW": "重逢！變成你自己的照片了 ✨",
  },
  "sheet.addedOne": {
    ja: "図鑑に1体増えました！",
    en: "One more in your dex!",
    "zh-TW": "圖鑑多了一隻！",
  },
  "sheet.cardAdded": {
    ja: "図鑑にカードが入りました！",
    en: "Card added to your dex!",
    "zh-TW": "字卡進到圖鑑了！",
  },
  "sheet.addedGhostFree": {
    ja: "図鑑に入りました。実物に出会ったら金色に光ります！",
    en: "Added to your dex. It turns gold when you meet the real thing!",
    "zh-TW": "已經收進圖鑑。遇到實物時就會發出金色的光！",
  },
  "sheet.loading": { ja: "読み込み中…", en: "Loading…", "zh-TW": "載入中…" },
  "sheet.reunionNotRecorded": {
    ja: "キャッチはできましたが、復習の記録に失敗しました。この語はまた出てきます。",
    en: "Caught it, but the review record didn't save — this word will come round again.",
    "zh-TW": "捕捉成功了，但複習紀錄沒有存到。這個字之後還會再出現。",
  },
  "sheet.verified": { ja: "✓ 検証済み", en: "✓ Verified", "zh-TW": "✓ 已驗證" },
  "sheet.aiMade": { ja: "AI生成", en: "AI generated", "zh-TW": "AI 生成" },
  "sheet.optional": { ja: "（任意）", en: "(optional)", "zh-TW": "（選填）" },
  "sheet.noteLabel": { ja: "一言感想", en: "A quick note", "zh-TW": "一句話感想" },
  "sheet.notePlaceholder": {
    ja: "どこで見つけた？どんな気持ち？",
    en: "Where did you find it? How did it feel?",
    "zh-TW": "在哪裡發現的？當下什麼心情？",
  },
  "sheet.selfieLabel": { ja: "一緒に自撮り", en: "Selfie with it", "zh-TW": "一起自拍" },
  "sheet.retakeSelfie": { ja: "撮り直す", en: "Retake", "zh-TW": "重拍" },
  "sheet.addSelfie": { ja: "自撮りを追加", en: "Add a selfie", "zh-TW": "加上自拍" },
  "sheet.stopRepeat": { ja: "停止", en: "Stop", "zh-TW": "停止" },
  "sheet.repeat": {
    ja: "聞こえたまま復唱する",
    en: "Repeat what you heard",
    "zh-TW": "跟著唸一次",
  },
  "sheet.inputPlaceholder": {
    ja: "例: 芒果 / 請稍等",
    en: "e.g. 芒果 / 請稍等",
    "zh-TW": "例：芒果 / 請稍等",
  },
  "sheet.attached": { ja: "添付画像", en: "Attached image", "zh-TW": "附加的圖片" },
  "sheet.webImage": { ja: "ネット検索の画像", en: "Image from the web", "zh-TW": "網路搜尋的圖片" },
  "sheet.candidateN": { ja: "候補{n}", en: "Candidate {n}", "zh-TW": "候選 {n}" },
  "sheet.scene": { ja: "シーン: {s}", en: "Scene: {s}", "zh-TW": "場景：{s}" },
  "set.targetLangAria": { ja: "学習言語", en: "Target language", "zh-TW": "學習語言" },
  "set.levelGoalAria": { ja: "目標レベル", en: "Target level", "zh-TW": "目標等級" },
  "set.nativeAria": { ja: "母語", en: "Native language", "zh-TW": "母語" },
  "set.uiLangAria": { ja: "表示言語", en: "App language", "zh-TW": "顯示語言" },
  "set.deleteWord": { ja: "削除", en: "DELETE", "zh-TW": "刪除" },
  "set.qualitySamples": {
    ja: "直近{n}回のスキャンから算出（仕様§9の合格ライン）",
    en: "Computed from your last {n} scans (spec §9 pass line)",
    "zh-TW": "由最近 {n} 次掃描計算（規格 §9 的合格標準）",
  },
  "set.placeLabel": { ja: "場所で思い出す", en: "Remember by place", "zh-TW": "在原地想起來" },
  "set.placeChecking": {
    ja: "許可を確認しています…",
    en: "Checking permission…",
    "zh-TW": "正在確認權限…",
  },
  "set.placeHint": {
    ja: "前に単語を撮った場所の近くでアプリを開くと「ここで撮ったこれ覚えてる？」と知らせます。アプリを閉じている間は動きません。",
    en: "When you open the app near a place you caught a word, it reminds you: “remember this one?” It does not run while the app is closed.",
    "zh-TW":
      "在以前拍過單字的地點附近打開 App 時，會提醒你「在這裡拍的那個還記得嗎？」。App 關著的時候不會運作。",
  },
  "set.placeUnsupported": {
    ja: "このブラウザでは通知を使えません。iPhone の場合は Safari の共有ボタンから「ホーム画面に追加」して、そのアイコンから開くとオンにできます。",
    en: "This browser can't use notifications. On iPhone, add the app to your Home Screen from Safari's share menu and open it from that icon.",
    "zh-TW":
      "這個瀏覽器不能使用通知。如果是 iPhone，請從 Safari 的分享按鈕選「加入主畫面」，再從那個圖示打開就能開啟。",
  },
  "set.placeDenied": {
    ja: "通知が拒否されています。端末の設定 → 通知 からこのアプリの通知を許可すると、ここでオンにできます。",
    en: "Notifications are blocked. Allow them for this app in your device settings, then turn this on again.",
    "zh-TW": "通知被拒絕了。到裝置的設定 → 通知，允許這個 App 的通知之後，就能在這裡開啟。",
  },
  "set.placeDismissed": {
    ja: "許可のダイアログが閉じられました。もう一度タップすると出ます。",
    en: "The permission dialog was dismissed. Tap again to show it.",
    "zh-TW": "權限對話框被關掉了。再點一次就會出現。",
  },
  "set.placeError": {
    ja: "通知の許可を確認できませんでした。時間をおいてもう一度お試しください。",
    en: "Couldn't check notification permission. Please try again later.",
    "zh-TW": "無法確認通知權限，請過一會兒再試一次。",
  },
  "set.aiProviderAria": { ja: "AI提供元", en: "AI provider", "zh-TW": "AI 供應商" },
  "set.aiEffective": {
    ja: "提供元 {p} / 速い系 {f} / 詳しい系 {r}",
    en: "Provider {p} / fast {f} / rich {r}",
    "zh-TW": "供應商 {p} / 快速型 {f} / 詳細型 {r}",
  },
  "set.keyMissing": { ja: "({env} 未設定)", en: "({env} not set)", "zh-TW": "（{env} 未設定）" },
  // --- ログイン・発音練習 ---
  "auth.tagline": {
    ja: "街で出会う言葉を、ステッカーに。",
    en: "Turn the words you meet into stickers.",
    "zh-TW": "把在街上遇到的字，變成貼紙。",
  },
  "auth.signin": { ja: "ログイン", en: "Sign in", "zh-TW": "登入" },
  "auth.signup": { ja: "新規登録", en: "Sign up", "zh-TW": "註冊" },
  "auth.email": { ja: "メールアドレス", en: "Email", "zh-TW": "電子郵件" },
  "auth.password": { ja: "パスワード", en: "Password", "zh-TW": "密碼" },
  "auth.or": { ja: "または", en: "or", "zh-TW": "或" },
  "auth.google": { ja: "Googleでサインイン", en: "Sign in with Google", "zh-TW": "用 Google 登入" },
  "auth.apple": { ja: "Appleでサインイン", en: "Sign in with Apple", "zh-TW": "用 Apple 登入" },
  "auth.agreeBefore": {
    ja: "続行すると、",
    en: "By continuing you agree to the ",
    "zh-TW": "繼續即表示你同意",
  },
  "auth.terms": { ja: "利用規約", en: "Terms of Service", "zh-TW": "使用條款" },
  "auth.agreeMid": { ja: "と", en: " and ", "zh-TW": "與" },
  "auth.privacy": { ja: "プライバシーポリシー", en: "Privacy Policy", "zh-TW": "隱私權政策" },
  "auth.agreeAfter": { ja: "に同意したものとみなします。", en: ".", "zh-TW": "。" },
  "auth.confirmSent": {
    ja: "確認メールを送りました。受信トレイをご確認ください。",
    en: "Confirmation email sent — please check your inbox.",
    "zh-TW": "已寄出確認信，請查看你的收件匣。",
  },
  "auth.failed": { ja: "サインインに失敗しました", en: "Sign-in failed", "zh-TW": "登入失敗" },
  "auth.googleFailed": {
    ja: "Googleサインインに失敗しました",
    en: "Google sign-in failed",
    "zh-TW": "Google 登入失敗",
  },
  "auth.appleFailed": {
    ja: "Appleサインインに失敗しました",
    en: "Apple sign-in failed",
    "zh-TW": "Apple 登入失敗",
  },
  "pron.title": { ja: "発音練習", en: "Pronunciation practice", "zh-TW": "發音練習" },
  "pron.noTts": {
    ja: "このブラウザは音声合成に対応していません",
    en: "This browser doesn't support speech synthesis",
    "zh-TW": "這個瀏覽器不支援語音合成",
  },
  "pron.noAsr": {
    ja: "このブラウザは音声認識に対応していません(iOS Safari / Chrome 推奨)",
    en: "This browser doesn't support speech recognition (try iOS Safari or Chrome)",
    "zh-TW": "這個瀏覽器不支援語音辨識（建議用 iOS Safari 或 Chrome）",
  },
  "pron.asrError": {
    ja: "認識エラー: {e}",
    en: "Recognition error: {e}",
    "zh-TW": "辨識錯誤：{e}",
  },
  "pron.playNatural": {
    ja: "自然な速度で再生",
    en: "Play at natural speed",
    "zh-TW": "以自然速度播放",
  },
  "pron.slow": { ja: "ゆっくり", en: "Slow", "zh-TW": "放慢" },
  "pron.stopRec": { ja: "録音停止", en: "Stop recording", "zh-TW": "停止錄音" },
  "pron.startRec": { ja: "発音を録音", en: "Record your pronunciation", "zh-TW": "錄下發音" },
  "pron.listeningBefore": { ja: "聞き取り中…「", en: "Listening… say “", "zh-TW": "聆聽中…請說「" },
  "pron.listeningAfter": { ja: "」と言ってみてください", en: "”", "zh-TW": "」" },
  "pron.yours": { ja: "あなたの発音", en: "Your pronunciation", "zh-TW": "你的發音" },
  "pron.pressBefore": {
    ja: "マイクを押して「",
    en: "Tap the mic and say “",
    "zh-TW": "按下麥克風，說「",
  },
  "pron.pressAfter": { ja: "」と言ってみてください", en: "”", "zh-TW": "」看看" },
  "pron.score": { ja: "スコア", en: "Score", "zh-TW": "分數" },
  // --- フィード・ホーム・プロフィール・オンボーディング・再設定・ルート ---
  "feed.title": { ja: "フィード", en: "Feed", "zh-TW": "動態" },
  "feed.following": { ja: "フォロー中", en: "Following", "zh-TW": "追蹤中" },
  "feed.popular": { ja: "人気", en: "Popular", "zh-TW": "熱門" },
  "feed.emptyFollowing": { ja: "まだ投稿がありません", en: "No posts yet", "zh-TW": "還沒有貼文" },
  "feed.emptyPopular": {
    ja: "人気の投稿はまだありません",
    en: "No popular posts yet",
    "zh-TW": "還沒有熱門貼文",
  },
  "feed.hintFollowing": {
    ja: "誰かをフォローするか、自分のカードをシェアしてみましょう。",
    en: "Follow someone, or share one of your own cards.",
    "zh-TW": "追蹤某個人，或分享自己的字卡看看。",
  },
  "feed.hintPopular": {
    ja: "最初の投稿者になろう！",
    en: "Be the first to post!",
    "zh-TW": "當第一個發文的人吧！",
  },
  "feed.postFromDex": { ja: "図鑑から投稿", en: "Post from your dex", "zh-TW": "從圖鑑發文" },
  "feed.like": { ja: "いいね", en: "Like", "zh-TW": "喜歡" },
  "feed.likeFailed": {
    ja: "いいねできませんでした。もう一度お試しください。",
    en: "Couldn't update your like. Please try again.",
    "zh-TW": "無法按喜歡，請再試一次。",
  },
  "home.waitingPhoto": {
    ja: "解析待ちの写真",
    en: "Photo waiting to be analyzed",
    "zh-TW": "等待分析的照片",
  },
  "home.bgPaper": { ja: "紙", en: "Paper", "zh-TW": "紙" },
  "home.bgFrame": { ja: "額", en: "Frame", "zh-TW": "相框" },
  "home.bgNotebook": { ja: "ノート", en: "Notebook", "zh-TW": "筆記本" },
  "home.bgCork": { ja: "コルク", en: "Cork", "zh-TW": "軟木板" },
  "user.profile": { ja: "プロフィール", en: "Profile", "zh-TW": "個人檔案" },
  "user.loading": { ja: "読み込み中…", en: "Loading…", "zh-TW": "載入中…" },
  "user.loadFailed": {
    ja: "プロフィールを読み込めませんでした",
    en: "Couldn't load this profile",
    "zh-TW": "無法載入個人檔案",
  },
  "user.since": { ja: "{date} から", en: "since {date}", "zh-TW": "從 {date} 開始" },
  "user.avatarOf": { ja: "{name}のアバター", en: "{name}'s avatar", "zh-TW": "{name} 的頭像" },
  "user.statDex": { ja: "図鑑", en: "Dex", "zh-TW": "圖鑑" },
  "user.statPosts": { ja: "投稿", en: "Posts", "zh-TW": "貼文" },
  "user.statFollowers": { ja: "フォロワー", en: "Followers", "zh-TW": "粉絲" },
  "user.statFollowing": { ja: "フォロー中", en: "Following", "zh-TW": "追蹤中" },
  "user.editProfile": { ja: "プロフィールを編集", en: "Edit profile", "zh-TW": "編輯個人檔案" },
  "user.follow": { ja: "フォローする", en: "Follow", "zh-TW": "追蹤" },
  "user.recentCatches": { ja: "最近のキャッチ", en: "Recent catches", "zh-TW": "最近的捕捉" },
  "user.noCatches": {
    ja: "まだキャッチがありません",
    en: "No catches yet",
    "zh-TW": "還沒有捕捉紀錄",
  },
  "user.someone": { ja: "ユーザー", en: "User", "zh-TW": "使用者" },
  "err.failed": { ja: "失敗しました", en: "Something went wrong", "zh-TW": "失敗了" },
  "ob.title": {
    ja: "かざして、タップしてみて",
    en: "Point it, then tap",
    "zh-TW": "舉起來，點一下看看",
  },
  "ob.line1": {
    ja: "街で見たものにカメラをかざすと、",
    en: "Aim your camera at something on the street and",
    "zh-TW": "把相機對準在街上看到的東西，",
  },
  "ob.line2before": {
    ja: "その単語と発音が",
    en: "you'll see the word and how to say it ",
    "zh-TW": "那個字和發音就會",
  },
  "ob.line2strong": { ja: "瞬間的に", en: "instantly", "zh-TW": "瞬間" },
  "ob.line2after": { ja: "分かります。", en: ".", "zh-TW": "出現。" },
  "ob.f1": {
    ja: "かざす = 調べる（無制限）",
    en: "Point = look it up (unlimited)",
    "zh-TW": "舉起來 = 查詢（無限次）",
  },
  "ob.f2": {
    ja: "タップ = 発音が聞こえる",
    en: "Tap = hear it spoken",
    "zh-TW": "點一下 = 聽到發音",
  },
  "ob.f3": {
    ja: "撮る = 自分の図鑑に残る",
    en: "Shoot = keep it in your dex",
    "zh-TW": "拍下來 = 留在自己的圖鑑",
  },
  "ob.start": { ja: "スキャンをはじめる", en: "Start scanning", "zh-TW": "開始掃描" },
  "ob.privacy": {
    ja: "カメラは「見たものの単語を教えるため」だけに使います",
    en: "The camera is only used to tell you the word for what you see",
    "zh-TW": "相機只會用在「告訴你看到的東西怎麼說」這件事上",
  },
  "ob.learner": { ja: "学習者", en: "Learner", "zh-TW": "學習者" },
  "ob.startFailed": { ja: "開始に失敗しました", en: "Could not get started", "zh-TW": "無法開始" },
  "rp.title": { ja: "パスワード再設定", en: "Reset password", "zh-TW": "重設密碼" },
  "rp.hintRequest": {
    ja: "登録メールアドレスにリンクを送ります。",
    en: "We'll email a link to your registered address.",
    "zh-TW": "會把連結寄到你註冊的電子郵件。",
  },
  "rp.hintUpdate": {
    ja: "新しいパスワードを入力してください。",
    en: "Enter your new password.",
    "zh-TW": "請輸入新的密碼。",
  },
  "rp.email": { ja: "メールアドレス", en: "Email", "zh-TW": "電子郵件" },
  "rp.sendLink": { ja: "再設定リンクを送る", en: "Send reset link", "zh-TW": "寄出重設連結" },
  "rp.newPassword": { ja: "新しいパスワード", en: "New password", "zh-TW": "新密碼" },
  "rp.update": { ja: "パスワードを更新", en: "Update password", "zh-TW": "更新密碼" },
  "rp.backToLogin": { ja: "ログイン画面に戻る", en: "Back to sign in", "zh-TW": "回到登入畫面" },
  "rp.sent": {
    ja: "再設定リンクをメールで送りました。",
    en: "Reset link sent — check your email.",
    "zh-TW": "已用電子郵件寄出重設連結。",
  },
  "rp.sendFailed": { ja: "送信に失敗しました", en: "Could not send", "zh-TW": "寄送失敗" },
  "rp.updated": {
    ja: "パスワードを更新しました。",
    en: "Password updated.",
    "zh-TW": "密碼已更新。",
  },
  "rp.updateFailed": { ja: "更新に失敗しました", en: "Could not update", "zh-TW": "更新失敗" },
  "root.notFound": {
    ja: "ページが見つかりません",
    en: "Page not found",
    "zh-TW": "找不到這個頁面",
  },
  "root.notFoundHint": {
    ja: "指定されたページは存在しないか、移動された可能性があります。",
    en: "This page doesn't exist, or it may have moved.",
    "zh-TW": "指定的頁面可能不存在，或是已經搬走了。",
  },
  "root.toHome": { ja: "ホームへ", en: "Go home", "zh-TW": "回首頁" },
  "root.loadFailed": { ja: "読み込みに失敗しました", en: "Failed to load", "zh-TW": "載入失敗" },
  "root.loadFailedHint": {
    ja: "少し時間を置いてもう一度お試しください。",
    en: "Please wait a moment and try again.",
    "zh-TW": "請過一會兒再試一次。",
  },
  "root.retry": { ja: "再試行", en: "Retry", "zh-TW": "重試" },
  // --- 発見・投稿・日記 ---
  "discover.title": { ja: "発見", en: "Discover", "zh-TW": "探索" },
  "discover.search": {
    ja: "ユーザー名 / 単語 / 意味で検索",
    en: "Search users, words or meanings",
    "zh-TW": "用使用者名稱／單字／意思搜尋",
  },
  "discover.ranking": { ja: "ランキング", en: "Leaderboard", "zh-TW": "排行榜" },
  "discover.rankingEmpty": {
    ja: "まだランキングデータがありません。",
    en: "No leaderboard data yet.",
    "zh-TW": "還沒有排行榜資料。",
  },
  "discover.stats": {
    ja: "{words} 単語 · {posts} 投稿",
    en: "{words} words · {posts} posts",
    "zh-TW": "{words} 個單字 · {posts} 則貼文",
  },
  "discover.users": { ja: "ユーザー", en: "Users", "zh-TW": "使用者" },
  "discover.noUsers": {
    ja: "該当ユーザーなし",
    en: "No matching users",
    "zh-TW": "沒有符合的使用者",
  },
  "discover.words": { ja: "単語", en: "Words", "zh-TW": "單字" },
  "discover.noWords": { ja: "該当単語なし", en: "No matching words", "zh-TW": "沒有符合的單字" },
  "common.anon": { ja: "名無し", en: "Anonymous", "zh-TW": "無名氏" },
  "post.title": { ja: "投稿", en: "Post", "zh-TW": "貼文" },
  "post.toFeed": { ja: "フィードへ", en: "Back to feed", "zh-TW": "回動態" },
  "post.notFound": {
    ja: "投稿が見つかりませんでした。",
    en: "Post not found.",
    "zh-TW": "找不到這則貼文。",
  },
  "post.comments": { ja: "コメント", en: "Comments", "zh-TW": "留言" },
  "post.firstComment": {
    ja: "最初のコメントを投稿しよう。",
    en: "Be the first to comment.",
    "zh-TW": "來當第一個留言的人吧。",
  },
  "post.writeComment": { ja: "コメントを書く…", en: "Write a comment…", "zh-TW": "寫留言…" },
  "post.sendComment": { ja: "コメントを送信", en: "Send comment", "zh-TW": "送出留言" },
  "journal.title": { ja: "日記", en: "Journal", "zh-TW": "日記" },
  "journal.today": { ja: "今日の日記", en: "Today's entry", "zh-TW": "今天的日記" },
  "journal.intro": {
    ja: "今日撮った写真をもとに、学習している言語で書いてみよう。AIが添削して、その気持ちをネイティブが使う自然なフレーズと「型」の解説も教えてくれます。",
    en: "Write about a photo you took today, in the language you're learning. AI corrects it and shows the natural phrasing and sentence patterns a native would use.",
    "zh-TW":
      "用今天拍的照片，試著用你正在學的語言寫寫看。AI 會幫你修改，還會告訴你母語者表達這種心情時會用的自然說法和「句型」解說。",
  },
  "journal.placeholder": {
    ja: "例: 今天早上我去咖啡店…",
    en: "e.g. 今天早上我去咖啡店…",
    "zh-TW": "例：今天早上我去咖啡店…",
  },
  "journal.correcting": { ja: "添削中…", en: "Reviewing…", "zh-TW": "修改中…" },
  "journal.askCorrect": {
    ja: "AIに添削してもらう",
    en: "Ask AI to review",
    "zh-TW": "請 AI 幫忙修改",
  },
  "journal.corrected": { ja: "✦ 添削後", en: "✦ Corrected", "zh-TW": "✦ 修改後" },
  "journal.patterns": { ja: "型と解説", en: "Patterns & notes", "zh-TW": "句型與解說" },
  "journal.leftover": {
    ja: "{d} の書きかけが残っています:「{s}…」",
    en: "Unfinished writing from {d}: “{s}…”",
    "zh-TW": "還留著 {d} 沒寫完的草稿：「{s}…」",
  },
  "journal.leftoverRestore": { ja: "戻す", en: "Restore", "zh-TW": "還原" },
  "journal.keptOnDevice": {
    ja: "書いたものはこの端末に控えてあります。添削が通らなくても消えません。",
    en: "Your writing is kept on this device — it won't be lost if the check fails.",
    "zh-TW": "你寫的內容有留在這台裝置上，就算修改沒成功也不會不見。",
  },
  "journal.loadFailedNote": {
    ja: "これまでの日記を読み込めませんでした。今日の書きかけがあっても表示できていないので、このまま送ると上書きになります。",
    en: "Couldn't load your journal. If you had a draft for today, it isn't shown — sending now will overwrite it.",
    "zh-TW": "無法載入以前的日記。就算今天有寫到一半的草稿也顯示不出來，直接送出會覆蓋掉。",
  },
  "journal.past": { ja: "過去の日記", en: "Past entries", "zh-TW": "以前的日記" },
  "journal.nativeWould": {
    ja: "ネイティブならこう言う",
    en: "A native would say",
    "zh-TW": "母語者會這樣說",
  },
  "journal.done": { ja: "添削できました", en: "Review complete", "zh-TW": "修改完成" },
  "journal.failed": { ja: "添削失敗", en: "Review failed", "zh-TW": "修改失敗" },
  // --- 通知・相対時刻 ---
  "ago.seconds": { ja: "{n}秒前", en: "{n}s ago", "zh-TW": "{n} 秒前" },
  "ago.minutes": { ja: "{n}分前", en: "{n}m ago", "zh-TW": "{n} 分鐘前" },
  "ago.hours": { ja: "{n}時間前", en: "{n}h ago", "zh-TW": "{n} 小時前" },
  "ago.days": { ja: "{n}日前", en: "{n}d ago", "zh-TW": "{n} 天前" },
  "ago.months": { ja: "{n}ヶ月前", en: "{n}mo ago", "zh-TW": "{n} 個月前" },
  "ago.years": { ja: "{n}年前", en: "{n}y ago", "zh-TW": "{n} 年前" },
  "notif.title": { ja: "通知", en: "Notifications", "zh-TW": "通知" },
  "notif.empty": { ja: "まだ通知はありません", en: "No notifications yet", "zh-TW": "還沒有通知" },
  "notif.liked": { ja: "さんがいいねしました", en: " liked your post", "zh-TW": "說讚" },
  "notif.commented": {
    ja: "さんがコメントしました",
    en: " commented on your post",
    "zh-TW": "留言了",
  },
  "notif.followed": { ja: "さんがフォローしました", en: " followed you", "zh-TW": "追蹤了你" },
  "common.someone": { ja: "誰か", en: "Someone", "zh-TW": "某人" },
  // --- 場所の思い出し(文の前後) ---
  // **「」の中は母語**(オーナー指摘 2026-08-20)。
  // 押した先の問題は「写真+日本語 → 台湾華語を4択」なので、通知に
  // 台湾華語を出すと**開いた瞬間に答えが分かる**。
  "place.rememberBefore": { ja: "「", en: "Remember “", "zh-TW": "「" },
  "place.rememberAfter": {
    ja: "」は台湾華語で？",
    en: "” in Taiwanese Mandarin?",
    "zh-TW": "」台灣華語怎麼說？",
  },
  // --- 場所の思い出し・共通 ---
  // 通知とカードの本文。**意味(訳)は入れない** — 通知そのものが
  // 「覚えてる?」という問いなので、答えを並べたら問いにならない。
  // 思い出す鍵は市の名前ではなく**いつ撮ったか**なので、日付を先に出し、
  // 日付が読めないときだけ場所の名前に落ちる。
  // 「ここ」ではなく**地名**で言う(オーナー指摘)。地名が取れない回だけ
  // 日付だけに落ちる。
  "place.caughtOnAt": {
    ja: "{date}に{name}で撮った言葉",
    en: "You caught this at {name} on {date}",
    "zh-TW": "{date} 在 {name} 拍到的字",
  },
  "place.caughtOn": {
    ja: "{date}に撮った言葉",
    en: "You caught this on {date}",
    "zh-TW": "{date} 拍到的字",
  },
  "place.caughtAt": {
    ja: "{name}で撮った言葉",
    en: "You caught this at {name}",
    "zh-TW": "在 {name} 拍到的字",
  },
  "place.caughtHereShort": {
    ja: "この辺りで撮った言葉",
    en: "You caught this around here",
    "zh-TW": "在這附近拍到的字",
  },
  "common.card": { ja: "カード", en: "Card", "zh-TW": "字卡" },
  "common.closeEdit": { ja: "編集を閉じる", en: "Close editing", "zh-TW": "關閉編輯" },
  "common.photoOf": {
    ja: "「{word}」の写真",
    en: 'Photo of "{word}"',
    "zh-TW": "「{word}」的照片",
  },
  "common.playWord": { ja: "「{word}」を聞く", en: 'Listen to "{word}"', "zh-TW": "聽「{word}」" },
  "common.imageOf": {
    ja: "「{word}」の画像",
    en: 'Image for "{word}"',
    "zh-TW": "「{word}」的圖片",
  },
  "common.stickerOf": {
    ja: "「{word}」のステッカー",
    en: 'Sticker for "{word}"',
    "zh-TW": "「{word}」的貼紙",
  },
  "common.memoryOf": {
    ja: "「{word}」の思い出",
    en: 'Memory of "{word}"',
    "zh-TW": "「{word}」的回憶",
  },
  "common.mapTitle": {
    ja: "撮影場所のマップ",
    en: "Map of where it was taken",
    "zh-TW": "拍攝地點的地圖",
  },
  "common.shotHere": { ja: "撮影地", en: "Where it was taken", "zh-TW": "拍攝地" },
  "common.selfieOf": {
    ja: "撮影者の自撮り",
    en: "Selfie of the person who caught it",
    "zh-TW": "拍攝者的自拍",
  },
  "detail.more": { ja: "詳しく", en: "details", "zh-TW": "看詳細" },
  "detail.preparing": {
    ja: "詳しい解説を準備中…",
    en: "Preparing the full explanation…",
    "zh-TW": "正在準備詳細解說…",
  },
  // 出所は**人の言葉で**。以前は「✓ 検証済み辞書 + AI詳細 · 点 0.92」で、
  // 0.92 はモデルの confidence(内部の数値)がそのまま漏れていた。
  // 学習者にとって意味が無く、「点」が何の点かも示していない(独立監査)。
  "detail.verified": {
    ja: "辞書で確認済み",
    en: "Checked against the dictionary",
    "zh-TW": "已用辭典確認",
  },
  "detail.aiOnly": {
    ja: "AIが作成（誤りがあるかもしれません）",
    en: "Written by AI — may contain mistakes",
    "zh-TW": "AI 產生（可能有錯）",
  },
  "err.generateFailed": { ja: "生成に失敗しました", en: "Could not generate", "zh-TW": "產生失敗" },
  // --- ワードツリー・画像選択 ---
  "tree.title": { ja: "ワードツリー", en: "Word tree", "zh-TW": "單字樹" },
  "tree.branches": {
    ja: "枝 {done}/{total} 本 · 復習ごとに1本育つ",
    en: "{done} of {total} branches · one grows per review",
    "zh-TW": "樹枝 {done}/{total} 根 · 每複習一次長一根",
  },
  "tree.locked": {
    ja: "あと{n}本 · 復習で解禁",
    en: "{n} more · unlocked by reviewing",
    "zh-TW": "還差 {n} 根 · 複習就解鎖",
  },
  "tree.tapHint": {
    ja: "枝をタップすると、その言葉を新しい木としてキャッチできます",
    en: "Tap a branch to catch that word as a new tree",
    "zh-TW": "點樹枝，就能把那個字當成新的樹來捕捉",
  },
  "tree.collocation": { ja: "つながり", en: "Goes with", "zh-TW": "搭配" },
  "tree.example": { ja: "例文", en: "Example", "zh-TW": "例句" },
  "tree.synonym": { ja: "類義", en: "Similar", "zh-TW": "近義" },
  "tree.antonym": { ja: "反義", en: "Opposite", "zh-TW": "反義" },
  "img.searchFor": {
    ja: "「{q}」の画像を探す",
    en: 'Find images for "{q}"',
    "zh-TW": "搜尋「{q}」的圖片",
  },
  "img.ownPhoto": { ja: "自分の写真", en: "My photo", "zh-TW": "自己的照片" },
  "img.notFound": {
    ja: "画像が見つかりませんでした。別のキーワードで試すか、自分の写真をアップロードしてください。",
    en: "No images found. Try another keyword, or upload your own photo.",
    "zh-TW": "找不到圖片。換個關鍵字試試，或上傳自己的照片。",
  },
  "img.candidate": { ja: "候補", en: "Candidate", "zh-TW": "候選" },
  // --- 忘却曲線 ---
  "curve.empty": {
    ja: "まだ復習データがありません。復習すると忘却曲線がここに表示されます。",
    en: "No review data yet. Review this word and its forgetting curve will appear here.",
    "zh-TW": "還沒有複習資料。複習之後，遺忘曲線就會顯示在這裡。",
  },
  "curve.nowPct": { ja: "今 {pct}%", en: "now {pct}%", "zh-TW": "現在 {pct}%" },
  "curve.retention": { ja: "記憶率", en: "Retention", "zh-TW": "記憶率" },
  "curve.days": { ja: "{n}日", en: "day {n}", "zh-TW": "{n} 天" },
  "curve.youAreHere": { ja: "今ココ", en: "You are here", "zh-TW": "你在這裡" },
  // --- bottom nav ---
  "nav.home": { ja: "ホーム", en: "Home", "zh-TW": "首頁" },
  "nav.dex": { ja: "図鑑", en: "Dex", "zh-TW": "圖鑑" },
  "nav.camera": { ja: "カメラ", en: "Camera", "zh-TW": "相機" },
  "nav.review": { ja: "復習", en: "Review", "zh-TW": "複習" },
  "nav.settings": { ja: "設定", en: "Settings", "zh-TW": "設定" },
  // --- page titles ---
  "title.home": { ja: "ホーム", en: "Home", "zh-TW": "首頁" },
  "title.dex": { ja: "図鑑", en: "Dex", "zh-TW": "圖鑑" },
  "title.review": { ja: "復習", en: "Review", "zh-TW": "複習" },
  "title.settings": { ja: "設定", en: "Settings", "zh-TW": "設定" },
  "title.capture": { ja: "集める", en: "Catch", "zh-TW": "收集" },
  // --- review ---
  "review.today": { ja: "きょうの復習", en: "Today's review", "zh-TW": "今天的複習" },
  "review.auto": { ja: "🎯 AIが選ぶ", en: "🎯 AI picks", "zh-TW": "🎯 AI 幫你選" },
  "review.speak": { ja: "🎤 話す", en: "🎤 Speak", "zh-TW": "🎤 開口說" },
  "review.choice": { ja: "👆 4択", en: "👆 Quiz", "zh-TW": "👆 四選一" },
  // --- dex ---
  "dex.yours": { ja: "あなたの図鑑", en: "Your dex", "zh-TW": "你的圖鑑" },
  "dex.found": { ja: "見つけた", en: "Found", "zh-TW": "找到了" },
  "dex.caught": { ja: "捕まえた", en: "Caught", "zh-TW": "捕捉到了" },
  "dex.search": {
    ja: "単語・読み・意味で検索",
    en: "Search word / reading / meaning",
    "zh-TW": "用單字・讀音・意思搜尋",
  },
  "dex.category": { ja: "カテゴリ", en: "Category", "zh-TW": "分類" },
  "dex.pos": { ja: "品詞", en: "Part of speech", "zh-TW": "詞性" },
  // --- settings ---
  "settings.profile": { ja: "プロフィール", en: "Profile", "zh-TW": "個人檔案" },
  "settings.displayName": { ja: "表示名", en: "Display name", "zh-TW": "顯示名稱" },
  "settings.language": { ja: "言語", en: "Language", "zh-TW": "語言" },
  "settings.targetLang": { ja: "学習言語", en: "Target language", "zh-TW": "學習語言" },
  "settings.levelGoal": { ja: "目標レベル", en: "Target level", "zh-TW": "目標等級" },
  "settings.currentLevel": { ja: "今のレベル", en: "Current level", "zh-TW": "目前等級" },
  "settings.levelHint": {
    ja: "単語の解説・例文・復習の語彙は「今のレベル〜目標レベル」に合わせて作られます。",
    en: "Explanations, examples and review vocabulary are generated within your current-to-target level range.",
    "zh-TW": "單字的解說、例句和複習的詞彙，都會配合「目前等級〜目標等級」來製作。",
  },
  "settings.nativeLang": { ja: "母語", en: "Native language", "zh-TW": "母語" },
  "settings.uiLang": { ja: "表示言語", en: "App language", "zh-TW": "顯示語言" },
  "settings.phonetic": { ja: "発音表記", en: "Phonetic notation", "zh-TW": "發音標記" },
  "settings.study": { ja: "学習設定", en: "Study settings", "zh-TW": "學習設定" },
  // 見え方は3つ。名前 + 一言で、何が変わるかを開く前に言う。
  "settings.feel": { ja: "音と手ざわり", en: "Sound & haptics", "zh-TW": "聲音與觸感" },
  "settings.soundLevel": { ja: "効果音", en: "Sound effects", "zh-TW": "音效" },
  "settings.soundOff": { ja: "オフ", en: "Off", "zh-TW": "關閉" },
  "settings.soundSubtle": { ja: "控えめ", en: "Subtle", "zh-TW": "輕微" },
  "settings.soundFull": { ja: "しっかり", en: "Full", "zh-TW": "完整" },
  "settings.haptics": { ja: "振動", en: "Haptics", "zh-TW": "震動" },
  "settings.hapticsHint": {
    ja: "キャッチや着地に合わせて短く震えます。",
    en: "A short buzz when a word lands in the dex.",
    "zh-TW": "捕捉和降落時會短震一下。",
  },
  "settings.feelInstantHint": {
    ja: "選ぶとすぐ保存されます（下の「保存」は不要）。",
    en: "Saved the moment you pick — no need to press Save.",
    "zh-TW": "選好就會立刻儲存（不需要按下面的「儲存」）。",
  },
  "settings.appearance": { ja: "外観", en: "Appearance", "zh-TW": "外觀" },
  "settings.theme": { ja: "テーマ", en: "Theme", "zh-TW": "主題" },
  "settings.save": { ja: "保存", en: "Save", "zh-TW": "儲存" },
  "settings.saving": { ja: "保存中…", en: "Saving...", "zh-TW": "儲存中…" },
  "settings.saved": { ja: "保存しました", en: "Saved", "zh-TW": "已儲存" },
  "settings.signout": { ja: "サインアウト", en: "Sign out", "zh-TW": "登出" },
  // --- capture ---
  "capture.photoTitle": { ja: "写真で集める", en: "Catch with a photo", "zh-TW": "用照片收集" },
  "capture.photoHint": {
    ja: "街で見つけたモノにカメラを向けてみてください。",
    en: "Point your camera at something you found.",
    "zh-TW": "把相機對準在街上發現的東西看看。",
  },
  "capture.tapToShoot": { ja: "タップして撮影", en: "Tap to shoot", "zh-TW": "點一下拍照" },
  "capture.typeWord": {
    ja: "単語を文字で入力",
    en: "Type a word instead",
    "zh-TW": "用文字輸入單字",
  },
  "capture.openScan": {
    ja: "かざして調べる（スキャン）",
    en: "Hold up to look up (scan)",
    "zh-TW": "舉起來查（掃描）",
  },
  "capture.or": { ja: "または", en: "or", "zh-TW": "或" },
  // --- scan ---
  "scan.button": { ja: "スキャン", en: "Scan", "zh-TW": "掃描" },
  "scan.again": { ja: "もう一度", en: "Retake", "zh-TW": "再一次" },
  "scan.rescan": { ja: "再スキャン", en: "Scan again", "zh-TW": "重新掃描" },
  "scan.found": { ja: "見つかった単語", en: "Words found", "zh-TW": "找到的單字" },
  "scan.searchPlaceholder": {
    ja: "候補に無い？日本語で調べる（例: マンゴー）",
    en: "Not listed? Search in your language (e.g. mango)",
    "zh-TW": "候選裡沒有？用中文查（例：芒果）",
  },
  "scan.searchGo": { ja: "調べる", en: "Search", "zh-TW": "查詢" },
  "scan.voiceLabel": {
    ja: "聞こえた言葉を声で調べる",
    en: "Search by voice",
    "zh-TW": "用說的查聽到的字",
  },
  "scan.owned": { ja: "取得済み", en: "Collected", "zh-TW": "已收集" },
  "scan.reunion": { ja: "未撮影", en: "No photo yet", "zh-TW": "還沒拍過" },
  "scan.catch": { ja: "キャッチ", en: "Catch", "zh-TW": "捕捉" },
  "scan.analyzing": { ja: "AIが分析中…", en: "AI is analyzing…", "zh-TW": "AI 分析中…" },
  "scan.zoom": { ja: "ズーム", en: "Zoom", "zh-TW": "縮放" },
  "scan.flipCamera": {
    ja: "カメラを前後で切り替える",
    en: "Switch front / back camera",
    "zh-TW": "切換前後鏡頭",
  },
  "scan.listening": { ja: "聞き取り中…", en: "Listening…", "zh-TW": "聆聽中…" },
  "scan.speakNow": { ja: "話しかけてください", en: "Speak now", "zh-TW": "請開始說話" },
  // --- review extras ---
  "review.modeSaveFailed": {
    ja: "出題形式の変更を保存できませんでした。通信を確かめてもう一度お試しください。",
    en: "Couldn't save the review mode. Check your connection and try again.",
    "zh-TW": "無法儲存出題形式的變更。請確認網路後再試一次。",
  },
  // 端末では効いているが、他の端末へ持っていく控えが取れなかったとき。
  // **失敗ではないので赤くしない。**
  "review.modeLocalOnly": {
    ja: "この端末では変わりました。ほかの端末には引き継がれません。",
    en: "Changed on this device. It won't carry to your other devices.",
    "zh-TW": "這台裝置上已經改好了，但不會同步到其他裝置。",
  },
  "review.cappedTitle": {
    ja: "今日の分は終わりです",
    en: "That's today's batch",
    "zh-TW": "今天的份結束了",
  },
  "review.cappedHint": {
    ja: "1日 {n} 枚に設定しています。まだ復習したい語は残っていますが、明日また出します。もっとやりたいときは設定で枚数を増やせます。",
    en: "You've set a limit of {n} a day. There are more waiting — they'll come back tomorrow. Raise the limit in Settings if you want more now.",
    "zh-TW":
      "你設定成一天 {n} 張。還有想複習的字，但明天會再出。想多做一點的話，可以在設定裡調高張數。",
  },
  "review.cappedCta": { ja: "設定で枚数を変える", en: "Change the limit", "zh-TW": "到設定改張數" },
  // 10枚の束を出し切っただけのとき。**「今日は終わり」と言ってはいけない** —
  // 上限を無制限にした人にも10枚ごとに出て、設定が効いていないように見えていた。
  "review.moreTitle": {
    ja: "ここまでの分、終わりました",
    en: "That's this batch",
    "zh-TW": "這一輪先到這裡",
  },
  "review.moreHint": {
    ja: "期限が来ている語があと {n} 語あります。続けられます。",
    en: "{n} more are due. You can keep going.",
    "zh-TW": "還有 {n} 個字到複習時間了，可以繼續。",
  },
  "review.moreCta": { ja: "続ける", en: "Keep going", "zh-TW": "繼續" },
  "review.empty": {
    ja: "今日復習する単語はありません。",
    en: "Nothing to review today.",
    "zh-TW": "今天沒有要複習的單字。",
  },
  "review.emptyHint": {
    ja: "新しい単語をキャッチすると、10分後に最初の復習が出ます。",
    en: "Catch a new word and its first review appears 10 minutes later.",
    "zh-TW": "捕捉到新單字後，10 分鐘後會出現第一次複習。",
  },
  "review.goCatch": { ja: "撮りに行く", en: "Go catch one", "zh-TW": "去拍" },
  // 「ノルマ」は課された量という含意が強く、達成を祝う語ではない(独立監査)。
  "review.doneTitle": {
    ja: "今日の復習、終わりました",
    en: "Today's review is done",
    "zh-TW": "今天的複習結束了",
  },
  "review.doneScore": {
    ja: "{n}問中{c}問が正解",
    en: "{c} of {n} correct",
    "zh-TW": "{n} 題中答對 {c} 題",
  },
  "review.doneHint": {
    ja: "また明日の復習で会いましょう。",
    en: "See you in tomorrow's review.",
    "zh-TW": "明天複習時再見。",
  },
  "review.again": { ja: "もう少し続ける", en: "Keep going", "zh-TW": "再多做一點" },
  "review.toDex": { ja: "図鑑を見る", en: "Open the shelf", "zh-TW": "看圖鑑" },
  "review.quizTag": { ja: "4択クイズ", en: "Multiple choice", "zh-TW": "四選一測驗" },
  "review.whichIs": { ja: "はどれ？", en: "— which one?", "zh-TW": "是哪一個？" },
  "review.correct": { ja: "正解！", en: "Correct!", "zh-TW": "答對了！" },
  "review.tryAgain": { ja: "もう一度覚えよう", en: "Let's learn it again", "zh-TW": "再記一次吧" },
  "review.next": { ja: "次へ", en: "Next", "zh-TW": "下一題" },
  "review.speakTag": { ja: "はなす", en: "Speak", "zh-TW": "開口說" },
  "review.roleplayTag": { ja: "ロールプレイ", en: "Role-play", "zh-TW": "角色扮演" },
  "review.hint": { ja: "ヒント", en: "Hint", "zh-TW": "提示" },
  "review.hintUsed": { ja: "ヒント使用", en: "Hint used", "zh-TW": "用了提示" },
  "review.skip": { ja: "スキップ", en: "Skip", "zh-TW": "跳過" },
  "review.submit": { ja: "送信してフィードバック", en: "Get feedback", "zh-TW": "送出並取得回饋" },
  "review.grading": { ja: "AIが添削中…", en: "AI is reviewing…", "zh-TW": "AI 批改中…" },
  // --- memory ---
  "memory.level0": { ja: "忘れかけ", en: "Fading", "zh-TW": "快忘了" },
  "memory.level1": { ja: "あやうい", en: "Shaky", "zh-TW": "有點危險" },
  "memory.level2": { ja: "うろ覚え", en: "Fuzzy", "zh-TW": "記得模糊" },
  "memory.level3": { ja: "定着中", en: "Settling", "zh-TW": "正在扎根" },
  "memory.level4": { ja: "覚えた", en: "Learned", "zh-TW": "記住了" },
  "memory.level5": { ja: "長期記憶", en: "Long-term", "zh-TW": "長期記憶" },
  "memory.bestReview": { ja: "ベスト復習", en: "Best review", "zh-TW": "最佳複習時機" },
  "memory.forgetIn": { ja: "50%を切る", en: "Drops below 50%", "zh-TW": "掉到 50% 以下" },
  "memory.nextDue": { ja: "次の出題", en: "Next due", "zh-TW": "下次出題" },
  "memory.reviews": { ja: "復習", en: "Reviews", "zh-TW": "複習" },
  "memory.times": { ja: "回", en: "×", "zh-TW": "次" },
  "memory.today": { ja: "今日", en: "Today", "zh-TW": "今天" },
  "memory.daysLater": { ja: "日後", en: "d later", "zh-TW": "天後" },
  // --- word card sections ---
  "card.meaning": { ja: "意味", en: "Meaning", "zh-TW": "意思" },
  "card.web_images": { ja: "ネットの画像", en: "Images from the web", "zh-TW": "網路上的圖片" },
  "card.usage_context": {
    ja: "頻度・使う場面",
    en: "Frequency & where it's used",
    "zh-TW": "頻率・使用場合",
  },
  "card.example": { ja: "例文", en: "Example", "zh-TW": "例句" },
  "card.examples_extra": { ja: "追加の例文", en: "More examples", "zh-TW": "更多例句" },
  "card.usage_chunks": { ja: "使い方チャンク", en: "Usage chunks", "zh-TW": "用法組塊" },
  "card.measure_words": { ja: "量詞", en: "Measure words", "zh-TW": "量詞" },
  "card.related_words": {
    ja: "にてる言葉・関連語",
    en: "Similar & related words",
    "zh-TW": "相似的字・相關詞",
  },
  "card.fillCta": { ja: "カードを仕上げる", en: "Finish this card", "zh-TW": "把字卡補完" },
  "card.filling": { ja: "作っています…", en: "Writing it…", "zh-TW": "製作中…" },
  "card.fillFailed": {
    ja: "うまく作れませんでした。通信を確かめて、もう一度お試しください。",
    en: "Couldn't write it. Check your connection and try again.",
    "zh-TW": "沒有順利做出來。請確認網路後再試一次。",
  },
  "card.fillRetry": { ja: "もう一度ためす", en: "Try again", "zh-TW": "再試一次" },
  "card.pronunciation_tips": { ja: "発音のコツ", en: "Pronunciation tips", "zh-TW": "發音訣竅" },
  "card.etymology": { ja: "語源・部首", en: "Origin & radicals", "zh-TW": "字源・部首" },
  "card.mnemonic": { ja: "覚え方", en: "Memory hook", "zh-TW": "記憶方法" },
  "card.taiwan_note": { ja: "台湾メモ", en: "Taiwan note", "zh-TW": "台灣筆記" },
  "card.real_usage": { ja: "実際の使われ方", en: "Seen in the wild", "zh-TW": "實際上怎麼用" },
  // --- 英語のカードだけの節 ------------------------------------------------
  // 台湾華語のカードには出ない。**それでも3言語ぶん訳す** — 英語を学ぶ
  // 台湾の人はアプリを繁體中文で使うので、節の名前が日本語で出たら
  // その人の画面が壊れている。
  "card.forms": { ja: "活用", en: "Word forms", "zh-TW": "詞形變化" },
  "card.countability": { ja: "数え方と冠詞", en: "Countability", "zh-TW": "可數與冠詞" },
  "card.stress": { ja: "強く読む所", en: "Stress", "zh-TW": "重音" },
  "card.phrasal_verbs": { ja: "句動詞", en: "Phrasal verbs", "zh-TW": "片語動詞" },
  "card.culture_note": { ja: "文化の一言", en: "Culture note", "zh-TW": "文化筆記" },
  // 活用の名前。**表の左の列**に出る短い名前で、文にしない。
  "card.formPlural": { ja: "複数形", en: "Plural", "zh-TW": "複數" },
  "card.formPast": { ja: "過去形", en: "Past", "zh-TW": "過去式" },
  "card.formPastParticiple": { ja: "過去分詞", en: "Past participle", "zh-TW": "過去分詞" },
  "card.formIng": { ja: "-ing 形", en: "-ing form", "zh-TW": "-ing 形" },
  "card.formThird": { ja: "三単現", en: "3rd person", "zh-TW": "第三人稱單數" },
  "card.formComparative": { ja: "比較級", en: "Comparative", "zh-TW": "比較級" },
  "card.formSuperlative": { ja: "最上級", en: "Superlative", "zh-TW": "最高級" },
  // 数え方。
  "card.countable": { ja: "数えられる", en: "Countable", "zh-TW": "可數" },
  "card.uncountable": { ja: "数えられない", en: "Uncountable", "zh-TW": "不可數" },
  "card.countBoth": { ja: "どちらもある", en: "Both", "zh-TW": "兩者皆可" },
  "card.article": { ja: "冠詞", en: "Article", "zh-TW": "冠詞" },
  "card.sections": {
    ja: "表示する項目と順番",
    en: "Sections & order",
    "zh-TW": "要顯示的項目與順序",
  },
  "card.regen": {
    ja: "この項目をAIで作り直す(Pro)",
    en: "Regenerate this section (Pro)",
    "zh-TW": "用 AI 重做這個項目（Pro）",
  },
  // 口語⇄書面のメーター。**色だけに頼らない**ので、5段それぞれに言葉を置く。
  "card.register": {
    ja: "話し言葉か書き言葉か",
    en: "Spoken or written",
    "zh-TW": "是口語還是書面語",
  },
  "card.regSpoken": { ja: "話し言葉", en: "Spoken", "zh-TW": "口語" },
  "card.regSpokenish": { ja: "やや話し言葉", en: "Leans spoken", "zh-TW": "偏口語" },
  "card.regNeutral": { ja: "どちらでも", en: "Either", "zh-TW": "都可以" },
  "card.regWrittenish": { ja: "やや書き言葉", en: "Leans written", "zh-TW": "偏書面語" },
  "card.regWritten": { ja: "書き言葉", en: "Written", "zh-TW": "書面語" },
  // 「今週出会う見込み」とレア度。**数字と出所は必ず同じ画面に居させる。**
  "card.encounter": { ja: "出会う見込み", en: "Chance of meeting it", "zh-TW": "遇到的可能性" },
  "enc.thisWeek": {
    ja: "今週この言葉に出会う見込み",
    en: "Chance you meet it this week",
    "zh-TW": "這週遇到這個字的可能性",
  },
  "enc.where": { ja: "よく出会う所", en: "Where", "zh-TW": "常常遇到的地方" },
  "enc.onlyIn": { ja: "{place}限定", en: "{place} only", "zh-TW": "只有 {place} 才有" },
  "enc.season": { ja: "{months}ごろ", en: "Around {months}", "zh-TW": "{months} 前後" },
  "enc.rarityAria": {
    ja: "レア度 5段階中{n}",
    en: "Rarity {n} of 5",
    "zh-TW": "稀有度 5 級中的第 {n} 級",
  },
  "enc.rarity1": { ja: "どこにでもある", en: "Everywhere", "zh-TW": "到處都有" },
  "enc.rarity2": { ja: "よく見かける", en: "Common", "zh-TW": "很常看到" },
  "enc.rarity3": { ja: "ときどき", en: "Sometimes", "zh-TW": "偶爾" },
  "enc.rarity4": { ja: "めずらしい", en: "Uncommon", "zh-TW": "少見" },
  "enc.rarity5": { ja: "めったに会えない", en: "Rare", "zh-TW": "難得一見" },
  // 出所。**推定を実測の顔で出さない。**
  "enc.srcEstimate": {
    ja: "推定 — 級と言葉の頻度から見積もった数です",
    en: "Estimate — from level and word frequency",
    "zh-TW": "推估 — 由等級和字的頻率估算出來的數字",
  },
  "enc.srcBlended": {
    ja: "推定と実測を混ぜた数です",
    en: "Estimate blended with real observations",
    "zh-TW": "推估和實測混合後的數字",
  },
  "enc.srcMeasured": {
    ja: "実際に撮られた記録から出した数です",
    en: "From real catches",
    "zh-TW": "由實際拍攝紀錄算出來的數字",
  },
  "enc.srcMeasuredN": {
    ja: "実測 — {n}人が実際に撮っています",
    en: "Measured — {n} people have caught it",
    "zh-TW": "實測 — 有 {n} 人實際拍過",
  },
  "card.encounterLabels": {
    ja: "出会いやすい所",
    en: "Where you'll meet it",
    "zh-TW": "容易遇到的地方",
  },
  "card.encKind.place": { ja: "場所", en: "Place", "zh-TW": "地點" },
  "card.encKind.media": { ja: "媒体", en: "Media", "zh-TW": "媒介" },
  "card.encKind.situation": { ja: "状況", en: "Situation", "zh-TW": "情境" },
  "card.encKind.emotion": { ja: "気持ち", en: "Feeling", "zh-TW": "心情" },
  "card.encKind.time": { ja: "時刻", en: "Time", "zh-TW": "時間" },
  "card.encKind.season": { ja: "季節", en: "Season", "zh-TW": "季節" },
  "card.frequency": { ja: "頻度", en: "Frequency", "zh-TW": "頻率" },
  "card.synonym": { ja: "類義", en: "Similar", "zh-TW": "近義" },
  "card.antonym": { ja: "反義", en: "Opposite", "zh-TW": "反義" },
  "card.relatedTag": { ja: "関連", en: "Related", "zh-TW": "相關" },
  "card.radicals": { ja: "部首", en: "Radicals", "zh-TW": "部首" },
  "card.noImages": {
    ja: "画像が見つかりませんでした。",
    en: "No images found.",
    "zh-TW": "找不到圖片。",
  },
  "card.searchGoogle": {
    ja: "Google画像検索で見る",
    en: "See on Google Images",
    "zh-TW": "用 Google 圖片搜尋看看",
  },
  "card.delete": { ja: "削除", en: "Delete", "zh-TW": "刪除" },
  "card.deleteConfirm": {
    ja: "もう一度タップで削除",
    en: "Tap again to delete",
    "zh-TW": "再點一次就刪除",
  },
  "card.changePhoto": { ja: "写真を変更", en: "Change photo", "zh-TW": "更換照片" },
  "card.report": { ja: "報告", en: "Report", "zh-TW": "回報" },
  "card.reportWhat": { ja: "どこが違う？", en: "What's wrong?", "zh-TW": "哪裡不對？" },
  "card.reportThanks": {
    ja: "🙏 報告ありがとうございます",
    en: "🙏 Thanks for reporting",
    "zh-TW": "🙏 謝謝你的回報",
  },
  "card.regenAll": {
    ja: "✨ 解説を再生成",
    en: "✨ Regenerate details",
    "zh-TW": "✨ 重新產生解說",
  },
  "card.regenPro": {
    ja: "解説の再生成は Pro 限定",
    en: "Regenerating details is Pro-only",
    "zh-TW": "重新產生解說是 Pro 限定",
  },
  "card.preparing": {
    ja: "詳しい解説をAIが準備中…",
    en: "AI is preparing the details…",
    "zh-TW": "AI 正在準備詳細解說…",
  },
  "card.enrichFailed": {
    ja: "詳しい解説を作れませんでした",
    en: "Couldn't generate the details",
    "zh-TW": "無法產生詳細解說",
  },
  "card.enrichRetry": { ja: "もう一度ためす", en: "Try again", "zh-TW": "再試一次" },
  // --- home ---
  "home.emptyTitle": {
    ja: "きょうのページはまだ白紙です。",
    en: "Today's page is still blank.",
    "zh-TW": "今天的頁面還是一片空白。",
  },
  "home.emptyHint": {
    ja: "街の看板やメニューにカメラをかざすと、最初の一枚がここに貼られます。",
    en: "Point your camera at a sign or menu and your first photo lands here.",
    "zh-TW": "把相機對準街上的招牌或菜單，第一張就會貼在這裡。",
  },
  "home.emptyCta": { ja: "街でひとつ見つける", en: "Find one outside", "zh-TW": "去街上找一個" },
  "home.journal": { ja: "今日の日記を書く", en: "Write today's journal", "zh-TW": "寫今天的日記" },
  // 見開きの右ページ(ホームでその場で書く)。
  "home.writeToday": {
    ja: "今日の日記を書く",
    en: "Write today's journal",
    "zh-TW": "寫今天的日記",
  },
  "home.pastJournals": { ja: "これまでの日記", en: "Past journals", "zh-TW": "以前的日記" },
  // これまでのページの束ね方(src/lib/album-span.ts)。
  "home.spanAria": { ja: "ページの束ね方", en: "How pages are grouped", "zh-TW": "頁面的彙整方式" },
  "home.span.day": { ja: "日", en: "Day", "zh-TW": "日" },
  "home.span.week": { ja: "週", en: "Week", "zh-TW": "週" },
  "home.span.month": { ja: "月", en: "Month", "zh-TW": "月" },
  "home.spanCount": { ja: "{n}枚", en: "{n} photos", "zh-TW": "{n} 張" },
  // 日本語の画面に英語の飾り文字を置かない(日付の見出しと同じ理由)。
  "home.dayJournal": { ja: "この日の日記", en: "That day's diary", "zh-TW": "這天的日記" },
  "home.dayJournalUsed": { ja: "使った言葉", en: "Words used", "zh-TW": "用到的字" },
  "home.pastPages": { ja: "これまでのページ", en: "Past Pages", "zh-TW": "以前的頁面" },
  "home.memories": { ja: "枚の思い出", en: "memories caught", "zh-TW": "張回憶" },
  "home.noPhotoYet": { ja: "写真はまだありません", en: "No photo yet", "zh-TW": "還沒有照片" },
  "home.background": { ja: "背景", en: "Background", "zh-TW": "背景" },
  // --- common ---
  "common.close": { ja: "閉じる", en: "Close", "zh-TW": "關閉" },
  // ヘッダーのアイコンを押すと出る、自分の記録。
  "me.open": { ja: "自分の記録を見る", en: "See your record", "zh-TW": "看自己的紀錄" },
  "me.you": { ja: "あなた", en: "You", "zh-TW": "你" },
  // **撮った連続と復習した連続は別の数。** 片方だけ「続いている」と書くと
  // どちらのことか分からない(要望の「連続何日」は復習のほう)。
  "me.captureStreak": {
    ja: "撮った日が続いている",
    en: "Capture streak",
    "zh-TW": "連續拍照的天數",
  },
  "me.reviewStreak": {
    ja: "復習した日が続いている",
    en: "Review streak",
    "zh-TW": "連續複習的天數",
  },
  "me.days": { ja: "{n}日", en: "{n} days", "zh-TW": "{n} 天" },
  "me.captured": { ja: "集めた言葉", en: "Words caught", "zh-TW": "收集到的字" },
  "me.level": { ja: "レベル", en: "Level", "zh-TW": "等級" },
  // **やった数と待っている数を混ぜない。** 「今日の復習」で待っている数を
  // 出していたので、やった数と読めてしまっていた。
  "me.doneToday": { ja: "今日やった復習", en: "Reviewed today", "zh-TW": "今天做的複習" },
  "me.due": { ja: "待っている復習", en: "Waiting", "zh-TW": "等著複習的" },
  "common.loading": { ja: "読み込み中", en: "Loading", "zh-TW": "載入中" },
  // 待ちの演出の3段。**どの版でも同じ言葉を使う** — 版ごとに直書きしていた
  // せいで、英語にしても日本語のままの版が7つ残っていた(オーナー指摘 2026-08-20)。
  "scan.stageSensing": {
    ja: "シーンを感知しています",
    en: "Sensing the scene…",
    "zh-TW": "正在感測場景",
  },
  "scan.stageReading": {
    ja: "対象を解析しています",
    en: "Reading the object…",
    "zh-TW": "正在解析對象",
  },
  "scan.stageMatching": {
    ja: "辞書と照合しています",
    en: "Matching the dictionary…",
    "zh-TW": "正在跟辭典比對",
  },
  // 結晶の版だけは言葉づかいが違う(そういう演出として作ってある)。
  "scan.crystalSensing": {
    ja: "銀の露をひろげています",
    en: "Spreading silver dew…",
    "zh-TW": "銀色的露珠正在散開",
  },
  "scan.crystalReading": {
    ja: "世界を読んでいます",
    en: "Reading the world…",
    "zh-TW": "正在閱讀這個世界",
  },
  "scan.crystalMatching": {
    ja: "言葉が結晶化します",
    en: "Words are crystallizing…",
    "zh-TW": "文字要結晶了",
  },
  // 全画面の版は短い言い切り。
  "scan.fullSensing": { ja: "空間を捉える", en: "Catching the space", "zh-TW": "捕捉空間" },
  "scan.fullReading": {
    ja: "文字と物を読む",
    en: "Reading words and things",
    "zh-TW": "讀取文字與物體",
  },
  "scan.fullMatching": {
    ja: "台湾華語と照合",
    en: "Matching Taiwanese Mandarin",
    "zh-TW": "與台灣華語比對",
  },
  "scan.cuttingOut": { ja: "AIが切り抜き中…", en: "AI is cutting it out…", "zh-TW": "AI 去背中…" },
  "scan.justAMoment": { ja: "少しだけ待ってね", en: "Just a moment", "zh-TW": "再等一下下喔" },
  "common.cancel": { ja: "キャンセル", en: "Cancel", "zh-TW": "取消" },
  "common.retry": { ja: "もう一度", en: "Retry", "zh-TW": "再一次" },
  // --- word card (extra) ---
  "card.notYet": { ja: "まだ作られていません", en: "Not generated yet", "zh-TW": "還沒有做出來" },
  "card.generate": { ja: "作る", en: "Generate", "zh-TW": "產生" },
  "card.flipToSelfie": {
    ja: "タップで自撮りへ",
    en: "Tap to flip to selfie",
    "zh-TW": "點一下看自拍",
  },
  "card.flipBack": { ja: "タップで戻る", en: "Tap to flip back", "zh-TW": "點一下翻回去" },
  "card.selfie": { ja: "自撮り", en: "Selfie", "zh-TW": "自拍" },
  "card.noSelfie": { ja: "自撮りはまだありません", en: "No selfie yet", "zh-TW": "還沒有自拍" },
  "card.changePhotoConfirm": {
    ja: "この写真を変更しますか？",
    en: "Change this photo?",
    "zh-TW": "要更換這張照片嗎？",
  },
  "card.replacePhotoConfirm": {
    ja: "いまの写真を、この画像に差し替えますか？元には戻せません。",
    en: "Replace the current photo with this image? This can't be undone.",
    "zh-TW": "要把現在的照片換成這張圖片嗎？換了就回不去了。",
  },
  "card.deleteConfirmDialog": {
    ja: "本当に削除しますか？この操作は取り消せません。",
    en: "Delete this card? This cannot be undone.",
    "zh-TW": "確定要刪除嗎？這個動作無法復原。",
  },
  "card.deleteFailed": {
    ja: "削除に失敗しました。",
    en: "Could not delete.",
    "zh-TW": "刪除失敗。",
  },
  "card.photoFailed": {
    ja: "画像の変更に失敗しました。",
    en: "Could not change the photo.",
    "zh-TW": "更換圖片失敗。",
  },
  "card.pickAnotherImage": {
    ja: "この画像が違うときは、別の画像を選べます",
    en: "Not the right picture? Pick another one",
    "zh-TW": "如果這張圖不對，可以選別的",
  },
  "card.findingImage": {
    ja: "🌐 画像をネットから探しています…",
    en: "🌐 Finding an image online…",
    "zh-TW": "🌐 正在從網路上找圖片…",
  },
  "card.regenerating": { ja: "再生成中…", en: "Regenerating…", "zh-TW": "重新產生中…" },
  "card.reportPrompt": {
    ja: "意味や発音が変？報告してAIに直させる",
    en: "Wrong meaning or reading? Report and let AI fix it",
    "zh-TW": "意思或發音怪怪的？回報讓 AI 改",
  },
  "card.reportFixing": { ja: "AIが作り直し中…", en: "AI is rebuilding…", "zh-TW": "AI 重做中…" },
  "card.reportDone": {
    ja: "報告ありがとう。AIが作り直しました",
    en: "Thanks — AI rebuilt this card",
    "zh-TW": "謝謝你的回報，AI 已經重做好了",
  },
  "card.reportFailed": {
    ja: "報告に失敗しました",
    en: "Could not send the report",
    "zh-TW": "回報失敗",
  },
  "card.otherImages": { ja: "別の画像", en: "Other images", "zh-TW": "其他圖片" },
  "card.useThisImage": { ja: "この画像にする", en: "Use this image", "zh-TW": "就用這張" },
  "card.imageSet": { ja: "画像を変更しました", en: "Photo updated", "zh-TW": "已更換圖片" },
  "card.openMap": { ja: "地図で開く", en: "Open in Maps", "zh-TW": "用地圖打開" },
  "card.openGoogleMaps": {
    ja: "Google マップで開く →",
    en: "Open in Google Maps →",
    "zh-TW": "用 Google 地圖打開 →",
  },
  "card.photoSpot": { ja: "撮影地", en: "Where it was caught", "zh-TW": "拍攝地" },
  // --- input catch ---
  "input.title": { ja: "入力キャッチ", en: "Type / speak a word", "zh-TW": "輸入捕捉" },
  "input.lead": {
    ja: "授業で習った・聞こえた・動画で見た言葉を、写真がなくても図鑑に。",
    en: "Add a word you heard in class or saw in a video — no photo needed.",
    "zh-TW": "課堂上學到的、聽到的、影片裡看到的字，就算沒有照片也能收進圖鑑。",
  },
  "input.listening": {
    ja: "聞き取り中… 聞こえたフレーズを自分の声で復唱しよう",
    en: "Listening… repeat the phrase you heard",
    "zh-TW": "聆聽中… 用自己的聲音把聽到的句子唸一次",
  },
  "input.micHint": {
    ja: "マイクで復唱するか、下の欄で認識結果を直せます",
    en: "Speak, or fix the text below",
    "zh-TW": "可以用麥克風跟著唸，或在下面的欄位修正辨識結果",
  },
  "input.textHint": {
    ja: "台湾華語でも日本語でもOK（日本語は自動で台湾華語に変換されます）",
    en: "Type in Mandarin or your own language — we'll convert it",
    "zh-TW": "台灣華語或中文都可以（會自動轉成台灣華語）",
  },
  "input.scene": {
    ja: "シーン: どこで・誰が・何と言った？（任意）",
    en: "Scene: where / who / what was said (optional)",
    "zh-TW": "場景：在哪裡・誰・說了什麼？（選填）",
  },
  "input.lookup": {
    ja: "調べてカードにする",
    en: "Look up & make a card",
    "zh-TW": "查詢並做成字卡",
  },
  "input.looking": {
    ja: "辞書とAIが調べています…",
    en: "Checking the dictionary and AI…",
    "zh-TW": "辭典和 AI 正在查…",
  },
  "input.sceneWord": {
    ja: "どんな場面で見た？（例: トイレに置いてあった）",
    en: "Where did you see it? (e.g. it was in the bathroom)",
    "zh-TW": "在什麼場合看到的？（例：放在廁所裡）",
  },
  "input.chooseTitle": {
    ja: "どれのことですか？",
    en: "Which one do you mean?",
    "zh-TW": "是指哪一個呢？",
  },
  "input.chooseHint": {
    ja: "「{q}」は台湾華語ではいくつかの語に分かれます。",
    en: "\u201c{q}\u201d maps to several different Mandarin words.",
    "zh-TW": "「{q}」在台灣華語裡會分成好幾個字。",
  },
  "input.chooseBack": { ja: "書き直す", en: "Edit what I typed", "zh-TW": "重寫" },
  "input.notTargetLang": {
    ja: "台湾華語の単語が見つかりませんでした。別の言い方で調べてみてください。",
    en: "Couldn't find a Mandarin word for that. Try describing it differently.",
    "zh-TW": "找不到台灣華語的單字。請換個說法查查看。",
  },
  "input.attach": {
    ja: "画像を添付（任意）",
    en: "Attach an image (optional)",
    "zh-TW": "附加圖片（選填）",
  },
  "input.attachChange": {
    ja: "タップで自分の画像に変更",
    en: "Tap to use your own photo",
    "zh-TW": "點一下換成自己的圖片",
  },
  "input.autoImage": {
    ja: "画像はネット検索から自動で入ります。下の候補タップでワンタッチ変更",
    en: "An image is added automatically from the web — tap a thumbnail to swap",
    "zh-TW": "圖片會自動從網路搜尋帶入。點下面的候選就能一鍵更換",
  },
  "input.noImageOk": {
    ja: "画像なしでもOK。あとから詳細画面で選び直せます",
    en: "No image is fine — you can pick one later from the card",
    "zh-TW": "沒有圖片也可以，之後在詳細畫面還能重選。",
  },
  "input.save": { ja: "図鑑に入れる", en: "Add to the dex", "zh-TW": "收進圖鑑" },
  "input.saveHint": {
    ja: "実物に出会ってスキャンすると金色に光り、撮影で図鑑が完成します。",
    en: "Scan the real thing later and this card turns gold.",
    "zh-TW": "遇到實物掃描時會發出金光，拍下來圖鑑就完成了。",
  },
  "input.verified": { ja: "✓ 検証済み", en: "✓ Verified", "zh-TW": "✓ 已驗證" },
  "input.aiGenerated": { ja: "AI生成", en: "AI-generated", "zh-TW": "AI 生成" },
  "input.replies": { ja: "返し方の例", en: "How to reply", "zh-TW": "回話的例子" },
  // --- dex view labels ---
  "dex.gallery": { ja: "ギャラリー表示", en: "Gallery view", "zh-TW": "圖片檢視" },
  "dex.list": { ja: "リスト表示", en: "List view", "zh-TW": "清單檢視" },
  "dex.map": { ja: "地図表示", en: "Map view", "zh-TW": "地圖檢視" },
  "dex.searchAria": { ja: "図鑑を検索", en: "Search the dex", "zh-TW": "搜尋圖鑑" },
  // 図鑑の絞り込み(オーナー指摘 2026-08-21「ボタンを押したら選択肢が
  // 出てきて選べるように」)。ボタンの名前は**選んでいないときに出る名前**。
  // 本棚(オーナー指摘 2026-08-21「リアルな本の本棚を作って、背表紙の
  //  タイトルが見えるように」)。読み上げ用の棚の名前。
  "shelf.books": { ja: "単語帳の本棚", en: "Wordbook shelf", "zh-TW": "單字本的書架" },
  // 一言の自撮り動画(オーナー決定 2026-08-21 = B案)。
  // 見込みの幅(オーナー指摘 2026-08-21「適当すぎる」)。
  // **点だけを信じさせない** — 人が増えれば幅は狭くなる。
  "enc.range": {
    ja: "だいたい {lo}〜{hi}%",
    en: "roughly {lo}–{hi}%",
    "zh-TW": "大約 {lo}〜{hi}%",
  },
  "voice.title": { ja: "一言の動画", en: "Video note", "zh-TW": "一句話影片" },
  "voice.hint": {
    ja: "この語に出会ったときの気持ちを、15秒までの自撮りで残せます。",
    en: "Record up to 15 seconds about how it felt to meet this word.",
    "zh-TW": "可以用最長 15 秒的自拍，留下遇到這個字時的心情。",
  },
  "voice.record": { ja: "一言を撮る", en: "Record a note", "zh-TW": "錄一句話" },
  "voice.retake": { ja: "撮り直す", en: "Record again", "zh-TW": "重錄" },
  "voice.stop": { ja: "止める（あと{n}秒）", en: "Stop ({n}s left)", "zh-TW": "停止（剩 {n} 秒）" },
  "voice.delete": { ja: "この動画を消す", en: "Delete this video", "zh-TW": "刪除這段影片" },
  "voice.confirmDelete": {
    ja: "この一言の動画を消しますか？元に戻せません。",
    en: "Delete this video note? This can't be undone.",
    "zh-TW": "要刪除這段一句話影片嗎？無法復原。",
  },
  "voice.saved": { ja: "一言を残しました", en: "Video note saved", "zh-TW": "已留下一句話" },
  "voice.saveFailed": { ja: "保存できませんでした", en: "Couldn't save that", "zh-TW": "無法儲存" },
  "voice.tooBig": {
    ja: "動画が大きすぎます",
    en: "That video is too large",
    "zh-TW": "影片太大了",
  },
  "voice.noCamera": {
    ja: "カメラとマイクを使えませんでした",
    en: "Couldn't use the camera and microphone",
    "zh-TW": "無法使用相機和麥克風",
  },
  "voice.unsupported": {
    ja: "この端末では動画を撮れません",
    en: "This device can't record video",
    "zh-TW": "這個裝置無法錄影",
  },
  "voice.needsMigration": {
    ja: "まだ保存先の準備ができていません（移行待ち）",
    en: "Storage isn't ready yet (migration pending)",
    "zh-TW": "儲存的地方還沒準備好（等待轉移）",
  },
  // ホームの本棚と見開き(オーナー指摘 2026-08-21 ⑬⑭)。
  "home.shelfAria": { ja: "アルバムの本棚", en: "Album shelf", "zh-TW": "相簿的書架" },
  "home.bookDay": { ja: "日ごと", en: "By day", "zh-TW": "每天" },
  "home.bookWeek": { ja: "週ごと", en: "By week", "zh-TW": "每週" },
  "home.bookMonth": { ja: "月ごと", en: "By month", "zh-TW": "每月" },
  "home.openBook": {
    ja: "{name}のアルバムを開く",
    en: "Open the {name} album",
    "zh-TW": "打開{name}的相簿",
  },
  "home.spreadEmpty": {
    ja: "まだ前のページがありません",
    en: "No earlier pages yet",
    "zh-TW": "還沒有前一頁",
  },
  "home.noJournalThatDay": {
    ja: "この日の日記はありません",
    en: "No journal for that day",
    "zh-TW": "這天沒有日記",
  },
  "home.olderSpread": { ja: "前へ", en: "Older", "zh-TW": "上一頁" },
  "home.newerSpread": { ja: "次へ", en: "Newer", "zh-TW": "下一頁" },
  "home.prevPage": { ja: "前のページ", en: "Previous page", "zh-TW": "上一頁" },
  "home.nextPage": { ja: "次のページ", en: "Next page", "zh-TW": "下一頁" },
  "home.backToSpread": { ja: "見開きに戻る", en: "Back to the spread", "zh-TW": "回到跨頁" },
  "dex.filterCategory": { ja: "カテゴリー", en: "Category", "zh-TW": "分類" },
  "dex.filterDay": { ja: "日付", en: "Date", "zh-TW": "日期" },
  "dex.filterOpen": { ja: "{name}を選ぶ", en: "Choose {name}", "zh-TW": "選擇{name}" },
  "dex.filterClearAll": {
    ja: "絞り込みをすべて解除",
    en: "Clear all filters",
    "zh-TW": "清除所有篩選",
  },
  "dex.clearSearch": { ja: "検索をクリア", en: "Clear search", "zh-TW": "清除搜尋" },
  "dex.noMatch": {
    ja: "に一致する単語はありません。",
    en: "— no matching words.",
    "zh-TW": "沒有符合的單字。",
  },
  "dex.emptyTitle": {
    ja: "まだ何もキャッチしていません。",
    en: "Nothing caught yet.",
    "zh-TW": "還沒有捕捉到任何東西。",
  },
  "dex.emptyHint": {
    ja: "街で見かけた言葉にカメラをかざすと、ここに図鑑が育ちます。",
    en: "Point the camera at words around you and your dex starts growing.",
    "zh-TW": "把相機對準在街上看到的字，圖鑑就會在這裡長大。",
  },
  "dex.emptyCta": { ja: "最初の一枚を撮る", en: "Take your first photo", "zh-TW": "拍下第一張" },
  "dex.placesTitle": { ja: "キャッチした場所", en: "Where you caught them", "zh-TW": "捕捉的地點" },
  "dex.placesHint": {
    ja: "写真をタップで地図がその場所へズーム。地図上の丸い写真をタップで単語の詳細へ。",
    en: "Tap a photo to zoom the map there. Tap a round photo on the map to open the word.",
    "zh-TW": "點照片，地圖就會拉到那個地點。點地圖上的圓形照片，就會進到單字詳細。",
  },
  "dex.withLocation": {
    ja: "場所付きの単語",
    en: "Words with a location",
    "zh-TW": "有地點的單字",
  },
  "dex.mapUnavailable": {
    ja: "地図の連携が完了していません。",
    en: "Maps are not configured yet.",
    "zh-TW": "地圖的串接還沒完成。",
  },
  "dex.items": { ja: "件", en: "spots", "zh-TW": "筆" },
  // --- settings (admin) ---
  "settings.devOnly": {
    ja: "開発者専用（あなたにしか表示されません）",
    en: "Developer only (visible to you alone)",
    "zh-TW": "開發者專用（只有你看得到）",
  },
  "settings.themeCompare": {
    ja: "UIテーマを比較",
    en: "Compare UI themes",
    "zh-TW": "比較 UI 主題",
  },
  "settings.themeHint": {
    ja: "タップで即切り替わります。「現行」に戻せばいつでも元のデザインです。",
    en: "Tap to switch instantly. Pick “Current” to go back to today's design.",
    "zh-TW": "點一下就會馬上切換。回到「現行」隨時都能變回原本的設計。",
  },
  "settings.themeKeep": { ja: "保持", en: "Kept", "zh-TW": "保留" },
  "settings.aiSwitch": {
    ja: "使うAIを切り替える",
    en: "Switch the AI in use",
    "zh-TW": "切換要用的 AI",
  },
  "settings.aiRunning": {
    ja: "いま動いている設定",
    en: "Currently running",
    "zh-TW": "目前運作中的設定",
  },
  "settings.aiProvider": { ja: "提供元", en: "Provider", "zh-TW": "供應商" },
  "settings.aiEnvDefault": {
    ja: "環境変数のまま（既定）",
    en: "Keep environment default",
    "zh-TW": "維持環境變數（預設）",
  },
  "settings.aiKeyNote": {
    ja: "APIキーは環境変数に置いたまま切り替わります(DBに鍵は保存しません)。",
    en: "API keys stay in environment variables — never stored in the database.",
    "zh-TW": "API 金鑰會留在環境變數裡切換（不會把金鑰存進資料庫）。",
  },
  "settings.aiFast": {
    ja: "速い系（スキャン・候補・4択の生成）",
    en: "Fast (scan, candidates, quiz)",
    "zh-TW": "快速型（掃描・候選・四選一的產生）",
  },
  "settings.aiRich": {
    ja: "詳しい系（カード・添削）",
    en: "Rich (cards, corrections)",
    "zh-TW": "詳細型（字卡・修改）",
  },
  "settings.aiPremium": { ja: "Pro ユーザー用", en: "For Pro users", "zh-TW": "給 Pro 使用者" },
  "settings.aiApply": {
    ja: "この設定で動かす",
    en: "Run with these settings",
    "zh-TW": "用這個設定運作",
  },
  "settings.aiApplied": {
    ja: "AIモデルを切り替えました（次のリクエストから有効）",
    en: "AI models switched (effective from the next request)",
    "zh-TW": "已切換 AI 模型（下一個請求開始生效）",
  },
  "settings.nativeLangHint": {
    ja: "台湾華語のつまずき方は母語で変わります。発音のコツ・復習の添削・日記の添削が、この母語に合わせて最適化されます。",
    en: "Where Mandarin trips you up depends on your first language. Pronunciation tips, review feedback and journal corrections all adapt to it.",
    "zh-TW":
      "台灣華語會卡在哪裡，會因母語而不同。發音訣竅、複習的修改、日記的修改，都會配合這個母語做最佳化。",
  },
  "settings.aiKeys": {
    ja: "APIキーの検出状況",
    en: "API key detection",
    "zh-TW": "API 金鑰的偵測狀況",
  },
  "settings.aiKeyFound": { ja: "検出", en: "found", "zh-TW": "已偵測" },
  "settings.aiKeyMissing": { ja: "未設定", en: "not set", "zh-TW": "未設定" },
  "settings.aiKeysHint": {
    ja: "サーバーの環境変数を実際に読んだ結果です。1つも検出できないとAI機能は動きません。",
    en: "Read live from the server environment. With no key detected, AI features cannot run.",
    "zh-TW": "這是實際讀取伺服器環境變數的結果。一個都偵測不到的話，AI 功能就不會運作。",
  },
  "settings.aiPerFeature": {
    ja: "機能ごとに使うAIを分ける",
    en: "Assign an AI per feature",
    "zh-TW": "依功能分別指定要用的 AI",
  },
  "settings.aiFeature.scan": {
    ja: "スキャン（速さ優先）",
    en: "Scan (speed first)",
    "zh-TW": "掃描（以速度優先）",
  },
  "settings.aiFeature.card": {
    ja: "単語カード生成",
    en: "Word card generation",
    "zh-TW": "單字卡產生",
  },
  "settings.aiFeature.review": {
    ja: "復習の添削・ヒント",
    en: "Review feedback & hints",
    "zh-TW": "複習的修改・提示",
  },
  "settings.aiFeature.journal": {
    ja: "日記の添削",
    en: "Journal correction",
    "zh-TW": "日記的修改",
  },
  "settings.aiFeature.audit": {
    ja: "自己改善の点検",
    en: "Self-improvement audit",
    "zh-TW": "自我改善的檢查",
  },
  "settings.aiPerFeatureHint": {
    ja: "空欄なら上の既定を使います。「提供元:モデル名」で別のAIに丸ごと振り分けられます(例 openai:gpt-5)。キーが無い提供元を指定しても既定に自動で戻るので、設定ミスで機能は止まりません。",
    en: "Leave blank to use the default above. Use “provider:model” to route a feature to another AI (e.g. openai:gpt-5). If that provider has no key, it falls back to the default — a wrong setting never breaks the feature.",
    "zh-TW":
      "留空就用上面的預設。用「供應商:模型名稱」可以整個換到別的 AI（例 openai:gpt-5）。就算指定了沒有金鑰的供應商，也會自動退回預設，所以不會因為設定錯誤讓功能停掉。",
  },
  "settings.aiModelNote": {
    ja: "モデル名は提供元に実在するIDを書いてください(例 gemini-2.5-flash)。存在しないIDのときは自動で安定モデルに戻して動かします。",
    en: "Use a model ID that really exists on the provider (e.g. gemini-2.5-flash). Unknown IDs automatically fall back to a stable model.",
    "zh-TW":
      "模型名稱請填供應商實際存在的 ID（例 gemini-2.5-flash）。填了不存在的 ID 時，會自動退回穩定的模型繼續運作。",
  },
  "settings.devMetrics": {
    ja: "開発者（速度計測）",
    en: "Developer (speed metrics)",
    "zh-TW": "開發者（速度測量）",
  },
  "settings.deleteAccount": { ja: "アカウントを削除", en: "Delete account", "zh-TW": "刪除帳號" },
  "settings.videoLabel": {
    ja: "録画（インカメ）",
    en: "Record video (front camera)",
    "zh-TW": "錄影（前鏡頭）",
  },
  "settings.videoHint": {
    ja: "スピーキング復習中、自分の姿を録画してあとで見返せます。この端末のみに保存。映像のみ（マイクは音声認識が使います）。",
    en: "Record yourself during speaking review and watch it back. Stored on this device only. Video only — the mic is reserved for speech recognition.",
    "zh-TW":
      "口說複習時可以錄下自己的樣子，之後回看。只存在這台裝置上。只有影像（麥克風給語音辨識用）。",
  },
  "settings.reviewMode": { ja: "復習モード", en: "Review mode", "zh-TW": "複習模式" },
  "settings.reviewModeHint": {
    ja: "「AIが選ぶ」は、その単語をどれだけ覚えているかを見て AI が出題の形を決めます（忘れかけ→4択、うろ覚え→発音、覚えた→作文）。「話す」は写真を見て話し、AIが添削します。「4択」は声を出せない場所向けです。",
    en: "“AI picks” looks at how well you remember each word and chooses the task (shaky → quiz, half-there → say it, solid → compose). “Speak”: talk about the photo and AI corrects you. “Quiz”: for when you can't speak out loud.",
    "zh-TW":
      "「AI 幫你選」會看你對這個字記得多牢，再決定出題的形式（快忘了→四選一、記得模糊→發音、記住了→造句）。「開口說」是看照片說出來，由 AI 修改。「四選一」適合不方便出聲的場合。",
  },
  "settings.avatar": { ja: "プロフィール写真", en: "Profile photo", "zh-TW": "大頭貼" },
  "settings.avatarPick": { ja: "写真を選ぶ", en: "Choose photo", "zh-TW": "選照片" },
  "settings.avatarChange": { ja: "変更", en: "Change", "zh-TW": "更換" },
  "settings.avatarClear": { ja: "外す", en: "Remove", "zh-TW": "移除" },
  "settings.avatarSaving": { ja: "保存中…", en: "Saving…", "zh-TW": "儲存中…" },
  "settings.avatarSaved": {
    ja: "プロフィール写真を変えました",
    en: "Profile photo updated",
    "zh-TW": "已更換大頭貼",
  },
  "settings.avatarFailed": {
    ja: "写真を保存できませんでした",
    en: "Couldn't save the photo",
    "zh-TW": "無法儲存照片",
  },
  "settings.avatarNone": {
    ja: "プロフィール写真はまだありません",
    en: "No profile photo yet",
    "zh-TW": "還沒有大頭貼",
  },
  "settings.avatarHint": {
    ja: "画面上のアイコンがこの写真になります。",
    en: "This becomes the icon at the top of every screen.",
    "zh-TW": "畫面上的頭像會變成這張照片。",
  },
  "settings.reviewLimit": { ja: "1日の復習枚数", en: "Cards per day", "zh-TW": "每天複習的張數" },
  "settings.reviewLimitNone": { ja: "無制限", en: "All", "zh-TW": "無限制" },
  "settings.reviewLimitHint": {
    ja: "この枚数までで今日の復習は終わり。終わりが見えるほうが続きます。",
    en: "Today's review ends after this many cards — a finish line keeps the habit going.",
    "zh-TW": "到這個張數今天的複習就結束。看得到終點比較容易持續。",
  },
  "settings.reviewFocus": { ja: "優先する記憶の段階", en: "Prioritise", "zh-TW": "優先的記憶階段" },
  "settings.focusAll": { ja: "期限順", en: "By due date", "zh-TW": "依到期順序" },
  "settings.focusWeak": { ja: "忘れかけ", en: "Weakest", "zh-TW": "快忘了" },
  "settings.focusNew": { ja: "覚えたて", en: "Newest", "zh-TW": "剛記住" },
  "settings.reviewFocusHint": {
    ja: "忘れかけは何度も間違えた語から、覚えたては復習回数が少ない語から出します。",
    en: "Weakest: words you keep missing first. Newest: words with the fewest reviews first.",
    "zh-TW": "「快忘了」會從錯很多次的字開始出，「剛記住」會從複習次數少的字開始出。",
  },
  "settings.strictness": {
    ja: "発音判定の厳しさ",
    en: "Pronunciation strictness",
    "zh-TW": "發音判定的嚴格度",
  },
  "settings.easy": { ja: "やさしい", en: "Easy", "zh-TW": "寬鬆" },
  "settings.normal": { ja: "ふつう", en: "Normal", "zh-TW": "普通" },
  "settings.strict": { ja: "きびしい", en: "Strict", "zh-TW": "嚴格" },
  "settings.light": { ja: "ライト", en: "Light", "zh-TW": "淺色" },
  "settings.dark": { ja: "ダーク", en: "Dark", "zh-TW": "深色" },
  "settings.system": { ja: "システム", en: "System", "zh-TW": "跟隨系統" },
  "settings.saveFailed": { ja: "保存に失敗しました", en: "Could not save", "zh-TW": "儲存失敗" },
  // 復習の画面のつまみと**同じ言葉**にする。設定で選ぶのはあの切替の既定値
  // なので、名前が違うと同じ物だと分からない。「ライト」は復習の重さを指す
  // 造語で、明るさの設定(settings.light)と字面が同じになって二重に紛らわしい
  // ので落とす(オーナー指摘「ライトonって名前は不自然」)。
  // --- 主役の写真を選ぶ(要望 #17) ---
  "photo.pickTitle": {
    ja: "この札の主役の写真",
    en: "Main photo for this card",
    "zh-TW": "這張貼紙的主角照片",
  },
  "photo.followSetting": { ja: "設定に従う", en: "Follow my setting", "zh-TW": "依照設定" },
  "photo.followSettingHint": {
    ja: "画面ごとに合う絵が出ます（いまの既定）",
    en: "Each screen picks what suits it (current default)",
    "zh-TW": "每個畫面會出現合適的圖（目前的預設）",
  },
  "photo.roleObject": { ja: "元の写真", en: "Photo", "zh-TW": "原本的照片" },
  "photo.roleCutout": { ja: "切り抜き", en: "Cut-out", "zh-TW": "去背圖" },
  "photo.roleSelfie": { ja: "自撮り", en: "Selfie", "zh-TW": "自拍" },
  "photo.rolePlaceholder": { ja: "ネット画像", en: "Web image", "zh-TW": "網路圖片" },
  "photo.cutoutNow": { ja: "いま切り抜く", en: "Cut it out now", "zh-TW": "現在去背" },
  "photo.cuttingOut": { ja: "切り抜いています…", en: "Cutting out…", "zh-TW": "去背中…" },
  "photo.cutoutFailed": {
    ja: "切り抜けませんでした。もう一度お試しください。",
    en: "Couldn't cut it out. Please try again.",
    "zh-TW": "無法去背，請再試一次。",
  },
  "photo.replaceFile": {
    ja: "別の写真に差し替える",
    en: "Replace with another photo",
    "zh-TW": "換成別的照片",
  },
  "photo.saveFailedMigration": {
    ja: "この端末のデータベースがまだ新しい設定に対応していません（管理者に連絡してください）。",
    en: "The database hasn't been migrated for this setting yet (please contact the admin).",
    "zh-TW": "這台裝置的資料庫還不支援新的設定（請聯絡管理者）。",
  },
  "settings.catchSpeed": { ja: "キャッチのしかた", en: "How a catch works", "zh-TW": "捕捉的方式" },
  "settings.catchSpeedHint": {
    ja: "カードはどちらでもすぐ出ます。違うのは図鑑に入れる前に切り抜くかどうかだけ。ファストは切り抜かずに入れて、あとから写真を長押しして切り抜けます。",
    en: "The card appears right away either way. The only difference is whether the object is cut out before it goes into the dex. Fast skips it — long-press the photo later to cut it out.",
    "zh-TW":
      "兩種字卡都會馬上出現，差別只在收進圖鑑前要不要去背。「快速」是不去背就收進來，之後可以長按照片再去背。",
  },
  "settings.speedDetail": { ja: "切り抜き", en: "Cut-out", "zh-TW": "去背" },
  "settings.speedFast": { ja: "ファスト", en: "Fast", "zh-TW": "快速" },
  "set.catchSpeedMetrics": {
    ja: "キャッチにかかった時間",
    en: "Time a catch took",
    "zh-TW": "捕捉花的時間",
  },
  "set.catchSpeedN": { ja: "{n}回", en: "{n}×", "zh-TW": "{n} 次" },
  "set.catchSpeedClear": { ja: "記録を消す", en: "Clear the log", "zh-TW": "清除紀錄" },
  "settings.photoPref": {
    ja: "札の主役の写真",
    en: "Main photo on a card",
    "zh-TW": "貼紙的主角照片",
  },
  "settings.photoPrefHint": {
    ja: "「画面ごと」は画面に合う絵を選びます（棚は切り抜き、アルバムは自撮り）。選ぶと全部の画面でそれを先に出します。その絵が無い札は、ある絵に落ちます。",
    en: "“Per screen” lets each screen pick what suits it (cut-outs on the shelf, selfies in the album). Choose one and every screen shows it first; cards without it fall back to what they have.",
    "zh-TW":
      "「依畫面」會挑選適合該畫面的圖（書架用去背圖，相簿用自拍）。選定之後，所有畫面都會優先出現那一種。沒有那種圖的貼紙，會退回有的圖。",
  },
  "settings.photoAuto": { ja: "画面ごと", en: "Per screen", "zh-TW": "依畫面" },
  "settings.photoObject": { ja: "元の写真", en: "Photo", "zh-TW": "原本的照片" },
  "settings.photoCutout": { ja: "切り抜き", en: "Cut-out", "zh-TW": "去背圖" },
  "settings.photoSelfie": { ja: "自撮り", en: "Selfie", "zh-TW": "自拍" },
  "settings.modeHybrid": { ja: "🎯 AIが選ぶ", en: "🎯 AI picks", "zh-TW": "🎯 AI 幫你選" },
  "settings.modeSpeaking": { ja: "🎤 話す", en: "🎤 Speak", "zh-TW": "🎤 開口說" },
  "settings.modeChoice": { ja: "👆 4択", en: "👆 Quiz", "zh-TW": "👆 四選一" },
  "settings.zhuyin": { ja: "ㄅㄆㄇ 注音", en: "ㄅㄆㄇ Zhuyin", "zh-TW": "ㄅㄆㄇ 注音" },
  "settings.pinyin": { ja: "abc ピンイン", en: "abc Pinyin", "zh-TW": "abc 拼音" },
  // 英語版の読みの表記。既定はアメリカ英語(オーナー決定 2026-08-24)。
  // --- 出典（商用利用の条件。`src/lib/data-sources.ts` と対で持つ） ---
  "settings.sources": { ja: "データの出典", en: "Data sources", "zh-TW": "資料來源" },
  "settings.sourcesHint": {
    ja: "単語の意味・発音・レベルは、下のデータをもとに作っています。",
    en: "Word meanings, pronunciations and levels are built from the data below.",
    "zh-TW": "單字的意思、發音和等級，都是根據下面的資料做出來的。",
  },
  "sources.required": { ja: "出典の明記が条件", en: "Attribution required", "zh-TW": "須註明出處" },
  "sources.ecdict": {
    ja: "英語の意味・品詞・活用・頻度・検定タグ",
    en: "English meanings, part of speech, inflections, frequency and exam tags",
    "zh-TW": "英文的意思・詞性・變化・頻率・檢定標籤",
  },
  "sources.cmudict": {
    ja: "アメリカ英語の発音",
    en: "American English pronunciation",
    "zh-TW": "美式英語的發音",
  },
  "sources.cefrjWordlist": {
    ja: "英単語の CEFR レベル",
    en: "CEFR levels for English words",
    "zh-TW": "英文單字的 CEFR 等級",
  },
  "sources.cefrjGrammar": {
    ja: "英文法の CEFR レベル",
    en: "CEFR levels for English grammar",
    "zh-TW": "英文文法的 CEFR 等級",
  },
  "sources.opencc": {
    ja: "簡体字から台湾正体字への変換",
    en: "Simplified to Taiwanese traditional Chinese",
    "zh-TW": "簡體字轉台灣正體字",
  },
  "settings.ipaUs": { ja: "IPA アメリカ", en: "IPA (US)", "zh-TW": "IPA 美式" },
  "settings.ipaUk": { ja: "IPA イギリス", en: "IPA (UK)", "zh-TW": "IPA 英式" },
  "settings.phoneticHint": {
    ja: "図鑑・復習・詳細カードなどアプリ全体で、選んだ表記だけを表示します。",
    en: "Only the notation you pick is shown across the whole app.",
    "zh-TW": "圖鑑、複習、詳細字卡等整個 App 裡，只會顯示你選的那一種標記。",
  },
  "settings.langJa": { ja: "日本語", en: "Japanese", "zh-TW": "日本語" },
  "settings.langEn": { ja: "English", en: "English", "zh-TW": "English" },
  // 符号は見せない。この束の他の4行(日本語 / English / 母語 / 表示言語)は
  // どれも言語の名前だけを出すのに、ここだけ `(zh-TW)` を足していた。
  "settings.langZhTw": { ja: "台湾華語", en: "Taiwanese Mandarin", "zh-TW": "台灣華語" },
  "settings.deleteWarn": {
    ja: "集めた単語カード・写真・復習の記録・日記など、すべてのデータが完全に削除されます。この操作は取り消せません。",
    en: "Every card, photo, review record and journal entry is permanently deleted. This cannot be undone.",
    "zh-TW": "收集的單字卡、照片、複習紀錄、日記等所有資料都會被完全刪除。這個動作無法復原。",
  },
  "settings.deleteTypeLabel": {
    ja: "確認のため「削除」と入力してください",
    en: "Type 削除 to confirm",
    "zh-TW": "請輸入「削除」以確認",
  },
  "settings.deleteButton": {
    ja: "アカウントを完全に削除する",
    en: "Permanently delete my account",
    "zh-TW": "完全刪除帳號",
  },
  "settings.deleting": { ja: "削除しています…", en: "Deleting…", "zh-TW": "刪除中…" },
  "settings.deleteDone": {
    ja: "アカウントを削除しました。ご利用ありがとうございました。",
    en: "Your account has been deleted. Thank you for using Catchwords.",
    "zh-TW": "帳號已刪除。謝謝你的使用。",
  },
  "settings.deleteFailed": {
    ja: "削除に失敗しました。もう一度お試しください。",
    en: "Could not delete. Please try again.",
    "zh-TW": "刪除失敗，請再試一次。",
  },
  "settings.metricDetect": {
    ja: "スキャン検出（中央値）",
    en: "Scan detection (median)",
    "zh-TW": "掃描偵測（中位數）",
  },
  "settings.metricAudio": {
    ja: "タップ→音声再生（中央値）",
    en: "Tap → audio (median)",
    "zh-TW": "點擊→播放語音（中位數）",
  },
  "settings.metricTarget": { ja: "目標", en: "target", "zh-TW": "目標" },
  "settings.metricNone": { ja: "計測なし", en: "no data", "zh-TW": "沒有測量資料" },
  "settings.kpiLink": {
    ja: "KPIダッシュボードを開く →",
    en: "Open the KPI dashboard →",
    "zh-TW": "開啟 KPI 儀表板 →",
  },
  // --- review (speaking / memory details) ---
  "review.preparing": {
    ja: "今日の出題を準備中…",
    en: "Preparing today's set…",
    "zh-TW": "正在準備今天的題目…",
  },
  "review.gradeFailed": {
    ja: "結果を保存できませんでした。この単語は次回もう一度出題されます。",
    en: "Couldn't save your result — this word will come up again next time.",
    "zh-TW": "無法儲存結果。這個單字下次會再出一次。",
  },
  "review.memoryLoading": {
    ja: "記憶データを準備中です。",
    en: "Preparing memory data…",
    "zh-TW": "正在準備記憶資料。",
  },
  "review.scene": { ja: "シーン: ", en: "Scene: ", "zh-TW": "場景：" },
  "review.todaysPattern": { ja: "今日の型", en: "Today's pattern", "zh-TW": "今天的句型" },
  "review.usePattern": {
    ja: "この型を入れて一文話してみよう",
    en: "Use this pattern in one sentence",
    "zh-TW": "用這個句型說一句話看看",
  },
  "review.teacherQ": { ja: "先生の質問", en: "Your teacher asks", "zh-TW": "老師的問題" },
  "review.hintsLabel": {
    ja: "ヒント（型・チャンク・文法）",
    en: "Hints (patterns, chunks, grammar)",
    "zh-TW": "提示（句型・組塊・文法）",
  },
  "review.buildYourOwn": {
    ja: "これを使って自分の一文を組み立ててみよう（答えはまだ見せません）",
    en: "Build your own sentence with these (the answer stays hidden)",
    "zh-TW": "用這些組出自己的一句話看看（答案還先不給）",
  },
  "review.yourNote": { ja: "💭 あなたのメモ:", en: "💭 Your note:", "zh-TW": "💭 你的筆記：" },
  "review.mixFeeling": {
    ja: "— この気持ちも混ぜてみよう",
    en: "— work this feeling in too",
    "zh-TW": "— 也把這個心情放進去看看",
  },
  "review.promptSpeak": {
    ja: "この時のことを、単語を使って一文で",
    en: "Say one sentence about this moment",
    "zh-TW": "用這個單字，說一句當時的事",
  },
  "review.promptPhrase": {
    ja: "この場面、どう返す？",
    en: "How would you reply here?",
    "zh-TW": "這個場面，你會怎麼回？",
  },
  "review.recognitionHint": {
    ja: "音声認識のミスはここで直せます(直接入力もOK)",
    en: "Fix any speech-recognition slips here (or just type)",
    "zh-TW": "語音辨識的錯誤可以在這裡改（直接輸入也可以）",
  },
  "review.partKind.chunk": { ja: "チャンク", en: "Chunk", "zh-TW": "組塊" },
  "review.partKind.phrase": { ja: "フレーズ", en: "Phrase", "zh-TW": "片語" },
  "review.partKind.grammar": { ja: "文法", en: "Grammar", "zh-TW": "文法" },
  "review.playHint": { ja: "このヒントを読み上げ", en: "Play this hint", "zh-TW": "唸出這個提示" },
  "review.watchYourself": {
    ja: "自分の発話を見返す",
    en: "Watch yourself",
    "zh-TW": "回看自己說的樣子",
  },
  "review.videoNoAudio": {
    ja: "録画は映像のみです（マイクは音声認識が使うため）。話した内容は下のテキストで確認できます。",
    en: "Video only — the mic is reserved for speech recognition. Your words appear as text below.",
    "zh-TW": "錄影只有影像（麥克風給語音辨識用）。說的內容可以看下面的文字。",
  },
  "review.you": { ja: "あなた", en: "You", "zh-TW": "你" },
  "review.corrected": { ja: "添削", en: "Corrected", "zh-TW": "修改" },
  "review.sentenceBuild": { ja: "文の組み立て", en: "Sentence structure", "zh-TW": "句子的組成" },
  "review.whyOrder": {
    ja: "なぜこの語順？",
    en: "Why this word order?",
    "zh-TW": "為什麼是這個語序？",
  },
  "review.nativeFeel": {
    ja: "ネイティブの気持ち",
    en: "How natives feel it",
    "zh-TW": "母語者的感覺",
  },
  "review.model": { ja: "お手本", en: "Model answer", "zh-TW": "示範" },
  "review.altWay": { ja: "別の言い方: ", en: "Another way: ", "zh-TW": "另一種說法：" },
  "review.retryPattern": {
    ja: "型を使ってもう一度",
    en: "Try again with the pattern",
    "zh-TW": "用句型再說一次",
  },
  "review.newBranch": {
    ja: "🌿 新しい枝が解禁",
    en: "🌿 New branch unlocked",
    "zh-TW": "🌿 新的樹枝解鎖了",
  },
  "review.natural": { ja: "自然！", en: "Natural!", "zh-TW": "很自然！" },
  "review.almost": {
    ja: "通じるけど、もう一歩",
    en: "Understandable — one step to go",
    "zh-TW": "聽得懂，但還差一點",
  },
  "review.useTarget": { ja: "を使ってみよう", en: "— try using this word", "zh-TW": "試著用用看" },
  "review.naturalness": { ja: "自然さ", en: "Naturalness", "zh-TW": "自然度" },
  // --- capture flow ---
  "capture.selfieTitle": {
    ja: "ステップ 2: 自撮りを撮る（任意）",
    en: "Step 2: Take a selfie (optional)",
    "zh-TW": "步驟 2：拍自拍（選填）",
  },
  "capture.selfieHint": {
    ja: "対象物と一緒に自分も撮ると、後で振り返るときに記憶が蘇ります。",
    en: "A photo of you with the thing makes the memory much easier to recall.",
    "zh-TW": "和拍攝對象一起把自己也拍進去，之後回顧時記憶會更鮮明。",
  },
  "capture.addSelfie": { ja: "自撮りを追加", en: "Add a selfie", "zh-TW": "加上自拍" },
  "capture.skipNext": { ja: "スキップして次へ", en: "Skip for now", "zh-TW": "跳過，進下一步" },
  "capture.redo": { ja: "やり直す", en: "Start over", "zh-TW": "重來" },
  "capture.pickTitle": {
    ja: "ステップ 3: 単語を選ぶ",
    en: "Step 3: Pick a word",
    "zh-TW": "步驟 3：選單字",
  },
  "capture.pickHint": {
    ja: "AIが候補を提案しました。学びたい単語を選んでください。",
    en: "Here's what the AI found — pick the word you want to learn.",
    "zh-TW": "AI 提出了幾個候選，請選你想學的單字。",
  },
  "capture.otherWord": {
    ja: "違う単語を入力",
    en: "Type a different word",
    "zh-TW": "輸入別的單字",
  },
  "capture.useThis": { ja: "これにする", en: "Use this", "zh-TW": "就選這個" },
  "capture.noSelfie": { ja: "自撮りなし", en: "No selfie", "zh-TW": "沒有自拍" },
  "capture.flipHint": {
    ja: "画像をタップで自撮りにフリップ",
    en: "Tap the photo to flip to your selfie",
    "zh-TW": "點圖片翻到自拍",
  },
  "capture.note": {
    ja: "一言メモ（任意）",
    en: "A quick note (optional)",
    "zh-TW": "一句話筆記（選填）",
  },
  "capture.notePlaceholder": {
    ja: "どんな場面で出会った？",
    en: "Where did you run into it?",
    "zh-TW": "在什麼場合遇到的？",
  },
  "capture.addToDex": { ja: "図鑑に追加", en: "Add to the dex", "zh-TW": "加進圖鑑" },
  "capture.offlineTitle": {
    ja: "解析できなかったので写真を預かりました",
    en: "Couldn't analyze it — we kept your photo",
    "zh-TW": "沒能分析，先幫你把照片收著了",
  },
  "capture.offlineHint": {
    ja: "あとでホームの「解析待ち」から続きができます。撮った瞬間は逃していません。",
    en: "Continue later from “Waiting for analysis” on Home. The moment isn't lost.",
    "zh-TW": "之後可以從首頁的「等待分析」繼續。拍下的那一刻沒有錯過。",
  },
  "capture.savedReason": {
    ja: "理由: {reason}",
    en: "Reason: {reason}",
    "zh-TW": "原因：{reason}",
  },
  "capture.savedRetry": {
    ja: "いますぐもう一度試す",
    en: "Try again now",
    "zh-TW": "現在就再試一次",
  },
  "capture.cancel": { ja: "やめる", en: "Cancel", "zh-TW": "取消" },
  "capture.toHome": { ja: "ホームへ", en: "Go Home", "zh-TW": "回首頁" },
  "capture.oneMore": { ja: "もう一枚撮る", en: "Take another", "zh-TW": "再拍一張" },
  "capture.reunion": { ja: "再会！", en: "Reunion!", "zh-TW": "重逢！" },
  "capture.rememberQ": {
    ja: "意味、覚えてる？ — タップして答え合わせ",
    en: "Do you remember it? — tap to check",
    "zh-TW": "還記得意思嗎？— 點一下對答案",
  },
  "capture.remembered": { ja: "覚えてた！", en: "I remembered!", "zh-TW": "記得！" },
  "capture.forgot": { ja: "忘れてた…", en: "I forgot…", "zh-TW": "忘記了…" },
  "capture.reviewBest": {
    ja: "現実世界での復習、最強です 🎉",
    en: "Real-world review — the strongest kind 🎉",
    "zh-TW": "在真實世界裡複習，效果最強 🎉",
  },
  "capture.willAsk": {
    ja: "大丈夫、明日また出題します",
    en: "No worries — we'll ask again tomorrow",
    "zh-TW": "沒關係，明天會再出一次",
  },
  "capture.shootAnother": {
    ja: "別のものを撮る",
    en: "Shoot something else",
    "zh-TW": "拍別的東西",
  },
  "capture.seeInDex": { ja: "図鑑で見る", en: "See it in the dex", "zh-TW": "在圖鑑裡看" },
  "home.pendingDiscard": { ja: "捨てる", en: "Discard", "zh-TW": "丟掉" },
  // **結果を言う。** 「本当に捨てる?」では何が消えるか分からない。
  // この帯は複数枚を数えているが、捨てるのは上に写っている1枚だけ。
  "home.pendingDiscardConfirm": {
    ja: "この写真を捨てる",
    en: "Discard this photo",
    "zh-TW": "丟掉這張照片",
  },
  "home.pendingDiscardCancel": { ja: "やめる", en: "Cancel", "zh-TW": "取消" },
  "home.pendingCta": {
    ja: "タップしてAI解析を再開する",
    en: "Tap to resume AI analysis",
    "zh-TW": "點一下重新開始 AI 分析",
  },
  "home.pendingCount": {
    ja: "解析待ちの写真 {n}枚",
    en: "{n} photos waiting for analysis",
    "zh-TW": "等待分析的照片 {n} 張",
  },
  "card.openMapsLabel": {
    ja: "Google マップで開く →",
    en: "Open in Google Maps →",
    "zh-TW": "用 Google 地圖打開 →",
  },
  "review.videoTip": {
    ja: "設定で「録画」をONにすると、話した時の自撮り動画も残せます",
    en: "Turn on “Record video” in Settings to keep a selfie clip of your speaking",
    "zh-TW": "在設定裡打開「錄影」，就能留下說話時的自拍影片",
  },
};

export function useUiLang(): UiLang {
  // 初回は必ず "ja" を返す。
  //
  // サーバー側は localStorage を読めないので "ja" で描画する。ここで
  // クライアントの初回レンダーだけ localStorage を読んで "en" を返すと、
  // hydration でサーバーとクライアントの文字列が食い違い、React が
  // 「Hydration failed」を出してツリー全体を作り直す。1回分の描画が無駄に
  // なるうえ、コンソールが常にエラーで埋まって本当の不具合が埋もれる。
  //
  // 代わりにマウント後の effect で本当の言語に切り替える。英語表示の人には
  // 一瞬だけ日本語が見えるが、これは localStorage に言語を持つ設計上の
  // トレードオフ(サーバーに知らせるには Cookie にする必要がある)。
  const [lang, setLang] = useState<UiLang>("ja");
  useEffect(() => {
    const h = () => {
      const next = getUiLang();
      setLang(next);
      // 読み上げソフトや繁体字以外の字形選択のため、文書の言語も合わせる。
      const attr = htmlLangOf(next);
      if (document.documentElement.lang !== attr) document.documentElement.lang = attr;
    };
    h();
    window.addEventListener(EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(EVENT, h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return lang;
}

/** 文中の `{name}` を値に差し替える。 */
function fill(tpl: string, vars?: Vars): string {
  if (!vars) return tpl;
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export type Vars = Record<string, string | number>;

/**
 * `const t = useT(); t("nav.home")` — 未登録キーはキーをそのまま返す。
 *
 * 数や名前が入る文は `{}` で埋め込む:
 *   t("tree.branches", { done: 3, total: 8 })
 *     ja: "枝 {done}/{total} 本" → 「枝 3/8 本」
 *     en: "{done} of {total} branches"
 * language ごとに語順が違うので、文を分割して連結してはいけない。
 * 「{n}日前」のような文も、英語では "{n} days ago" と語順が変わる。
 */
export function useT(): (key: string, vars?: Vars) => string {
  const lang = useUiLang();
  // useCallback で包む理由: 毎回新しい関数を返すと、t を useEffect や
  // useCallback の依存に入れた途端に毎レンダー再実行される。逆に依存から
  // 外すと eslint に怒られ、言語を切り替えても中の文が古いままになる。
  // 言語ごとに1つの関数にしておけば、依存に素直に入れられる。
  return useCallback(
    (key: string, vars?: Vars) => fill(DICT[key]?.[lang] ?? DICT[key]?.ja ?? key, vars),
    [lang],
  );
}

/**
 * React の外(通知の文面など)で翻訳したいとき用。
 * フックが使えないので、その場で localStorage を読む。
 */
export function tStatic(key: string, vars?: Vars): string {
  const lang = getUiLang();
  return fill(DICT[key]?.[lang] ?? DICT[key]?.ja ?? key, vars);
}
