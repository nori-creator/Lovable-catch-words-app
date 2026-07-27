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
