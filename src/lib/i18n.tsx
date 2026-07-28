import { useEffect, useState } from "react";

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
  } catch { /* storage unavailable */ }
}

const DICT: Record<string, { ja: string; en: string }> = {
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
  "settings.appearance": { ja: "外観", en: "Appearance" },
  "settings.theme": { ja: "テーマ", en: "Theme" },
  "settings.save": { ja: "保存", en: "Save" },
  "settings.saving": { ja: "保存中...", en: "Saving..." },
  "settings.saved": { ja: "保存しました", en: "Saved" },
  "settings.signout": { ja: "サインアウト", en: "Sign out" },
  // --- capture ---
  "capture.photoTitle": { ja: "写真で集める", en: "Catch with a photo" },
  "capture.photoHint": { ja: "街で見つけたモノにカメラを向けてみてください。", en: "Point your camera at something you found." },
  "capture.tapToShoot": { ja: "タップして撮影", en: "Tap to shoot" },
  "capture.typeWord": { ja: "単語を文字で入力", en: "Type a word instead" },
  "capture.or": { ja: "または", en: "or" },
  // --- scan ---
  "scan.button": { ja: "スキャン", en: "Scan" },
  "scan.again": { ja: "もう一度", en: "Retake" },
  "scan.rescan": { ja: "再スキャン", en: "Scan again" },
  "scan.found": { ja: "見つかった単語", en: "Words found" },
  "scan.searchPlaceholder": {
    ja: "候補に無い? 日本語で調べる(例: マンゴー)",
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
  "review.empty": { ja: "今日復習する単語はありません。", en: "Nothing to review today." },
  "review.emptyHint": {
    ja: "新しい単語をキャッチすると、10分後に最初の復習が出ます。",
    en: "Catch a new word and its first review appears 10 minutes later.",
  },
  "review.goCatch": { ja: "撮りに行く", en: "Go catch one" },
  "review.doneTitle": { ja: "今日のノルマ、達成!", en: "Today's set is done!" },
  "review.doneHint": { ja: "また明日の復習で会いましょう。", en: "See you in tomorrow's review." },
  "review.again": { ja: "もう一度出す", en: "Review again" },
  "review.quizTag": { ja: "4択クイズ", en: "Multiple choice" },
  "review.whichIs": { ja: "はどれ?", en: "— which one?" },
  "review.correct": { ja: "正解!", en: "Correct!" },
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
  "card.reportWhat": { ja: "どこが違う?", en: "What's wrong?" },
  "card.reportThanks": { ja: "🙏 報告ありがとうございます", en: "🙏 Thanks for reporting" },
  "card.regenAll": { ja: "✨ 解説を再生成", en: "✨ Regenerate details" },
  "card.regenPro": { ja: "解説の再生成は Pro 限定", en: "Regenerating details is Pro-only" },
  "card.preparing": { ja: "詳しい解説をAIが準備中…", en: "AI is preparing the details…" },
  // --- home ---
  "home.emptyTitle": { ja: "きょうのページはまだ白紙です。", en: "Today's page is still blank." },
  "home.emptyHint": {
    ja: "街の看板やメニューをかざすと、最初の一枚がここに貼られます。",
    en: "Point your camera at a sign or menu and your first photo lands here.",
  },
  "home.emptyCta": { ja: "街でひとつ見つける", en: "Find one outside" },
  "home.journal": { ja: "今日の日記を書く", en: "Write today's journal" },
  "home.pastPages": { ja: "Past Pages", en: "Past Pages" },
  "home.memories": { ja: "枚の思い出", en: "memories caught" },
  "home.background": { ja: "背景", en: "Background" },
  // --- common ---
  "common.close": { ja: "閉じる", en: "Close" },
  "common.cancel": { ja: "キャンセル", en: "Cancel" },
  "common.retry": { ja: "もう一度", en: "Retry" },
  // --- word card (extra) ---
  "card.notYet": { ja: "まだ作られていません", en: "Not generated yet" },
  "card.generate": { ja: "作る", en: "Generate" },
  "card.flipToSelfie": { ja: "タップで自撮りへ", en: "Tap to flip to selfie" },
  "card.flipBack": { ja: "タップで戻る", en: "Tap to flip back" },
  "card.selfie": { ja: "自撮り", en: "Selfie" },
  "card.noSelfie": { ja: "自撮りはまだありません", en: "No selfie yet" },
  "card.changePhotoConfirm": { ja: "この写真を変更しますか?", en: "Change this photo?" },
  "card.deleteConfirmDialog": {
    ja: "本当に削除しますか?この操作は取り消せません。",
    en: "Delete this card? This cannot be undone.",
  },
  "card.deleteFailed": { ja: "削除に失敗しました。", en: "Could not delete." },
  "card.photoFailed": { ja: "画像の変更に失敗しました。", en: "Could not change the photo." },
  "card.pickAnotherImage": {
    ja: "この画像が違うときは、別の画像を選べます",
    en: "Not the right picture? Pick another one",
  },
  "card.findingImage": { ja: "🌐 画像をネットから探しています…", en: "🌐 Finding an image online…" },
  "card.regenerating": { ja: "再生成中…", en: "Regenerating…" },
  "card.reportPrompt": {
    ja: "意味や発音が変? 報告してAIに直させる",
    en: "Wrong meaning or reading? Report and let AI fix it",
  },
  "card.reportFixing": { ja: "AIが作り直し中…", en: "AI is rebuilding…" },
  "card.reportDone": { ja: "報告ありがとう。AIが作り直しました", en: "Thanks — AI rebuilt this card" },
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
  "input.micHint": { ja: "マイクで復唱するか、下の欄で認識結果を直せます", en: "Speak, or fix the text below" },
  "input.textHint": {
    ja: "台湾華語でも日本語でもOK(日本語は自動で台湾華語に変換されます)",
    en: "Type in Mandarin or your own language — we'll convert it",
  },
  "input.word": { ja: "単語", en: "Word" },
  "input.phrase": { ja: "フレーズ", en: "Phrase" },
  "input.scene": { ja: "シーン: どこで・誰が・何と言った?(任意)", en: "Scene: where / who / what was said (optional)" },
  "input.lookup": { ja: "調べてカードにする", en: "Look up & make a card" },
  "input.looking": { ja: "辞書とAIが調べています…", en: "Checking the dictionary and AI…" },
  "input.attach": { ja: "画像を添付(任意)", en: "Attach an image (optional)" },
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
  "dex.clearSearch": { ja: "検索をクリア", en: "Clear search" },
  "dex.noMatch": { ja: "に一致する単語はありません。", en: "— no matching words." },
  "dex.emptyTitle": { ja: "まだ何もキャッチしていません。", en: "Nothing caught yet." },
  "dex.emptyHint": {
    ja: "カメラで街の言葉をかざすと、ここに図鑑が育ちます。",
    en: "Point the camera at words around you and your dex starts growing.",
  },
  "dex.emptyCta": { ja: "最初の一枚を撮る", en: "Take your first photo" },
  "dex.placesTitle": { ja: "キャッチした場所", en: "Where you caught them" },
  "dex.placesHint": {
    ja: "写真をタップで地図がその場所へズーム。地図上の丸い写真をタップで単語の詳細へ。",
    en: "Tap a photo to zoom the map there. Tap a round photo on the map to open the word.",
  },
  "dex.withLocation": { ja: "場所付きの単語", en: "Words with a location" },
  "dex.mapUnavailable": { ja: "地図の連携が完了していません。", en: "Maps are not configured yet." },
  "dex.items": { ja: "件", en: "" },
  // --- settings (admin) ---
  "settings.devOnly": {
    ja: "開発者専用(あなたにしか表示されません)",
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
  "settings.aiEnvDefault": { ja: "環境変数のまま(既定)", en: "Keep environment default" },
  "settings.aiKeyNote": {
    ja: "APIキーは環境変数に置いたまま切り替わります(DBに鍵は保存しません)。",
    en: "API keys stay in environment variables — never stored in the database.",
  },
  "settings.aiFast": { ja: "速い系(スキャン・候補・4択の生成)", en: "Fast (scan, candidates, quiz)" },
  "settings.aiRich": { ja: "詳しい系(カード・添削)", en: "Rich (cards, corrections)" },
  "settings.aiPremium": { ja: "Pro ユーザー用", en: "For Pro users" },
  "settings.aiApply": { ja: "この設定で動かす", en: "Run with these settings" },
  "settings.aiApplied": {
    ja: "AIモデルを切り替えました(次のリクエストから有効)",
    en: "AI models switched (effective from the next request)",
  },
  "settings.aiKeys": { ja: "APIキーの検出状況", en: "API key detection" },
  "settings.aiKeyFound": { ja: "検出", en: "found" },
  "settings.aiKeyMissing": { ja: "未設定", en: "not set" },
  "settings.aiKeysHint": {
    ja: "サーバーの環境変数を実際に読んだ結果です。1つも検出できないとAI機能は動きません。",
    en: "Read live from the server environment. With no key detected, AI features cannot run.",
  },
  "settings.aiPerFeature": { ja: "機能ごとに使うAIを分ける", en: "Assign an AI per feature" },
  "settings.aiFeature.scan": { ja: "スキャン(速さ優先)", en: "Scan (speed first)" },
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
  "settings.devMetrics": { ja: "開発者(速度計測)", en: "Developer (speed metrics)" },
  "settings.deleteAccount": { ja: "アカウントを削除", en: "Delete account" },
  "settings.videoLabel": { ja: "録画(インカメ)", en: "Record video (front camera)" },
  "settings.videoHint": {
    ja: "スピーキング復習中、自分の姿を録画してあとで見返せます。この端末のみに保存。映像のみ(マイクは音声認識が使います)。",
    en: "Record yourself during speaking review and watch it back. Stored on this device only. Video only — the mic is reserved for speech recognition.",
  },
  "settings.reviewMode": { ja: "復習モード", en: "Review mode" },
  "settings.reviewModeHint": {
    ja: "スピーキング: 写真を見てその時の経験を話す→AIが添削。4択: 声を出せない場所向けのクイズ。",
    en: "Speaking: talk about the photo and AI corrects you. Quiz: for when you can't speak out loud.",
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
  "settings.modeChoice": { ja: "👆 4択(ライト)", en: "👆 Quiz (light)" },
  "settings.zhuyin": { ja: "ㄅㄆㄇ 注音", en: "ㄅㄆㄇ Zhuyin" },
  "settings.pinyin": { ja: "abc ピンイン", en: "abc Pinyin" },
  "settings.phoneticHint": {
    ja: "図鑑・復習・詳細カードなどアプリ全体で、選んだ表記だけを表示します。",
    en: "Only the notation you pick is shown across the whole app.",
  },
  "settings.langJa": { ja: "日本語", en: "Japanese" },
  "settings.langEn": { ja: "English", en: "English" },
  "settings.langZhTw": { ja: "台湾華語 (zh-TW)", en: "Taiwanese Mandarin (zh-TW)" },
  "settings.deleteWarn": {
    ja: "集めた単語カード・写真・復習の記録・日記など、すべてのデータが完全に削除されます。この操作は取り消せません。",
    en: "Every card, photo, review record and journal entry is permanently deleted. This cannot be undone.",
  },
  "settings.deleteTypeLabel": {
    ja: "確認のため「削除」と入力してください",
    en: "Type 削除 to confirm",
  },
  "settings.deleteButton": { ja: "アカウントを完全に削除する", en: "Permanently delete my account" },
  "settings.deleting": { ja: "削除しています…", en: "Deleting…" },
  "settings.deleteDone": {
    ja: "アカウントを削除しました。ご利用ありがとうございました。",
    en: "Your account has been deleted. Thank you for using Catchwords.",
  },
  "settings.deleteFailed": {
    ja: "削除に失敗しました。もう一度お試しください。",
    en: "Could not delete. Please try again.",
  },
  "settings.metricDetect": { ja: "スキャン検出(中央値)", en: "Scan detection (median)" },
  "settings.metricAudio": { ja: "タップ→音声再生(中央値)", en: "Tap → audio (median)" },
  "settings.metricTarget": { ja: "目標", en: "target" },
  "settings.metricNone": { ja: "計測なし", en: "no data" },
  "settings.kpiLink": { ja: "KPIダッシュボードを開く →", en: "Open the KPI dashboard →" },
  // --- review (speaking / memory details) ---
  "review.preparing": { ja: "今日の出題を準備中…", en: "Preparing today's set…" },
  "review.memoryLoading": { ja: "記憶データを準備中です。", en: "Preparing memory data…" },
  "review.scene": { ja: "シーン: ", en: "Scene: " },
  "review.todaysPattern": { ja: "今日の型", en: "Today's pattern" },
  "review.usePattern": { ja: "この型を入れて一文話してみよう", en: "Use this pattern in one sentence" },
  "review.teacherQ": { ja: "先生の質問", en: "Your teacher asks" },
  "review.hintsLabel": { ja: "ヒント(型・チャンク・文法)", en: "Hints (patterns, chunks, grammar)" },
  "review.buildYourOwn": {
    ja: "これを使って自分の一文を組み立ててみよう(答えはまだ見せません)",
    en: "Build your own sentence with these (the answer stays hidden)",
  },
  "review.yourNote": { ja: "💭 あなたのメモ:", en: "💭 Your note:" },
  "review.mixFeeling": { ja: "— この気持ちも混ぜてみよう", en: "— work this feeling in too" },
  "review.promptSpeak": { ja: "この時のことを、単語を使って一文で", en: "Say one sentence about this moment" },
  "review.promptPhrase": { ja: "この場面、どう返す?", en: "How would you reply here?" },
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
    ja: "録画は映像のみです(マイクは音声認識が使うため)。話した内容は下のテキストで確認できます。",
    en: "Video only — the mic is reserved for speech recognition. Your words appear as text below.",
  },
  "review.you": { ja: "あなた", en: "You" },
  "review.corrected": { ja: "添削", en: "Corrected" },
  "review.sentenceBuild": { ja: "文の組み立て", en: "Sentence structure" },
  "review.whyOrder": { ja: "なぜこの語順?", en: "Why this word order?" },
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
  "capture.selfieTitle": { ja: "ステップ 2: 自撮りを撮る(任意)", en: "Step 2: Take a selfie (optional)" },
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
  "capture.flipHint": { ja: "画像をタップで自撮りにフリップ", en: "Tap the photo to flip to your selfie" },
  "capture.note": { ja: "一言メモ(任意)", en: "A quick note (optional)" },
  "capture.notePlaceholder": { ja: "どんな場面で出会った?", en: "Where did you run into it?" },
  "capture.addToDex": { ja: "図鑑に追加", en: "Add to the dex" },
  "capture.offlineTitle": {
    ja: "オフラインなので写真だけ保存しました",
    en: "You're offline — we saved the photo only",
  },
  "capture.offlineHint": {
    ja: "電波が戻ったら、ホームの「解析待ち」から続きができます。撮った瞬間は逃していません。",
    en: "When you're back online, continue from “Waiting for analysis” on Home. The moment isn't lost.",
  },
  "capture.toHome": { ja: "ホームへ", en: "Go Home" },
  "capture.oneMore": { ja: "もう一枚撮る", en: "Take another" },
  "capture.reunion": { ja: "再会!", en: "Reunion!" },
  "capture.rememberQ": { ja: "意味、覚えてる? — タップして答え合わせ", en: "Do you remember it? — tap to check" },
  "capture.remembered": { ja: "覚えてた！", en: "I remembered!" },
  "capture.forgot": { ja: "忘れてた…", en: "I forgot…" },
  "capture.reviewBest": { ja: "現実世界での復習、最強です 🎉", en: "Real-world review — the strongest kind 🎉" },
  "capture.willAsk": { ja: "大丈夫、明日また出題します", en: "No worries — we'll ask again tomorrow" },
  "capture.shootAnother": { ja: "別のものを撮る", en: "Shoot something else" },
  "capture.seeInDex": { ja: "図鑑で見る", en: "See it in the dex" },
  "home.pendingCta": { ja: "タップしてAI解析を再開する", en: "Tap to resume AI analysis" },
  "home.pendingCount": { ja: "解析待ちの写真", en: "Photos waiting for analysis" },
  "card.openMapsLabel": { ja: "Google マップで開く →", en: "Open in Google Maps →" },
  "review.videoTip": {
    ja: "設定で「録画」をONにすると、話した時の自撮り動画も残せます",
    en: "Turn on “Record video” in Settings to keep a selfie clip of your speaking",
  },
};

export function useUiLang(): UiLang {
  const [lang, setLang] = useState<UiLang>(() => getUiLang());
  useEffect(() => {
    const h = () => setLang(getUiLang());
    window.addEventListener(EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(EVENT, h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return lang;
}

/** `const t = useT(); t("nav.home")` — 未登録キーはキーをそのまま返す。 */
export function useT(): (key: string) => string {
  const lang = useUiLang();
  return (key: string) => DICT[key]?.[lang] ?? DICT[key]?.ja ?? key;
}
