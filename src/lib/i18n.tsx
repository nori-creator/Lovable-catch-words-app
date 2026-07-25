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
  "settings.levelGoal": { ja: "目標レベル", en: "Level goal" },
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
