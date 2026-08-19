import { useCallback, useEffect, useState } from "react";

/**
 * 軽量i18n(2026-07-25): アプリの主要な操作面(ナビ・見出し・設定)を
 * 日本語/英語で切り替える。設定の「表示言語」= profiles.ui_language を
 * localStorage にミラーして、プロフィール取得を待たずに描画できるようにする。
 * 学習コンテンツ(単語の意味・解説)は対象外 — それは学習者の母語設定の話。
 */

export type UiLang = "ja" | "en";

const KEY = "ui-lang-v1";
const EVENT = "ui-lang-changed";

export function getUiLang(): UiLang {
  if (typeof window === "undefined") return "ja";
  return localStorage.getItem(KEY) === "en" ? "en" : "ja";
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
export const DICT: Record<string, { ja: string; en: string }> = {
  // --- 動的ページタイトル ---
  "page.post": { ja: "投稿 {id} — Catchwords", en: "Post {id} — Catchwords" },
  "page.userProfile": {
    ja: "ユーザー {id} のプロフィール — Catchwords",
    en: "{id}'s profile — Catchwords",
  },
  "page.cardDetail": { ja: "カード {id} — Catchwords", en: "Card {id} — Catchwords" },
  // --- OAuth 同意画面 ---
  "oauth.loadFailed": {
    ja: "認証リクエストを読み込めませんでした",
    en: "Couldn't load the authorization request",
  },
  "oauth.unknownClient": { ja: "外部クライアント", en: "an external client" },
  "oauth.noRedirect": {
    ja: "認証サーバーからリダイレクト先が返されませんでした。",
    en: "The authorization server didn't return a redirect target.",
  },
  "oauth.connectTitle": {
    ja: "{client} を Catchwords に接続",
    en: "Connect {client} to Catchwords",
  },
  "oauth.explain": {
    ja: "このクライアントは、あなたとしてサインインした状態で Catchwords の有効なツールを呼び出せるようになります。",
    en: "This client will be able to call Catchwords' enabled tools while signed in as you.",
  },
  "oauth.redirectTo": { ja: "リダイレクト先:", en: "Redirects to:" },
  "oauth.scope1": {
    ja: "・あなたの Catchwords プロフィール（表示名・アバター）",
    en: "· Your Catchwords profile (display name, avatar)",
  },
  "oauth.scope2": {
    ja: "・あなたのステッカー（単語カード・キャプション・撮影地）",
    en: "· Your stickers (word cards, captions, capture locations)",
  },
  "oauth.scope3": { ja: "・あなたの SRS 復習の予定", en: "· Your SRS review schedule" },
  "oauth.rlsNote": {
    ja: "このアプリの権限とバックエンドポリシー(RLS)は引き続き適用されます。他ユーザーのデータは公開されません。",
    en: "This app's permissions and backend policies (RLS) still apply. Other users' data is never exposed.",
  },
  "oauth.approve": { ja: "許可する", en: "Allow" },
  "oauth.deny": { ja: "拒否する", en: "Deny" },
  // --- 共通 ---
  "common.back": { ja: "戻る", en: "Back" },
  // --- ページタイトル・復習 ---
  "rv.hearModel": { ja: "お手本を聞く", en: "Listen to the model answer" },
  "rv.hearAlt": { ja: "別の言い方を聞く", en: "Listen to the alternative" },
  "page.home": { ja: "ホーム — Catchwords", en: "Home — Catchwords" },
  "page.dex": { ja: "図鑑 — Catchwords", en: "Dex — Catchwords" },
  "page.review": { ja: "復習 — Catchwords", en: "Review — Catchwords" },
  "page.scan": { ja: "スキャン | Catchwords", en: "Scan | Catchwords" },
  "page.capture": { ja: "集める — Catchwords", en: "Catch — Catchwords" },
  "page.settings": { ja: "設定 — Catchwords", en: "Settings — Catchwords" },
  "page.feed": { ja: "フィード — Catchwords", en: "Feed — Catchwords" },
  "page.notifications": { ja: "通知 — Catchwords", en: "Notifications — Catchwords" },
  "page.discover": { ja: "発見 — Catchwords", en: "Discover — Catchwords" },
  "page.journal": { ja: "日記 — Catchwords", en: "Journal — Catchwords" },
  "page.onboarding": { ja: "ようこそ — Catchwords", en: "Welcome — Catchwords" },
  "page.auth": { ja: "ログイン — Catchwords", en: "Sign in — Catchwords" },
  "page.reset": { ja: "パスワード再設定 — Catchwords", en: "Reset password — Catchwords" },
  "page.privacy": { ja: "プライバシーポリシー — Catchwords", en: "Privacy Policy — Catchwords" },
  "page.terms": { ja: "利用規約 — Catchwords", en: "Terms of Service — Catchwords" },
  // --- 復習・単語カード ---
  "rv.modeAria": { ja: "復習モード", en: "Review mode" },
  "rv.quietMode": {
    ja: "声を出せない場所用の4択モード",
    en: "Multiple-choice mode for when you can't speak out loud",
  },
  "rv.overallTitle": { ja: "全体の記憶率(前後2週間)", en: "Overall retention (±2 weeks)" },
  "rv.tapForCurve": {
    ja: "タップで単語ごとの忘却曲線と「いつ忘れるか」の予測が見られます",
    en: "Tap to see each word's forgetting curve and when you're predicted to forget it",
  },
  "rv.today": { ja: "今日", en: "Today" },
  "rv.retention": { ja: "記憶保持率", en: "Retention" },
  "rv.daysLater": { ja: "{n}日後", en: "in {n}d" },
  "rv.daysAgo": { ja: "{n}日前", en: "{n}d ago" },
  "rv.avgRetention": { ja: "平均記憶率", en: "Average retention" },
  "rv.dayN": { ja: "{n}日", en: "{n}d" },
  "rv.formula1": {
    ja: "曲線は保持率 R = e−t/S(S = 間隔 × 定着度)。● の復習ごとに 100% へ回復し、",
    en: "The curve is retention R = e−t/S (S = interval × strength). Each ● review restores it to 100%, and",
  },
  "rv.formula2": {
    ja: "正解すると S が伸びて坂が緩やかになります。",
    en: "getting it right grows S, flattening the slope.",
  },
  "rv.formula3": {
    ja: "付近が、思い出す努力が効く一番おいしい復習タイミングです。",
    en: "is the sweet spot where the effort of recall pays off most.",
  },
  "rv.greenLine": { ja: "緑の線(85%)", en: "The green line (85%)" },
  "rv.noAsr": {
    ja: "このブラウザは音声認識に非対応です。テキスト欄に直接入力してください。",
    en: "This browser doesn't support speech recognition. Please type in the box instead.",
  },
  "rv.notHeard": {
    ja: "音声を聞き取れませんでした。もう一度話すか、下の欄に直接入力してください。",
    en: "Couldn't catch that. Try speaking again, or type in the box below.",
  },
  "rv.feedbackFailed": { ja: "AIフィードバックに失敗しました", en: "AI feedback failed" },
  "rv.targetAlt": { ja: "復習対象", en: "The word being reviewed" },
  "rv.readQuestion": { ja: "質問を読み上げ", en: "Read the question aloud" },
  "rv.stop": { ja: "停止", en: "Stop" },
  "rv.record": { ja: "録音", en: "Record" },
  "rv.hearCorrection": { ja: "添削文を聞く", en: "Listen to the correction" },
  "rv.nextArrow": { ja: "次へ", en: "Next" },
  "rv.topChunk": { ja: "よく使う形", en: "Most-used pattern" },
  "rv.relatedWords": { ja: "一緒に覚える語", en: "Words to learn with it" },
  "rv.measureWords": { ja: "量詞", en: "Measure words" },
  "rv.goodToKnow": { ja: "知っておくと得", en: "Good to know" },
  "rv.kindSyn": { ja: "似", en: "syn" },
  "rv.kindAnt": { ja: "反", en: "ant" },
  "rv.kindRel": { ja: "関", en: "rel" },
  "dex.truncated": {
    ja: "全{total}件のうち、新しい{n}件を表示しています。これより古いものはまだ出せていません。",
    en: "Showing the newest {n} of {total}. Older ones aren't loaded yet.",
  },
  // 「×3」はこのアプリが決めた記号なので、出ているときは意味を添える。
  "dex.metCountLegend": {
    ja: "は、その言葉に出会った回数です",
    en: "means how many times you've met that word",
  },
  "dex.metCountAria": {
    ja: "{word} — {n}回出会った",
    en: "{word} — met {n} times",
  },
  "dex.allCategories": { ja: "すべて", en: "All" },
  "dex.calendar": { ja: "カレンダー", en: "Calendar" },
  "dex.calendarEmpty": {
    ja: "まだ写真がありません。撮るとその日のマスに入ります。",
    en: "No photos yet. Each one lands on the day you took it.",
  },
  "dex.prevMonth": { ja: "前の月", en: "Previous month" },
  "dex.nextMonth": { ja: "次の月", en: "Next month" },
  "dex.dayUnit": { ja: "日", en: "" },
  "dex.allDays": { ja: "すべての日", en: "All days" },
  "rv.whichIsBefore": { ja: "「", en: "Which one means “" },
  "rv.whichIsAfter": { ja: "」はどれ？", en: "”?" },
  "rv.pronOf": { ja: "{c}の発音", en: "Pronunciation of {c}" },
  "card.moveUp": { ja: "上へ", en: "Move up" },
  "card.moveDown": { ja: "下へ", en: "Move down" },
  "card.toggleShow": { ja: "表示切替", en: "Show / hide" },
  "card.playPron": { ja: "発音を再生", en: "Play pronunciation" },
  "card.pronZhuyin": { ja: "発音・注音", en: "Pronunciation & Zhuyin" },
  "card.posLabel": { ja: "品詞", en: "Part of speech" },
  "card.otherLabel": { ja: "その他", en: "Other" },
  "card.reportError": { ja: "この語の誤りを報告", en: "Report an error in this entry" },
  "card.freqAria": { ja: "頻度 {n}/5", en: "Frequency {n}/5" },
  "card.pronOfWord": { ja: "「{word}」の発音", en: 'Pronunciation of "{word}"' },
  "card.ytLabel": { ja: "YouTubeで聞く", en: "Hear it on YouTube" },
  "card.ytHint": { ja: "この単語が話されている動画", en: "Videos where this word is spoken" },
  "card.yglLabel": { ja: "YouGlishで発音例", en: "Pronunciation samples on YouGlish" },
  "card.yglHint": {
    ja: "動画の中の実際の発音（台湾）",
    en: "Real pronunciation in video (Taiwan)",
  },
  "card.dcardLabel": { ja: "Dcardで見る", en: "See it on Dcard" },
  "card.dcardHint": {
    ja: "台湾の若者のSNSでの使われ方",
    en: "How young people in Taiwan use it on social media",
  },
  "card.newsLabel": { ja: "台湾ニュースで見る", en: "See it in Taiwanese news" },
  "card.newsHint": {
    ja: "新聞・報道での使われ方",
    en: "How it's used in newspapers and reporting",
  },
  "card.moeLabel": { ja: "教育部國語辭典簡編本", en: "MOE Concised Mandarin Dictionary" },
  "card.moeHint": {
    ja: "台湾教育部の公式辞書（定義・注音）",
    en: "Taiwan's official MOE dictionary (definitions, Zhuyin)",
  },
  // --- スキャン・カード詳細 ---
  "scan.cameraFailed": { ja: "カメラを起動できませんでした", en: "Couldn't start the camera" },
  "scan.cameraDenied": {
    ja: "カメラの使用が許可されていません。ブラウザの設定で許可するか、下の入力欄から言葉を調べられます。",
    en: "Camera access isn't allowed. Enable it in your browser settings, or look words up using the box below.",
  },
  "scan.cameraNotFound": {
    ja: "カメラが見つかりませんでした。下の入力欄から言葉を調べられます。",
    en: "No camera found. You can still look words up using the box below.",
  },
  "scan.cameraBusy": {
    ja: "カメラを他のアプリが使用中のようです。他のアプリを閉じて、もう一度お試しください。",
    en: "The camera seems to be in use by another app. Close it and try again.",
  },
  "scan.noVoice": {
    ja: "この端末は音声入力に対応していません。文字で入力してください。",
    en: "This device doesn't support voice input. Please type instead.",
  },
  "scan.noFrame": { ja: "フレームを取得できませんでした", en: "Couldn't grab a frame" },
  "scan.detectFailed": { ja: "検出に失敗しました", en: "Detection failed" },
  "scan.nothingFound": {
    ja: "文字が見つかりませんでした",
    en: "No words found",
  },
  "scan.nothingFoundHint": {
    ja: "看板やパッケージの中国語に近づけて、もう一度撮ってみてください。",
    en: "Get closer to some Chinese text (a sign or label) and scan again.",
  },
  "scan.detailFailed": { ja: "詳細検出に失敗しました", en: "Detailed detection failed" },
  "scan.partOf": { ja: "{word}（部品）", en: "{word} (part)" },
  "scan.detectMs": { ja: "検出 {ms}ms", en: "detect {ms}ms" },
  "scan.audioMs": { ja: "音声 {ms}ms", en: "audio {ms}ms" },
  "scan.whichOne": { ja: "どちらですか？", en: "Which one?" },
  "scan.foundDaysAgoBefore": {
    ja: "✨ {n}日前に調べた「",
    en: "✨ You looked this up {n} day(s) ago: ",
  },
  "scan.foundDaysAgoAfter": {
    ja: "」だ！撮って図鑑を完成させよう",
    en: " — shoot it to complete your dex",
  },
  "scan.ownedTag": { ja: "取得済み", en: "Collected" },
  "scan.verified": { ja: "✓ 検証済み", en: "✓ Verified" },
  "scan.aiUnverified": { ja: "AI生成・未検証", en: "AI generated · unverified" },
  "scan.playPron": { ja: "発音を再生", en: "Play pronunciation" },
  "scan.partsTitle": {
    ja: "この物体を構成する部品を追加検出",
    en: "Also detect the parts that make up this object",
  },
  "scan.analyzingParts": { ja: "解析中…", en: "Analyzing…" },
  "scan.finer": { ja: "細かく", en: "Finer" },
  "card.title": { ja: "カード", en: "Card" },
  "card.backToDex": { ja: "図鑑へ戻る", en: "Back to dex" },
  "card.notFound": { ja: "カードが見つかりませんでした。", en: "Card not found." },
  "card.notFoundHint": {
    ja: "削除されたか、リンクが古いのかもしれません。",
    en: "It may have been deleted, or the link is out of date.",
  },
  "card.flipSelfie": { ja: "自撮りを見る", en: "See the selfie" },
  "card.tapForSelfie": { ja: "タップで自撮りへ", en: "Tap for the selfie" },
  "card.seeAll": { ja: "すべての解説を見る", en: "See the full explanation" },
  "card.memoryCurve": { ja: "この単語の記憶曲線", en: "This word's memory curve" },
  "card.nextDue": { ja: "次回 {date}", en: "next {date}" },
  // --- 図鑑 ---
  "dex.desc": {
    ja: "あなたがキャッチした言葉だけの図鑑。撮ったものから自動でカテゴリーが生まれます。",
    en: "A dex of only the words you caught. Categories appear on their own from what you shoot.",
  },
  "dex.playPron": { ja: "「{word}」の発音を再生", en: 'Play the pronunciation of "{word}"' },
  "dex.seeOnMap": {
    ja: "「{word}」の場所を地図で見る",
    en: 'See where "{word}" was caught on the map',
  },
  // --- 品詞グループ ---
  "pos.noun": { ja: "📛 名詞", en: "📛 Nouns" },
  "pos.verb": { ja: "🏃 動詞", en: "🏃 Verbs" },
  "pos.adj": { ja: "🎨 形容詞", en: "🎨 Adjectives" },
  "pos.phrase": { ja: "💬 フレーズ", en: "💬 Phrases" },
  "pos.other": { ja: "✨ その他", en: "✨ Other" },
  // --- 図鑑カテゴリー ---
  // 絵文字はここに書かない。CATEGORY_META(lib/category.ts)が持つ —
  // ラベル文字列に混ぜてしまうと、絵文字だけ大きく出すといった扱いができない。
  "cat.fruit": { ja: "果物", en: "Fruit" },
  "cat.vegetable": { ja: "野菜", en: "Vegetables" },
  "cat.drink": { ja: "飲み物", en: "Drinks" },
  "cat.food": { ja: "食べ物", en: "Food" },
  "cat.dessert": { ja: "スイーツ", en: "Desserts" },
  "cat.vehicle": { ja: "乗り物", en: "Vehicles" },
  "cat.transport": { ja: "交通", en: "Transport" },
  "cat.animal": { ja: "動物", en: "Animals" },
  "cat.plant": { ja: "植物", en: "Plants" },
  "cat.flower": { ja: "花", en: "Flowers" },
  "cat.building": { ja: "建物", en: "Buildings" },
  "cat.street": { ja: "街並み", en: "Streets" },
  "cat.sign": { ja: "看板", en: "Signs" },
  "cat.shop": { ja: "お店", en: "Shops" },
  "cat.home": { ja: "家", en: "Home" },
  "cat.furniture": { ja: "家具", en: "Furniture" },
  "cat.appliance": { ja: "家電", en: "Appliances" },
  "cat.kitchenware": { ja: "調理器具", en: "Kitchenware" },
  "cat.tool": { ja: "道具", en: "Tools" },
  "cat.clothes": { ja: "服", en: "Clothes" },
  "cat.accessory": { ja: "アクセ", en: "Accessories" },
  "cat.shoes": { ja: "靴", en: "Shoes" },
  "cat.bag": { ja: "バッグ", en: "Bags" },
  "cat.jewelry": { ja: "ジュエリー", en: "Jewelry" },
  "cat.stationery": { ja: "文房具", en: "Stationery" },
  "cat.book": { ja: "本", en: "Books" },
  "cat.tech": { ja: "テック", en: "Tech" },
  "cat.gadget": { ja: "ガジェット", en: "Gadgets" },
  "cat.toy": { ja: "おもちゃ", en: "Toys" },
  "cat.game": { ja: "ゲーム", en: "Games" },
  "cat.sport": { ja: "スポーツ", en: "Sports" },
  "cat.instrument": { ja: "楽器", en: "Instruments" },
  "cat.nature": { ja: "自然", en: "Nature" },
  "cat.weather": { ja: "天気", en: "Weather" },
  "cat.sky": { ja: "空", en: "Sky" },
  "cat.water": { ja: "水", en: "Water" },
  "cat.mountain": { ja: "山", en: "Mountains" },
  "cat.body": { ja: "体の部位", en: "Body parts" },
  "cat.face": { ja: "顔", en: "Face" },
  "cat.hand": { ja: "手", en: "Hands" },
  "cat.clothing_part": { ja: "服の部分", en: "Clothing parts" },
  "cat.person": { ja: "人", en: "People" },
  "cat.family": { ja: "家族", en: "Family" },
  "cat.job": { ja: "仕事", en: "Work" },
  "cat.art": { ja: "アート", en: "Art" },
  "cat.decoration": { ja: "装飾", en: "Decoration" },
  "cat.character": { ja: "文字", en: "Characters" },
  "cat.symbol": { ja: "記号", en: "Symbols" },
  "cat.color": { ja: "色", en: "Colors" },
  "cat.shape": { ja: "形", en: "Shapes" },
  "cat.money": { ja: "お金", en: "Money" },
  "cat.document": { ja: "書類", en: "Documents" },
  "cat.medicine": { ja: "薬", en: "Medicine" },
  "cat.other": { ja: "その他", en: "Other" },
  // --- 読み込み失敗(空とは別の状態として扱う) ---
  "err.loadTitle": { ja: "読み込めませんでした", en: "Couldn't load" },
  "err.loadHint": {
    ja: "通信が不安定かもしれません。もう一度お試しください。",
    en: "The connection may be unstable. Please try again.",
  },
  "err.offlineTitle": { ja: "オフラインです", en: "You're offline" },
  "err.offlineHint": {
    ja: "電波が戻ったら、もう一度お試しください。",
    en: "Try again once you're back online.",
  },
  // 「何を」読み込めなかったかの名前。画面ごとに1つ。
  "err.whatWordCard": { ja: "この単語のカード", en: "this word's card" },
  "err.whatHome": { ja: "今日のページ", en: "today's page" },
  "err.whatDex": { ja: "図鑑", en: "your dex" },
  "err.whatMap": { ja: "地図", en: "the map" },
  "err.whatJournal": { ja: "日記", en: "your journal" },
  "err.whatSettings": { ja: "設定", en: "your settings" },
  "err.whatFeed": { ja: "みんなの投稿", en: "the feed" },
  "err.whatReview": { ja: "今日の復習", en: "today's review" },
  "err.retrying": { ja: "再試行中…", en: "Retrying…" },
  "err.retryingTitle": { ja: "もう一度読み込んでいます", en: "Trying again" },
  "err.retryingHint": { ja: "少しお待ちください。", en: "This should only take a moment." },
  "err.loadTitleOf": { ja: "{what}を読み込めませんでした", en: "Couldn't load {what}" },
  "err.retry": { ja: "もう一度", en: "Try again" },
  "dex.shelf": { ja: "棚", en: "Shelf" },
  "dex.shelfCount": { ja: "{n}", en: "{n}" },
  // --- 図鑑の部屋(棚のまとまり) ---
  "room.eat": { ja: "食べる", en: "Eat" },
  "room.town": { ja: "街", en: "Town" },
  "room.house": { ja: "家", en: "Home" },
  "room.wear": { ja: "身につける", en: "Wear" },
  "room.play": { ja: "学び・遊び", en: "Learn & play" },
  "room.nature": { ja: "自然", en: "Nature" },
  "room.people": { ja: "人・体", en: "People" },
  "room.marks": { ja: "しるし", en: "Marks" },
  // --- 集める・キャッチ・設定 ---
  "cap.pendingNotFound": {
    ja: "保存されていた写真が見つかりませんでした",
    en: "Couldn't find the saved photo",
  },
  "cap.photoReadFailed": {
    ja: "写真を読み込めませんでした。もう一度撮ってみてください。",
    en: "Couldn't read that photo. Please try taking it again.",
  },
  "cap.aiFailed": { ja: "AI処理に失敗しました", en: "AI processing failed" },
  "cap.aiFailedRetry": {
    ja: "AI処理に失敗しました。もう一度お試しください。",
    en: "AI processing failed. Please try again.",
  },
  "cap.cardFailed": { ja: "カード生成に失敗しました", en: "Couldn't build the card" },
  "cap.savedButLandingFailed": {
    ja: "図鑑には追加できました（演出の途中で問題が起きました）。",
    en: "It's in your dex — something went wrong during the animation.",
  },
  "cap.saveFailed": { ja: "保存に失敗しました", en: "Couldn't save" },
  "cap.recordFailed": { ja: "記録に失敗しました", en: "Couldn't record that" },
  "cap.photoTaken": { ja: "撮った写真", en: "The photo you took" },
  "cap.photoCutout": { ja: "切り抜いた写真", en: "Cut-out photo" },
  "cap.selfie": { ja: "自撮り", en: "Selfie" },
  "cap.wordPlaceholder": { ja: "例: 椅子", en: "e.g. 椅子" },
  "cap.reencBefore": { ja: "この言葉、", en: "You caught this word " },
  // **{date} が日本語から丸ごと抜けていた。** 「この言葉、にゲットしています。」
  // と、いつ撮ったのかが消えた文が出ていた(オーナーのスクリーンショット)。
  // 差し込み語の抜けは翻訳ファイルの中では目で気づけない。
  "cap.reencAt": { ja: "{date}に{place}で", en: "at {place} on {date}" },
  "cap.reencOn": { ja: "{date}に", en: "on {date}" },
  "cap.reencAfter": { ja: "ゲットしています。", en: "." },
  "cap.reunionNth": { ja: "再会{n}回目", en: "Reunion #{n}" },
  "photos.title": { ja: "この言葉に出会った記録", en: "Times you met this word" },
  "photos.count": { ja: "{n}枚", en: "{n} photos" },
  "photos.first": { ja: "はじめて", en: "First" },
  "photos.alt": { ja: "{n}回目に撮った写真", en: "Photo from meeting {n}" },
  "cap.reunionSaving": { ja: "この1枚を図鑑に足しています…", en: "Adding this photo to your dex…" },
  "cap.photoAdded": { ja: "この写真を単語に追加しました", en: "Photo added to this word" },
  "cap.nextReview": { ja: " · 次の復習: {date}", en: " · next review: {date}" },
  "sheet.catch": { ja: "キャッチ", en: "Catch" },
  "sheet.file": { ja: "図鑑へ収める", en: "Add to dex" },
  "sheet.landed": { ja: "図鑑に着地！", en: "Landed in your dex!" },
  "sheet.noWordInfo": { ja: "単語情報を取得できませんでした", en: "Couldn't get the word details" },
  "sheet.firstCatch": {
    ja: "はじめてのキャッチ！明日、この単語を覚えてるか聞くね",
    en: "Your first catch! Tomorrow I'll ask if you still remember it",
  },
  "sheet.reunion": {
    ja: "再会！自分の写真になりました✨",
    en: "Reunion! Now it's your own photo ✨",
  },
  "sheet.addedOne": { ja: "図鑑に1体増えました！", en: "One more in your dex!" },
  "sheet.cardAdded": { ja: "図鑑にカードが入りました！", en: "Card added to your dex!" },
  "sheet.addedGhostFree": {
    ja: "図鑑に入りました。実物に出会ったら金色に光ります！",
    en: "Added to your dex. It turns gold when you meet the real thing!",
  },
  "sheet.loading": { ja: "読み込み中…", en: "Loading…" },
  "sheet.reunionNotRecorded": {
    ja: "キャッチはできましたが、復習の記録に失敗しました。この語はまた出てきます。",
    en: "Caught it, but the review record didn't save — this word will come round again.",
  },
  "sheet.verified": { ja: "✓ 検証済み", en: "✓ Verified" },
  "sheet.aiMade": { ja: "AI生成", en: "AI generated" },
  "sheet.optional": { ja: "（任意）", en: "(optional)" },
  "sheet.noteLabel": { ja: "一言感想", en: "A quick note" },
  "sheet.notePlaceholder": {
    ja: "どこで見つけた？どんな気持ち？",
    en: "Where did you find it? How did it feel?",
  },
  "sheet.selfieLabel": { ja: "一緒に自撮り", en: "Selfie with it" },
  "sheet.retakeSelfie": { ja: "撮り直す", en: "Retake" },
  "sheet.addSelfie": { ja: "自撮りを追加", en: "Add a selfie" },
  "sheet.stopRepeat": { ja: "停止", en: "Stop" },
  "sheet.repeat": { ja: "聞こえたまま復唱する", en: "Repeat what you heard" },
  "sheet.inputPlaceholder": { ja: "例: 芒果 / 請稍等", en: "e.g. 芒果 / 請稍等" },
  "sheet.attached": { ja: "添付画像", en: "Attached image" },
  "sheet.webImage": { ja: "ネット検索の画像", en: "Image from the web" },
  "sheet.candidateN": { ja: "候補{n}", en: "Candidate {n}" },
  "sheet.scene": { ja: "シーン: {s}", en: "Scene: {s}" },
  "set.targetLangAria": { ja: "学習言語", en: "Target language" },
  "set.levelGoalAria": { ja: "目標レベル", en: "Target level" },
  "set.nativeAria": { ja: "母語", en: "Native language" },
  "set.uiLangAria": { ja: "表示言語", en: "App language" },
  "set.deleteWord": { ja: "削除", en: "DELETE" },
  "set.qualitySamples": {
    ja: "直近{n}回のスキャンから算出(仕様§9の合格ライン)",
    en: "Computed from your last {n} scans (spec §9 pass line)",
  },
  "set.placeLabel": { ja: "場所で思い出す", en: "Remember by place" },
  "set.placeChecking": { ja: "許可を確認しています…", en: "Checking permission…" },
  "set.placeHint": {
    ja: "前に単語を撮った場所の近くでアプリを開くと「ここで撮ったこれ覚えてる？」と知らせます。アプリを閉じている間は動きません。",
    en: "When you open the app near a place you caught a word, it reminds you: “remember this one?” It does not run while the app is closed.",
  },
  "set.placeUnsupported": {
    ja: "このブラウザでは通知を使えません。iPhone の場合は Safari の共有ボタンから「ホーム画面に追加」して、そのアイコンから開くとオンにできます。",
    en: "This browser can't use notifications. On iPhone, add the app to your Home Screen from Safari's share menu and open it from that icon.",
  },
  "set.placeDenied": {
    ja: "通知が拒否されています。端末の設定 → 通知 からこのアプリの通知を許可すると、ここでオンにできます。",
    en: "Notifications are blocked. Allow them for this app in your device settings, then turn this on again.",
  },
  "set.placeDismissed": {
    ja: "許可のダイアログが閉じられました。もう一度タップすると出ます。",
    en: "The permission dialog was dismissed. Tap again to show it.",
  },
  "set.placeError": {
    ja: "通知の許可を確認できませんでした。時間をおいてもう一度お試しください。",
    en: "Couldn't check notification permission. Please try again later.",
  },
  "set.aiProviderAria": { ja: "AI提供元", en: "AI provider" },
  "set.aiEffective": {
    ja: "提供元 {p} / 速い系 {f} / 詳しい系 {r}",
    en: "Provider {p} / fast {f} / rich {r}",
  },
  "set.keyMissing": { ja: "({env} 未設定)", en: "({env} not set)" },
  // --- ログイン・発音練習 ---
  "auth.tagline": {
    ja: "街で出会う言葉を、ステッカーに。",
    en: "Turn the words you meet into stickers.",
  },
  "auth.signin": { ja: "ログイン", en: "Sign in" },
  "auth.signup": { ja: "新規登録", en: "Sign up" },
  "auth.email": { ja: "メールアドレス", en: "Email" },
  "auth.password": { ja: "パスワード", en: "Password" },
  "auth.or": { ja: "または", en: "or" },
  "auth.google": { ja: "Googleでサインイン", en: "Sign in with Google" },
  "auth.apple": { ja: "Appleでサインイン", en: "Sign in with Apple" },
  "auth.agreeBefore": { ja: "続行すると、", en: "By continuing you agree to the " },
  "auth.terms": { ja: "利用規約", en: "Terms of Service" },
  "auth.agreeMid": { ja: "と", en: " and " },
  "auth.privacy": { ja: "プライバシーポリシー", en: "Privacy Policy" },
  "auth.agreeAfter": { ja: "に同意したものとみなします。", en: "." },
  "auth.confirmSent": {
    ja: "確認メールを送りました。受信トレイをご確認ください。",
    en: "Confirmation email sent — please check your inbox.",
  },
  "auth.failed": { ja: "サインインに失敗しました", en: "Sign-in failed" },
  "auth.googleFailed": { ja: "Googleサインインに失敗しました", en: "Google sign-in failed" },
  "auth.appleFailed": { ja: "Appleサインインに失敗しました", en: "Apple sign-in failed" },
  "pron.title": { ja: "発音練習", en: "Pronunciation practice" },
  "pron.noTts": {
    ja: "このブラウザは音声合成に対応していません",
    en: "This browser doesn't support speech synthesis",
  },
  "pron.noAsr": {
    ja: "このブラウザは音声認識に対応していません(iOS Safari / Chrome 推奨)",
    en: "This browser doesn't support speech recognition (try iOS Safari or Chrome)",
  },
  "pron.asrError": { ja: "認識エラー: {e}", en: "Recognition error: {e}" },
  "pron.playNatural": { ja: "自然な速度で再生", en: "Play at natural speed" },
  "pron.slow": { ja: "ゆっくり", en: "Slow" },
  "pron.stopRec": { ja: "録音停止", en: "Stop recording" },
  "pron.startRec": { ja: "発音を録音", en: "Record your pronunciation" },
  "pron.listeningBefore": { ja: "聞き取り中…「", en: "Listening… say “" },
  "pron.listeningAfter": { ja: "」と言ってみてください", en: "”" },
  "pron.yours": { ja: "あなたの発音", en: "Your pronunciation" },
  "pron.pressBefore": { ja: "マイクを押して「", en: "Tap the mic and say “" },
  "pron.pressAfter": { ja: "」と言ってみてください", en: "”" },
  "pron.score": { ja: "スコア", en: "Score" },
  // --- フィード・ホーム・プロフィール・オンボーディング・再設定・ルート ---
  "feed.title": { ja: "フィード", en: "Feed" },
  "feed.following": { ja: "フォロー中", en: "Following" },
  "feed.popular": { ja: "人気", en: "Popular" },
  "feed.emptyFollowing": { ja: "まだ投稿がありません", en: "No posts yet" },
  "feed.emptyPopular": { ja: "人気の投稿はまだありません", en: "No popular posts yet" },
  "feed.hintFollowing": {
    ja: "誰かをフォローするか、自分のカードをシェアしてみましょう。",
    en: "Follow someone, or share one of your own cards.",
  },
  "feed.hintPopular": { ja: "最初の投稿者になろう！", en: "Be the first to post!" },
  "feed.postFromDex": { ja: "図鑑から投稿", en: "Post from your dex" },
  "feed.like": { ja: "いいね", en: "Like" },
  "feed.likeFailed": {
    ja: "いいねできませんでした。もう一度お試しください。",
    en: "Couldn't update your like. Please try again.",
  },
  "home.waitingPhoto": { ja: "解析待ちの写真", en: "Photo waiting to be analyzed" },
  "home.bgPaper": { ja: "紙", en: "Paper" },
  "home.bgFrame": { ja: "額", en: "Frame" },
  "home.bgNotebook": { ja: "ノート", en: "Notebook" },
  "home.bgCork": { ja: "コルク", en: "Cork" },
  "user.profile": { ja: "プロフィール", en: "Profile" },
  "user.loading": { ja: "読み込み中…", en: "Loading…" },
  "user.loadFailed": {
    ja: "プロフィールを読み込めませんでした",
    en: "Couldn't load this profile",
  },
  "user.since": { ja: "{date} から", en: "since {date}" },
  "user.avatarOf": { ja: "{name}のアバター", en: "{name}'s avatar" },
  "user.statDex": { ja: "図鑑", en: "Dex" },
  "user.statPosts": { ja: "投稿", en: "Posts" },
  "user.statFollowers": { ja: "フォロワー", en: "Followers" },
  "user.statFollowing": { ja: "フォロー中", en: "Following" },
  "user.editProfile": { ja: "プロフィールを編集", en: "Edit profile" },
  "user.follow": { ja: "フォローする", en: "Follow" },
  "user.recentCatches": { ja: "最近のキャッチ", en: "Recent catches" },
  "user.noCatches": { ja: "まだキャッチがありません", en: "No catches yet" },
  "user.someone": { ja: "ユーザー", en: "User" },
  "err.failed": { ja: "失敗しました", en: "Something went wrong" },
  "ob.title": { ja: "かざして、タップしてみて", en: "Point it, then tap" },
  "ob.line1": {
    ja: "街で見たものにカメラをかざすと、",
    en: "Aim your camera at something on the street and",
  },
  "ob.line2before": { ja: "その単語と発音が", en: "you'll see the word and how to say it " },
  "ob.line2strong": { ja: "瞬間的に", en: "instantly" },
  "ob.line2after": { ja: "分かります。", en: "." },
  "ob.f1": { ja: "かざす = 調べる（無制限）", en: "Point = look it up (unlimited)" },
  "ob.f2": { ja: "タップ = 発音が聞こえる", en: "Tap = hear it spoken" },
  "ob.f3": { ja: "撮る = 自分の図鑑に残る", en: "Shoot = keep it in your dex" },
  "ob.start": { ja: "スキャンをはじめる", en: "Start scanning" },
  "ob.privacy": {
    ja: "カメラは「見たものの単語を教えるため」だけに使います",
    en: "The camera is only used to tell you the word for what you see",
  },
  "ob.learner": { ja: "学習者", en: "Learner" },
  "ob.startFailed": { ja: "開始に失敗しました", en: "Could not get started" },
  "rp.title": { ja: "パスワード再設定", en: "Reset password" },
  "rp.hintRequest": {
    ja: "登録メールアドレスにリンクを送ります。",
    en: "We'll email a link to your registered address.",
  },
  "rp.hintUpdate": { ja: "新しいパスワードを入力してください。", en: "Enter your new password." },
  "rp.email": { ja: "メールアドレス", en: "Email" },
  "rp.sendLink": { ja: "再設定リンクを送る", en: "Send reset link" },
  "rp.newPassword": { ja: "新しいパスワード", en: "New password" },
  "rp.update": { ja: "パスワードを更新", en: "Update password" },
  "rp.backToLogin": { ja: "ログイン画面に戻る", en: "Back to sign in" },
  "rp.sent": {
    ja: "再設定リンクをメールで送りました。",
    en: "Reset link sent — check your email.",
  },
  "rp.sendFailed": { ja: "送信に失敗しました", en: "Could not send" },
  "rp.updated": { ja: "パスワードを更新しました。", en: "Password updated." },
  "rp.updateFailed": { ja: "更新に失敗しました", en: "Could not update" },
  "root.notFound": { ja: "ページが見つかりません", en: "Page not found" },
  "root.notFoundHint": {
    ja: "指定されたページは存在しないか、移動された可能性があります。",
    en: "This page doesn't exist, or it may have moved.",
  },
  "root.toHome": { ja: "ホームへ", en: "Go home" },
  "root.loadFailed": { ja: "読み込みに失敗しました", en: "Failed to load" },
  "root.loadFailedHint": {
    ja: "少し時間を置いてもう一度お試しください。",
    en: "Please wait a moment and try again.",
  },
  "root.retry": { ja: "再試行", en: "Retry" },
  // --- 発見・投稿・日記 ---
  "discover.title": { ja: "発見", en: "Discover" },
  "discover.search": {
    ja: "ユーザー名 / 単語 / 意味で検索",
    en: "Search users, words or meanings",
  },
  "discover.ranking": { ja: "ランキング", en: "Leaderboard" },
  "discover.rankingEmpty": {
    ja: "まだランキングデータがありません。",
    en: "No leaderboard data yet.",
  },
  "discover.stats": { ja: "{words} 単語 · {posts} 投稿", en: "{words} words · {posts} posts" },
  "discover.users": { ja: "ユーザー", en: "Users" },
  "discover.noUsers": { ja: "該当ユーザーなし", en: "No matching users" },
  "discover.words": { ja: "単語", en: "Words" },
  "discover.noWords": { ja: "該当単語なし", en: "No matching words" },
  "common.anon": { ja: "名無し", en: "Anonymous" },
  "post.title": { ja: "投稿", en: "Post" },
  "post.toFeed": { ja: "フィードへ", en: "Back to feed" },
  "post.notFound": { ja: "投稿が見つかりませんでした。", en: "Post not found." },
  "post.comments": { ja: "コメント", en: "Comments" },
  "post.firstComment": { ja: "最初のコメントを投稿しよう。", en: "Be the first to comment." },
  "post.writeComment": { ja: "コメントを書く…", en: "Write a comment…" },
  "post.sendComment": { ja: "コメントを送信", en: "Send comment" },
  "journal.title": { ja: "日記", en: "Journal" },
  "journal.today": { ja: "今日の日記", en: "Today's entry" },
  "journal.intro": {
    ja: "今日撮った写真をもとに、学習している言語で書いてみよう。AIが添削して、その気持ちをネイティブが使う自然なフレーズと「型」の解説も教えてくれます。",
    en: "Write about a photo you took today, in the language you're learning. AI corrects it and shows the natural phrasing and sentence patterns a native would use.",
  },
  "journal.placeholder": { ja: "例: 今天早上我去咖啡店…", en: "e.g. 今天早上我去咖啡店…" },
  "journal.correcting": { ja: "添削中…", en: "Reviewing…" },
  "journal.askCorrect": { ja: "AIに添削してもらう", en: "Ask AI to review" },
  "journal.corrected": { ja: "✦ 添削後", en: "✦ Corrected" },
  "journal.patterns": { ja: "型と解説", en: "Patterns & notes" },
  "journal.leftover": {
    ja: "{d} の書きかけが残っています:「{s}…」",
    en: "Unfinished writing from {d}: “{s}…”",
  },
  "journal.leftoverRestore": { ja: "戻す", en: "Restore" },
  "journal.keptOnDevice": {
    ja: "書いたものはこの端末に控えてあります。添削が通らなくても消えません。",
    en: "Your writing is kept on this device — it won't be lost if the check fails.",
  },
  "journal.loadFailedNote": {
    ja: "これまでの日記を読み込めませんでした。今日の書きかけがあっても表示できていないので、このまま送ると上書きになります。",
    en: "Couldn't load your journal. If you had a draft for today, it isn't shown — sending now will overwrite it.",
  },
  "journal.past": { ja: "過去の日記", en: "Past entries" },
  "journal.nativeWould": { ja: "ネイティブならこう言う", en: "A native would say" },
  "journal.done": { ja: "添削できました", en: "Review complete" },
  "journal.failed": { ja: "添削失敗", en: "Review failed" },
  // --- 通知・相対時刻 ---
  "ago.seconds": { ja: "{n}秒前", en: "{n}s ago" },
  "ago.minutes": { ja: "{n}分前", en: "{n}m ago" },
  "ago.hours": { ja: "{n}時間前", en: "{n}h ago" },
  "ago.days": { ja: "{n}日前", en: "{n}d ago" },
  "ago.months": { ja: "{n}ヶ月前", en: "{n}mo ago" },
  "ago.years": { ja: "{n}年前", en: "{n}y ago" },
  "notif.title": { ja: "通知", en: "Notifications" },
  "notif.empty": { ja: "まだ通知はありません", en: "No notifications yet" },
  "notif.liked": { ja: "さんがいいねしました", en: " liked your post" },
  "notif.commented": { ja: "さんがコメントしました", en: " commented on your post" },
  "notif.followed": { ja: "さんがフォローしました", en: " followed you" },
  "common.someone": { ja: "誰か", en: "Someone" },
  // --- 場所の思い出し(文の前後) ---
  "place.rememberBefore": { ja: "「", en: "Remember “" },
  "place.rememberAfter": { ja: "」覚えてる？", en: "”?" },
  // --- 場所の思い出し・共通 ---
  "place.remember": { ja: "「{word}」覚えてる？", en: 'Remember "{word}"?' },
  "place.caughtHere": {
    ja: "{when}、{where}撮った言葉{meaning}",
    en: "A word you caught {where} {when}{meaning}",
  },
  "place.hereAbouts": { ja: "この辺りで", en: "around here" },
  "place.atPlace": { ja: "{name}で", en: "at {name}" },
  "place.yearsAgo": { ja: "{n}年前", en: "{n} year(s) ago" },
  "place.monthsAgo": { ja: "{n}ヶ月前", en: "{n} month(s) ago" },
  "place.daysAgo": { ja: "{n}日前", en: "{n} day(s) ago" },
  "common.card": { ja: "カード", en: "Card" },
  "common.closeEdit": { ja: "編集を閉じる", en: "Close editing" },
  "common.photoOf": { ja: "「{word}」の写真", en: 'Photo of "{word}"' },
  "common.imageOf": { ja: "「{word}」の画像", en: 'Image for "{word}"' },
  "common.stickerOf": { ja: "「{word}」のステッカー", en: 'Sticker for "{word}"' },
  "common.memoryOf": { ja: "「{word}」の思い出", en: 'Memory of "{word}"' },
  "common.mapTitle": { ja: "撮影場所のマップ", en: "Map of where it was taken" },
  "common.shotHere": { ja: "撮影地", en: "Where it was taken" },
  "common.selfieOf": { ja: "撮影者の自撮り", en: "Selfie of the person who caught it" },
  "detail.more": { ja: "詳しく", en: "details" },
  "detail.preparing": { ja: "詳しい解説を準備中…", en: "Preparing the full explanation…" },
  // 出所は**人の言葉で**。以前は「✓ 検証済み辞書 + AI詳細 · 点 0.92」で、
  // 0.92 はモデルの confidence(内部の数値)がそのまま漏れていた。
  // 学習者にとって意味が無く、「点」が何の点かも示していない(独立監査)。
  "detail.verified": { ja: "辞書で確認済み", en: "Checked against the dictionary" },
  "detail.aiOnly": {
    ja: "AIが作成（誤りがあるかもしれません）",
    en: "Written by AI — may contain mistakes",
  },
  "err.generateFailed": { ja: "生成に失敗しました", en: "Could not generate" },
  // --- ワードツリー・画像選択 ---
  "tree.title": { ja: "ワードツリー", en: "Word tree" },
  "tree.branches": {
    ja: "枝 {done}/{total} 本 · 復習ごとに1本育つ",
    en: "{done} of {total} branches · one grows per review",
  },
  "tree.locked": { ja: "あと{n}本 · 復習で解禁", en: "{n} more · unlocked by reviewing" },
  "tree.tapHint": {
    ja: "枝をタップすると、その言葉を新しい木としてキャッチできます",
    en: "Tap a branch to catch that word as a new tree",
  },
  "tree.collocation": { ja: "つながり", en: "Goes with" },
  "tree.example": { ja: "例文", en: "Example" },
  "tree.synonym": { ja: "類義", en: "Similar" },
  "tree.antonym": { ja: "反義", en: "Opposite" },
  "img.searchFor": { ja: "「{q}」の画像を探す", en: 'Find images for "{q}"' },
  "img.ownPhoto": { ja: "自分の写真", en: "My photo" },
  "img.notFound": {
    ja: "画像が見つかりませんでした。別のキーワードで試すか、自分の写真をアップロードしてください。",
    en: "No images found. Try another keyword, or upload your own photo.",
  },
  "img.candidate": { ja: "候補", en: "Candidate" },
  // --- 忘却曲線 ---
  "curve.empty": {
    ja: "まだ復習データがありません。復習すると忘却曲線がここに表示されます。",
    en: "No review data yet. Review this word and its forgetting curve will appear here.",
  },
  "curve.nowPct": { ja: "今 {pct}%", en: "now {pct}%" },
  "curve.retention": { ja: "記憶率", en: "Retention" },
  "curve.days": { ja: "{n}日", en: "day {n}" },
  "curve.youAreHere": { ja: "今ココ", en: "You are here" },
  // --- bottom nav ---
  "nav.home": { ja: "ホーム", en: "Home" },
  "nav.dex": { ja: "図鑑", en: "Dex" },
  "nav.camera": { ja: "カメラ", en: "Camera" },
  "nav.review": { ja: "復習", en: "Review" },
  "nav.settings": { ja: "設定", en: "Settings" },
  // --- page titles ---
  "title.home": { ja: "ホーム", en: "Home" },
  "title.dex": { ja: "図鑑", en: "Dex" },
  "title.review": { ja: "復習", en: "Review" },
  "title.settings": { ja: "設定", en: "Settings" },
  "title.capture": { ja: "集める", en: "Catch" },
  // --- review ---
  "review.today": { ja: "きょうの復習", en: "Today's review" },
  "review.speak": { ja: "🎤 話す", en: "🎤 Speak" },
  "review.choice": { ja: "👆 4択", en: "👆 Quiz" },
  // --- dex ---
  "dex.yours": { ja: "あなたの図鑑", en: "Your dex" },
  "dex.found": { ja: "見つけた", en: "Found" },
  "dex.caught": { ja: "捕まえた", en: "Caught" },
  "dex.search": { ja: "単語・読み・意味で検索", en: "Search word / reading / meaning" },
  "dex.category": { ja: "カテゴリ", en: "Category" },
  "dex.pos": { ja: "品詞", en: "Part of speech" },
  // --- settings ---
  "settings.profile": { ja: "プロフィール", en: "Profile" },
  "settings.displayName": { ja: "表示名", en: "Display name" },
  "settings.language": { ja: "言語", en: "Language" },
  "settings.targetLang": { ja: "学習言語", en: "Target language" },
  "settings.levelGoal": { ja: "目標レベル", en: "Target level" },
  "settings.currentLevel": { ja: "今のレベル", en: "Current level" },
  "settings.levelHint": {
    ja: "単語の解説・例文・復習の語彙は「今のレベル〜目標レベル」に合わせて作られます。",
    en: "Explanations, examples and review vocabulary are generated within your current-to-target level range.",
  },
  "settings.nativeLang": { ja: "母語", en: "Native language" },
  "settings.uiLang": { ja: "表示言語", en: "App language" },
  "settings.phonetic": { ja: "発音表記", en: "Phonetic notation" },
  "settings.study": { ja: "学習設定", en: "Study settings" },
  // 見え方は3つ。名前 + 一言で、何が変わるかを開く前に言う。
  "settings.feel": { ja: "音と手ざわり", en: "Sound & haptics" },
  "settings.soundLevel": { ja: "効果音", en: "Sound effects" },
  "settings.soundOff": { ja: "オフ", en: "Off" },
  "settings.soundSubtle": { ja: "控えめ", en: "Subtle" },
  "settings.soundFull": { ja: "しっかり", en: "Full" },
  "settings.haptics": { ja: "振動", en: "Haptics" },
  "settings.hapticsHint": {
    ja: "キャッチや着地に合わせて短く震えます。",
    en: "A short buzz when a word lands in the dex.",
  },
  "settings.feelInstantHint": {
    ja: "選ぶとすぐ保存されます（下の「保存」は不要）。",
    en: "Saved the moment you pick — no need to press Save.",
  },
  "settings.appearance": { ja: "外観", en: "Appearance" },
  "settings.theme": { ja: "テーマ", en: "Theme" },
  "settings.save": { ja: "保存", en: "Save" },
  "settings.saving": { ja: "保存中…", en: "Saving..." },
  "settings.saved": { ja: "保存しました", en: "Saved" },
  "settings.signout": { ja: "サインアウト", en: "Sign out" },
  // --- capture ---
  "capture.photoTitle": { ja: "写真で集める", en: "Catch with a photo" },
  "capture.photoHint": {
    ja: "街で見つけたモノにカメラを向けてみてください。",
    en: "Point your camera at something you found.",
  },
  "capture.tapToShoot": { ja: "タップして撮影", en: "Tap to shoot" },
  "capture.typeWord": { ja: "単語を文字で入力", en: "Type a word instead" },
  "capture.openScan": { ja: "かざして調べる（スキャン）", en: "Hold up to look up (scan)" },
  "capture.or": { ja: "または", en: "or" },
  // --- scan ---
  "scan.button": { ja: "スキャン", en: "Scan" },
  "scan.again": { ja: "もう一度", en: "Retake" },
  "scan.rescan": { ja: "再スキャン", en: "Scan again" },
  "scan.found": { ja: "見つかった単語", en: "Words found" },
  "scan.searchPlaceholder": {
    ja: "候補に無い？日本語で調べる(例: マンゴー)",
    en: "Not listed? Search in your language (e.g. mango)",
  },
  "scan.searchGo": { ja: "調べる", en: "Search" },
  "scan.voiceLabel": { ja: "聞こえた言葉を声で調べる", en: "Search by voice" },
  "scan.owned": { ja: "取得済み", en: "Collected" },
  "scan.reunion": { ja: "未撮影", en: "No photo yet" },
  "scan.catch": { ja: "キャッチ", en: "Catch" },
  "scan.analyzing": { ja: "AIが分析中…", en: "AI is analyzing…" },
  "scan.zoom": { ja: "ズーム", en: "Zoom" },
  "scan.listening": { ja: "聞き取り中…", en: "Listening…" },
  "scan.speakNow": { ja: "話しかけてください", en: "Speak now" },
  // --- review extras ---
  "review.modeSaveFailed": {
    ja: "出題形式の変更を保存できませんでした。通信を確かめてもう一度お試しください。",
    en: "Couldn't save the review mode. Check your connection and try again.",
  },
  "review.cappedTitle": { ja: "今日の分は終わりです", en: "That's today's batch" },
  "review.cappedHint": {
    ja: "1日 {n} 枚に設定しています。まだ復習したい語は残っていますが、明日また出します。もっとやりたいときは設定で枚数を増やせます。",
    en: "You've set a limit of {n} a day. There are more waiting — they'll come back tomorrow. Raise the limit in Settings if you want more now.",
  },
  "review.cappedCta": { ja: "設定で枚数を変える", en: "Change the limit" },
  "review.empty": { ja: "今日復習する単語はありません。", en: "Nothing to review today." },
  "review.emptyHint": {
    ja: "新しい単語をキャッチすると、10分後に最初の復習が出ます。",
    en: "Catch a new word and its first review appears 10 minutes later.",
  },
  "review.goCatch": { ja: "撮りに行く", en: "Go catch one" },
  // 「ノルマ」は課された量という含意が強く、達成を祝う語ではない(独立監査)。
  "review.doneTitle": { ja: "今日の復習、終わりました", en: "Today's review is done" },
  "review.doneScore": { ja: "{n}問中{c}問が正解", en: "{c} of {n} correct" },
  "review.doneHint": { ja: "また明日の復習で会いましょう。", en: "See you in tomorrow's review." },
  "review.again": { ja: "もう少し続ける", en: "Keep going" },
  "review.toDex": { ja: "図鑑を見る", en: "Open the shelf" },
  "review.quizTag": { ja: "4択クイズ", en: "Multiple choice" },
  "review.whichIs": { ja: "はどれ？", en: "— which one?" },
  "review.correct": { ja: "正解！", en: "Correct!" },
  "review.tryAgain": { ja: "もう一度覚えよう", en: "Let's learn it again" },
  "review.next": { ja: "次へ", en: "Next" },
  "review.speakTag": { ja: "はなす", en: "Speak" },
  "review.roleplayTag": { ja: "ロールプレイ", en: "Role-play" },
  "review.hint": { ja: "ヒント", en: "Hint" },
  "review.hintUsed": { ja: "ヒント使用", en: "Hint used" },
  "review.skip": { ja: "スキップ", en: "Skip" },
  "review.submit": { ja: "送信してフィードバック", en: "Get feedback" },
  "review.grading": { ja: "AIが添削中…", en: "AI is reviewing…" },
  // --- memory ---
  "memory.level0": { ja: "忘れかけ", en: "Fading" },
  "memory.level1": { ja: "あやうい", en: "Shaky" },
  "memory.level2": { ja: "うろ覚え", en: "Fuzzy" },
  "memory.level3": { ja: "定着中", en: "Settling" },
  "memory.level4": { ja: "覚えた", en: "Learned" },
  "memory.level5": { ja: "長期記憶", en: "Long-term" },
  "memory.bestReview": { ja: "ベスト復習", en: "Best review" },
  "memory.forgetIn": { ja: "50%を切る", en: "Drops below 50%" },
  "memory.nextDue": { ja: "次の出題", en: "Next due" },
  "memory.reviews": { ja: "復習", en: "Reviews" },
  "memory.times": { ja: "回", en: "×" },
  "memory.today": { ja: "今日", en: "Today" },
  "memory.daysLater": { ja: "日後", en: "d later" },
  // --- word card sections ---
  "card.meaning": { ja: "意味", en: "Meaning" },
  "card.web_images": { ja: "ネットの画像", en: "Images from the web" },
  "card.usage_context": { ja: "頻度・使う場面", en: "Frequency & where it's used" },
  "card.example": { ja: "例文", en: "Example" },
  "card.examples_extra": { ja: "追加の例文", en: "More examples" },
  "card.usage_chunks": { ja: "使い方チャンク", en: "Usage chunks" },
  "card.measure_words": { ja: "量詞", en: "Measure words" },
  "card.related_words": { ja: "にてる言葉・関連語", en: "Similar & related words" },
  "card.fillTitle": { ja: "このカードはまだ途中です", en: "This card isn't finished yet" },
  "card.fillBody": {
    ja: "{n}項目がまだありません。まとめて作れます。",
    en: "{n} sections are still missing. You can fill them all at once.",
  },
  "card.fillCta": { ja: "カードを仕上げる", en: "Finish this card" },
  "card.filling": { ja: "作っています…", en: "Writing it…" },
  "card.fillFailed": {
    ja: "うまく作れませんでした。通信を確かめて、もう一度お試しください。",
    en: "Couldn't write it. Check your connection and try again.",
  },
  "card.fillRetry": { ja: "もう一度ためす", en: "Try again" },
  "card.quick_facts": { ja: "ひと目でわかる", en: "At a glance" },
  "card.pronunciation_tips": { ja: "発音のコツ", en: "Pronunciation tips" },
  "card.etymology": { ja: "語源・部首", en: "Origin & radicals" },
  "card.mnemonic": { ja: "覚え方", en: "Memory hook" },
  "card.taiwan_note": { ja: "台湾メモ", en: "Taiwan note" },
  "card.real_usage": { ja: "実際の使われ方", en: "Seen in the wild" },
  "card.sections": { ja: "表示する項目と順番", en: "Sections & order" },
  "card.regen": { ja: "この項目をAIで作り直す(Pro)", en: "Regenerate this section (Pro)" },
  "card.frequency": { ja: "頻度", en: "Frequency" },
  "card.synonym": { ja: "類義", en: "Similar" },
  "card.antonym": { ja: "反義", en: "Opposite" },
  "card.relatedTag": { ja: "関連", en: "Related" },
  "card.radicals": { ja: "部首", en: "Radicals" },
  "card.noImages": { ja: "画像が見つかりませんでした。", en: "No images found." },
  "card.searchGoogle": { ja: "Google画像検索で見る", en: "See on Google Images" },
  "card.delete": { ja: "削除", en: "Delete" },
  "card.deleteConfirm": { ja: "もう一度タップで削除", en: "Tap again to delete" },
  "card.changePhoto": { ja: "写真を変更", en: "Change photo" },
  "card.report": { ja: "報告", en: "Report" },
  "card.reportWhat": { ja: "どこが違う？", en: "What's wrong?" },
  "card.reportThanks": { ja: "🙏 報告ありがとうございます", en: "🙏 Thanks for reporting" },
  "card.regenAll": { ja: "✨ 解説を再生成", en: "✨ Regenerate details" },
  "card.regenPro": { ja: "解説の再生成は Pro 限定", en: "Regenerating details is Pro-only" },
  "card.preparing": { ja: "詳しい解説をAIが準備中…", en: "AI is preparing the details…" },
  "card.enrichFailed": {
    ja: "詳しい解説を作れませんでした",
    en: "Couldn't generate the details",
  },
  "card.enrichRetry": { ja: "もう一度ためす", en: "Try again" },
  // --- home ---
  "home.emptyTitle": { ja: "きょうのページはまだ白紙です。", en: "Today's page is still blank." },
  "home.emptyHint": {
    ja: "街の看板やメニューにカメラをかざすと、最初の一枚がここに貼られます。",
    en: "Point your camera at a sign or menu and your first photo lands here.",
  },
  "home.emptyCta": { ja: "街でひとつ見つける", en: "Find one outside" },
  "home.journal": { ja: "今日の日記を書く", en: "Write today's journal" },
  // 日本語の画面に英語の飾り文字を置かない(日付の見出しと同じ理由)。
  "home.pastPages": { ja: "これまでのページ", en: "Past Pages" },
  "home.memories": { ja: "枚の思い出", en: "memories caught" },
  "home.noPhotoYet": { ja: "写真はまだありません", en: "No photo yet" },
  "home.background": { ja: "背景", en: "Background" },
  // --- common ---
  "common.close": { ja: "閉じる", en: "Close" },
  "common.loading": { ja: "読み込み中", en: "Loading" },
  "scan.cuttingOut": { ja: "AIが切り抜き中…", en: "AI is cutting it out…" },
  "scan.justAMoment": { ja: "少しだけ待ってね", en: "Just a moment" },
  "common.cancel": { ja: "キャンセル", en: "Cancel" },
  "common.retry": { ja: "もう一度", en: "Retry" },
  // --- word card (extra) ---
  "card.notYet": { ja: "まだ作られていません", en: "Not generated yet" },
  "card.generate": { ja: "作る", en: "Generate" },
  "card.flipToSelfie": { ja: "タップで自撮りへ", en: "Tap to flip to selfie" },
  "card.flipBack": { ja: "タップで戻る", en: "Tap to flip back" },
  "card.selfie": { ja: "自撮り", en: "Selfie" },
  "card.noSelfie": { ja: "自撮りはまだありません", en: "No selfie yet" },
  "card.changePhotoConfirm": { ja: "この写真を変更しますか？", en: "Change this photo?" },
  "card.replacePhotoConfirm": {
    ja: "いまの写真を、この画像に差し替えますか？元には戻せません。",
    en: "Replace the current photo with this image? This can't be undone.",
  },
  "card.deleteConfirmDialog": {
    ja: "本当に削除しますか？この操作は取り消せません。",
    en: "Delete this card? This cannot be undone.",
  },
  "card.deleteFailed": { ja: "削除に失敗しました。", en: "Could not delete." },
  "card.photoFailed": { ja: "画像の変更に失敗しました。", en: "Could not change the photo." },
  "card.pickAnotherImage": {
    ja: "この画像が違うときは、別の画像を選べます",
    en: "Not the right picture? Pick another one",
  },
  "card.findingImage": {
    ja: "🌐 画像をネットから探しています…",
    en: "🌐 Finding an image online…",
  },
  "card.regenerating": { ja: "再生成中…", en: "Regenerating…" },
  "card.reportPrompt": {
    ja: "意味や発音が変？報告してAIに直させる",
    en: "Wrong meaning or reading? Report and let AI fix it",
  },
  "card.reportFixing": { ja: "AIが作り直し中…", en: "AI is rebuilding…" },
  "card.reportDone": {
    ja: "報告ありがとう。AIが作り直しました",
    en: "Thanks — AI rebuilt this card",
  },
  "card.reportFailed": { ja: "報告に失敗しました", en: "Could not send the report" },
  "card.otherImages": { ja: "別の画像", en: "Other images" },
  "card.useThisImage": { ja: "この画像にする", en: "Use this image" },
  "card.imageSet": { ja: "画像を変更しました", en: "Photo updated" },
  "card.openMap": { ja: "地図で開く", en: "Open in Maps" },
  "card.openGoogleMaps": { ja: "Google マップで開く →", en: "Open in Google Maps →" },
  "card.photoSpot": { ja: "撮影地", en: "Where it was caught" },
  // --- input catch ---
  "input.title": { ja: "入力キャッチ", en: "Type / speak a word" },
  "input.lead": {
    ja: "授業で習った・聞こえた・動画で見た言葉を、写真がなくても図鑑に。",
    en: "Add a word you heard in class or saw in a video — no photo needed.",
  },
  "input.listening": {
    ja: "聞き取り中… 聞こえたフレーズを自分の声で復唱しよう",
    en: "Listening… repeat the phrase you heard",
  },
  "input.micHint": {
    ja: "マイクで復唱するか、下の欄で認識結果を直せます",
    en: "Speak, or fix the text below",
  },
  "input.textHint": {
    ja: "台湾華語でも日本語でもOK（日本語は自動で台湾華語に変換されます）",
    en: "Type in Mandarin or your own language — we'll convert it",
  },
  "input.word": { ja: "単語", en: "Word" },
  "input.phrase": { ja: "フレーズ", en: "Phrase" },
  "input.scene": {
    ja: "シーン: どこで・誰が・何と言った？（任意）",
    en: "Scene: where / who / what was said (optional)",
  },
  "input.lookup": { ja: "調べてカードにする", en: "Look up & make a card" },
  "input.looking": { ja: "辞書とAIが調べています…", en: "Checking the dictionary and AI…" },
  "input.sceneWord": {
    ja: "どんな場面で見た？(例: トイレに置いてあった)",
    en: "Where did you see it? (e.g. it was in the bathroom)",
  },
  "input.chooseTitle": { ja: "どれのことですか？", en: "Which one do you mean?" },
  "input.chooseHint": {
    ja: "「{q}」は台湾華語ではいくつかの語に分かれます。",
    en: "\u201c{q}\u201d maps to several different Mandarin words.",
  },
  "input.chooseBack": { ja: "書き直す", en: "Edit what I typed" },
  "input.notTargetLang": {
    ja: "台湾華語の単語が見つかりませんでした。別の言い方で調べてみてください。",
    en: "Couldn't find a Mandarin word for that. Try describing it differently.",
  },
  "input.attach": { ja: "画像を添付（任意）", en: "Attach an image (optional)" },
  "input.attachChange": { ja: "タップで自分の画像に変更", en: "Tap to use your own photo" },
  "input.autoImage": {
    ja: "画像はネット検索から自動で入ります。下の候補タップでワンタッチ変更",
    en: "An image is added automatically from the web — tap a thumbnail to swap",
  },
  "input.noImageOk": {
    ja: "画像なしでもOK。あとから詳細画面で選び直せます",
    en: "No image is fine — you can pick one later from the card",
  },
  "input.save": { ja: "図鑑に入れる", en: "Add to the dex" },
  "input.saveHint": {
    ja: "実物に出会ってスキャンすると金色に光り、撮影で図鑑が完成します。",
    en: "Scan the real thing later and this card turns gold.",
  },
  "input.verified": { ja: "✓ 検証済み", en: "✓ Verified" },
  "input.aiGenerated": { ja: "AI生成", en: "AI-generated" },
  "input.replies": { ja: "返し方の例", en: "How to reply" },
  // --- dex view labels ---
  "dex.gallery": { ja: "ギャラリー表示", en: "Gallery view" },
  "dex.list": { ja: "リスト表示", en: "List view" },
  "dex.map": { ja: "地図表示", en: "Map view" },
  "dex.searchAria": { ja: "図鑑を検索", en: "Search the dex" },
  "dex.clearFilter": { ja: "絞り込みを解除", en: "Clear filter" },
  "dex.clearSearch": { ja: "検索をクリア", en: "Clear search" },
  "dex.noMatch": { ja: "に一致する単語はありません。", en: "— no matching words." },
  "dex.emptyTitle": { ja: "まだ何もキャッチしていません。", en: "Nothing caught yet." },
  "dex.emptyHint": {
    ja: "街で見かけた言葉にカメラをかざすと、ここに図鑑が育ちます。",
    en: "Point the camera at words around you and your dex starts growing.",
  },
  "dex.emptyCta": { ja: "最初の一枚を撮る", en: "Take your first photo" },
  "dex.placesTitle": { ja: "キャッチした場所", en: "Where you caught them" },
  "dex.placesHint": {
    ja: "写真をタップで地図がその場所へズーム。地図上の丸い写真をタップで単語の詳細へ。",
    en: "Tap a photo to zoom the map there. Tap a round photo on the map to open the word.",
  },
  "dex.withLocation": { ja: "場所付きの単語", en: "Words with a location" },
  "dex.mapUnavailable": {
    ja: "地図の連携が完了していません。",
    en: "Maps are not configured yet.",
  },
  "dex.items": { ja: "件", en: "spots" },
  // --- settings (admin) ---
  "settings.devOnly": {
    ja: "開発者専用（あなたにしか表示されません）",
    en: "Developer only (visible to you alone)",
  },
  "settings.themeCompare": { ja: "UIテーマを比較", en: "Compare UI themes" },
  "settings.themeHint": {
    ja: "タップで即切り替わります。「現行」に戻せばいつでも元のデザインです。",
    en: "Tap to switch instantly. Pick “Current” to go back to today's design.",
  },
  "settings.themeKeep": { ja: "保持", en: "Kept" },
  "settings.aiSwitch": { ja: "使うAIを切り替える", en: "Switch the AI in use" },
  "settings.aiRunning": { ja: "いま動いている設定", en: "Currently running" },
  "settings.aiProvider": { ja: "提供元", en: "Provider" },
  "settings.aiEnvDefault": { ja: "環境変数のまま（既定）", en: "Keep environment default" },
  "settings.aiKeyNote": {
    ja: "APIキーは環境変数に置いたまま切り替わります(DBに鍵は保存しません)。",
    en: "API keys stay in environment variables — never stored in the database.",
  },
  "settings.aiFast": {
    ja: "速い系(スキャン・候補・4択の生成)",
    en: "Fast (scan, candidates, quiz)",
  },
  "settings.aiRich": { ja: "詳しい系（カード・添削）", en: "Rich (cards, corrections)" },
  "settings.aiPremium": { ja: "Pro ユーザー用", en: "For Pro users" },
  "settings.aiApply": { ja: "この設定で動かす", en: "Run with these settings" },
  "settings.aiApplied": {
    ja: "AIモデルを切り替えました（次のリクエストから有効）",
    en: "AI models switched (effective from the next request)",
  },
  "settings.nativeLangHint": {
    ja: "台湾華語のつまずき方は母語で変わります。発音のコツ・復習の添削・日記の添削が、この母語に合わせて最適化されます。",
    en: "Where Mandarin trips you up depends on your first language. Pronunciation tips, review feedback and journal corrections all adapt to it.",
  },
  "settings.aiKeys": { ja: "APIキーの検出状況", en: "API key detection" },
  "settings.aiKeyFound": { ja: "検出", en: "found" },
  "settings.aiKeyMissing": { ja: "未設定", en: "not set" },
  "settings.aiKeysHint": {
    ja: "サーバーの環境変数を実際に読んだ結果です。1つも検出できないとAI機能は動きません。",
    en: "Read live from the server environment. With no key detected, AI features cannot run.",
  },
  "settings.aiPerFeature": { ja: "機能ごとに使うAIを分ける", en: "Assign an AI per feature" },
  "settings.aiFeature.scan": { ja: "スキャン（速さ優先）", en: "Scan (speed first)" },
  "settings.aiFeature.card": { ja: "単語カード生成", en: "Word card generation" },
  "settings.aiFeature.review": { ja: "復習の添削・ヒント", en: "Review feedback & hints" },
  "settings.aiFeature.journal": { ja: "日記の添削", en: "Journal correction" },
  "settings.aiFeature.audit": { ja: "自己改善の点検", en: "Self-improvement audit" },
  "settings.aiPerFeatureHint": {
    ja: "空欄なら上の既定を使います。「提供元:モデル名」で別のAIに丸ごと振り分けられます(例 openai:gpt-5)。キーが無い提供元を指定しても既定に自動で戻るので、設定ミスで機能は止まりません。",
    en: "Leave blank to use the default above. Use “provider:model” to route a feature to another AI (e.g. openai:gpt-5). If that provider has no key, it falls back to the default — a wrong setting never breaks the feature.",
  },
  "settings.aiModelNote": {
    ja: "モデル名は提供元に実在するIDを書いてください(例 gemini-2.5-flash)。存在しないIDのときは自動で安定モデルに戻して動かします。",
    en: "Use a model ID that really exists on the provider (e.g. gemini-2.5-flash). Unknown IDs automatically fall back to a stable model.",
  },
  "settings.devMetrics": { ja: "開発者（速度計測）", en: "Developer (speed metrics)" },
  "settings.deleteAccount": { ja: "アカウントを削除", en: "Delete account" },
  "settings.videoLabel": { ja: "録画（インカメ）", en: "Record video (front camera)" },
  "settings.videoHint": {
    ja: "スピーキング復習中、自分の姿を録画してあとで見返せます。この端末のみに保存。映像のみ（マイクは音声認識が使います）。",
    en: "Record yourself during speaking review and watch it back. Stored on this device only. Video only — the mic is reserved for speech recognition.",
  },
  "settings.reviewMode": { ja: "復習モード", en: "Review mode" },
  "settings.reviewModeHint": {
    ja: "スピーキングは写真を見て話し、AIが添削します。4択は声を出せない場所向けです。",
    en: "Speaking: talk about the photo and AI corrects you. Quiz: for when you can't speak out loud.",
  },
  "settings.avatar": { ja: "プロフィール写真", en: "Profile photo" },
  "settings.avatarPick": { ja: "写真を選ぶ", en: "Choose photo" },
  "settings.avatarChange": { ja: "変更", en: "Change" },
  "settings.avatarClear": { ja: "外す", en: "Remove" },
  "settings.avatarSaving": { ja: "保存中…", en: "Saving…" },
  "settings.avatarSaved": { ja: "プロフィール写真を変えました", en: "Profile photo updated" },
  "settings.avatarFailed": { ja: "写真を保存できませんでした", en: "Couldn't save the photo" },
  "settings.avatarNone": { ja: "プロフィール写真はまだありません", en: "No profile photo yet" },
  "settings.avatarHint": {
    ja: "画面上のアイコンがこの写真になります。",
    en: "This becomes the icon at the top of every screen.",
  },
  "settings.reviewLimit": { ja: "1日の復習枚数", en: "Cards per day" },
  "settings.reviewLimitNone": { ja: "無制限", en: "All" },
  "settings.reviewLimitHint": {
    ja: "この枚数までで今日の復習は終わり。終わりが見えるほうが続きます。",
    en: "Today's review ends after this many cards — a finish line keeps the habit going.",
  },
  "settings.reviewFocus": { ja: "優先する記憶の段階", en: "Prioritise" },
  "settings.focusAll": { ja: "期限順", en: "By due date" },
  "settings.focusWeak": { ja: "忘れかけ", en: "Weakest" },
  "settings.focusNew": { ja: "覚えたて", en: "Newest" },
  "settings.reviewFocusHint": {
    ja: "忘れかけは何度も間違えた語から、覚えたては復習回数が少ない語から出します。",
    en: "Weakest: words you keep missing first. Newest: words with the fewest reviews first.",
  },
  "settings.strictness": { ja: "発音判定の厳しさ", en: "Pronunciation strictness" },
  "settings.easy": { ja: "やさしい", en: "Easy" },
  "settings.normal": { ja: "ふつう", en: "Normal" },
  "settings.strict": { ja: "きびしい", en: "Strict" },
  "settings.light": { ja: "ライト", en: "Light" },
  "settings.dark": { ja: "ダーク", en: "Dark" },
  "settings.system": { ja: "システム", en: "System" },
  "settings.saveFailed": { ja: "保存に失敗しました", en: "Could not save" },
  "settings.modeSpeaking": { ja: "🎤 スピーキング", en: "🎤 Speaking" },
  "settings.modeChoice": { ja: "👆 4択（ライト）", en: "👆 Quiz (light)" },
  "settings.zhuyin": { ja: "ㄅㄆㄇ 注音", en: "ㄅㄆㄇ Zhuyin" },
  "settings.pinyin": { ja: "abc ピンイン", en: "abc Pinyin" },
  "settings.phoneticHint": {
    ja: "図鑑・復習・詳細カードなどアプリ全体で、選んだ表記だけを表示します。",
    en: "Only the notation you pick is shown across the whole app.",
  },
  "settings.langJa": { ja: "日本語", en: "Japanese" },
  "settings.langEn": { ja: "English", en: "English" },
  // 符号は見せない。この束の他の4行(日本語 / English / 母語 / 表示言語)は
  // どれも言語の名前だけを出すのに、ここだけ `(zh-TW)` を足していた。
  "settings.langZhTw": { ja: "台湾華語", en: "Taiwanese Mandarin" },
  "settings.deleteWarn": {
    ja: "集めた単語カード・写真・復習の記録・日記など、すべてのデータが完全に削除されます。この操作は取り消せません。",
    en: "Every card, photo, review record and journal entry is permanently deleted. This cannot be undone.",
  },
  "settings.deleteTypeLabel": {
    ja: "確認のため「削除」と入力してください",
    en: "Type 削除 to confirm",
  },
  "settings.deleteButton": {
    ja: "アカウントを完全に削除する",
    en: "Permanently delete my account",
  },
  "settings.deleting": { ja: "削除しています…", en: "Deleting…" },
  "settings.deleteDone": {
    ja: "アカウントを削除しました。ご利用ありがとうございました。",
    en: "Your account has been deleted. Thank you for using Catchwords.",
  },
  "settings.deleteFailed": {
    ja: "削除に失敗しました。もう一度お試しください。",
    en: "Could not delete. Please try again.",
  },
  "settings.metricDetect": { ja: "スキャン検出（中央値）", en: "Scan detection (median)" },
  "settings.metricAudio": { ja: "タップ→音声再生（中央値）", en: "Tap → audio (median)" },
  "settings.metricTarget": { ja: "目標", en: "target" },
  "settings.metricNone": { ja: "計測なし", en: "no data" },
  "settings.kpiLink": { ja: "KPIダッシュボードを開く →", en: "Open the KPI dashboard →" },
  // --- review (speaking / memory details) ---
  "review.preparing": { ja: "今日の出題を準備中…", en: "Preparing today's set…" },
  "review.gradeFailed": {
    ja: "結果を保存できませんでした。この単語は次回もう一度出題されます。",
    en: "Couldn't save your result — this word will come up again next time.",
  },
  "review.memoryLoading": { ja: "記憶データを準備中です。", en: "Preparing memory data…" },
  "review.scene": { ja: "シーン: ", en: "Scene: " },
  "review.todaysPattern": { ja: "今日の型", en: "Today's pattern" },
  "review.usePattern": {
    ja: "この型を入れて一文話してみよう",
    en: "Use this pattern in one sentence",
  },
  "review.teacherQ": { ja: "先生の質問", en: "Your teacher asks" },
  "review.hintsLabel": {
    ja: "ヒント（型・チャンク・文法）",
    en: "Hints (patterns, chunks, grammar)",
  },
  "review.buildYourOwn": {
    ja: "これを使って自分の一文を組み立ててみよう（答えはまだ見せません）",
    en: "Build your own sentence with these (the answer stays hidden)",
  },
  "review.yourNote": { ja: "💭 あなたのメモ:", en: "💭 Your note:" },
  "review.mixFeeling": { ja: "— この気持ちも混ぜてみよう", en: "— work this feeling in too" },
  "review.promptSpeak": {
    ja: "この時のことを、単語を使って一文で",
    en: "Say one sentence about this moment",
  },
  "review.promptPhrase": { ja: "この場面、どう返す？", en: "How would you reply here?" },
  "review.recognitionHint": {
    ja: "音声認識のミスはここで直せます(直接入力もOK)",
    en: "Fix any speech-recognition slips here (or just type)",
  },
  "review.partKind.chunk": { ja: "チャンク", en: "Chunk" },
  "review.partKind.phrase": { ja: "フレーズ", en: "Phrase" },
  "review.partKind.grammar": { ja: "文法", en: "Grammar" },
  "review.playHint": { ja: "このヒントを読み上げ", en: "Play this hint" },
  "review.watchYourself": { ja: "自分の発話を見返す", en: "Watch yourself" },
  "review.videoNoAudio": {
    ja: "録画は映像のみです（マイクは音声認識が使うため）。話した内容は下のテキストで確認できます。",
    en: "Video only — the mic is reserved for speech recognition. Your words appear as text below.",
  },
  "review.you": { ja: "あなた", en: "You" },
  "review.corrected": { ja: "添削", en: "Corrected" },
  "review.sentenceBuild": { ja: "文の組み立て", en: "Sentence structure" },
  "review.whyOrder": { ja: "なぜこの語順？", en: "Why this word order?" },
  "review.nativeFeel": { ja: "ネイティブの気持ち", en: "How natives feel it" },
  "review.model": { ja: "お手本", en: "Model answer" },
  "review.altWay": { ja: "別の言い方: ", en: "Another way: " },
  "review.retryPattern": { ja: "型を使ってもう一度", en: "Try again with the pattern" },
  "review.newBranch": { ja: "🌿 新しい枝が解禁", en: "🌿 New branch unlocked" },
  "review.natural": { ja: "自然！", en: "Natural!" },
  "review.almost": { ja: "通じるけど、もう一歩", en: "Understandable — one step to go" },
  "review.useTarget": { ja: "を使ってみよう", en: "— try using this word" },
  "review.naturalness": { ja: "自然さ", en: "Naturalness" },
  // --- capture flow ---
  "capture.selfieTitle": {
    ja: "ステップ 2: 自撮りを撮る（任意）",
    en: "Step 2: Take a selfie (optional)",
  },
  "capture.selfieHint": {
    ja: "対象物と一緒に自分も撮ると、後で振り返るときに記憶が蘇ります。",
    en: "A photo of you with the thing makes the memory much easier to recall.",
  },
  "capture.addSelfie": { ja: "自撮りを追加", en: "Add a selfie" },
  "capture.skipNext": { ja: "スキップして次へ", en: "Skip for now" },
  "capture.redo": { ja: "やり直す", en: "Start over" },
  "capture.pickTitle": { ja: "ステップ 3: 単語を選ぶ", en: "Step 3: Pick a word" },
  "capture.pickHint": {
    ja: "AIが候補を提案しました。学びたい単語を選んでください。",
    en: "Here's what the AI found — pick the word you want to learn.",
  },
  "capture.otherWord": { ja: "違う単語を入力", en: "Type a different word" },
  "capture.useThis": { ja: "これにする", en: "Use this" },
  "capture.noSelfie": { ja: "自撮りなし", en: "No selfie" },
  "capture.flipHint": {
    ja: "画像をタップで自撮りにフリップ",
    en: "Tap the photo to flip to your selfie",
  },
  "capture.note": { ja: "一言メモ（任意）", en: "A quick note (optional)" },
  "capture.notePlaceholder": { ja: "どんな場面で出会った？", en: "Where did you run into it?" },
  "capture.addToDex": { ja: "図鑑に追加", en: "Add to the dex" },
  "capture.offlineTitle": {
    ja: "解析できなかったので写真を預かりました",
    en: "Couldn't analyze it — we kept your photo",
  },
  "capture.offlineHint": {
    ja: "あとでホームの「解析待ち」から続きができます。撮った瞬間は逃していません。",
    en: "Continue later from “Waiting for analysis” on Home. The moment isn't lost.",
  },
  "capture.savedReason": { ja: "理由: {reason}", en: "Reason: {reason}" },
  "capture.savedRetry": { ja: "いますぐもう一度試す", en: "Try again now" },
  "capture.cancel": { ja: "やめる", en: "Cancel" },
  "capture.toHome": { ja: "ホームへ", en: "Go Home" },
  "capture.oneMore": { ja: "もう一枚撮る", en: "Take another" },
  "capture.reunion": { ja: "再会！", en: "Reunion!" },
  "capture.rememberQ": {
    ja: "意味、覚えてる？ — タップして答え合わせ",
    en: "Do you remember it? — tap to check",
  },
  "capture.remembered": { ja: "覚えてた！", en: "I remembered!" },
  "capture.forgot": { ja: "忘れてた…", en: "I forgot…" },
  "capture.reviewBest": {
    ja: "現実世界での復習、最強です 🎉",
    en: "Real-world review — the strongest kind 🎉",
  },
  "capture.willAsk": {
    ja: "大丈夫、明日また出題します",
    en: "No worries — we'll ask again tomorrow",
  },
  "capture.shootAnother": { ja: "別のものを撮る", en: "Shoot something else" },
  "capture.seeInDex": { ja: "図鑑で見る", en: "See it in the dex" },
  "home.pendingDiscard": { ja: "捨てる", en: "Discard" },
  // **結果を言う。** 「本当に捨てる?」では何が消えるか分からない。
  // この帯は複数枚を数えているが、捨てるのは上に写っている1枚だけ。
  "home.pendingDiscardConfirm": { ja: "この写真を捨てる", en: "Discard this photo" },
  "home.pendingDiscardCancel": { ja: "やめる", en: "Cancel" },
  "home.pendingCta": { ja: "タップしてAI解析を再開する", en: "Tap to resume AI analysis" },
  "home.pendingCount": { ja: "解析待ちの写真 {n}枚", en: "{n} photos waiting for analysis" },
  "card.openMapsLabel": { ja: "Google マップで開く →", en: "Open in Google Maps →" },
  "review.videoTip": {
    ja: "設定で「録画」をONにすると、話した時の自撮り動画も残せます",
    en: "Turn on “Record video” in Settings to keep a selfie clip of your speaking",
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
      if (document.documentElement.lang !== next) document.documentElement.lang = next;
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
