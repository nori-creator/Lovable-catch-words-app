/**
 * 読みの表記を1つだけ選んで、全画面で同じ表記を出す。
 *
 * ## なぜ「どちらか一方だけ」なのか
 * 台湾華語の学習者は注音派と拼音派がはっきり分かれる。両方を並べると、
 * 自分が読まないほうの記号が毎回目に入って、読みを探す時間が増える。
 * **一方だけ**にして、設定で切り替える。
 *
 * ## 2026-08-24: 台湾華語だけの物をやめた
 * 英語版でも同じ問題が起きる — アメリカ英語の IPA とイギリス英語の IPA を
 * 並べると読みの欄が2行になる。形は台湾華語とまったく同じなので、
 * **「注音か拼音か」ではなく「その言語の読みの表記のどれか」**として持つ。
 *
 *     zh-TW  注音(ㄅㄆㄇ) ／ 拼音        既定 = 注音
 *     en     IPA(米)     ／ IPA(英)     既定 = 米(オーナー決定 2026-08-24)
 *
 * 並びは `target-profile.ts` が持っている(`profile.readings`、先頭が既定)。
 * ここは**選び方と憶え方**だけを持つ。
 *
 * ## 言語ごとに別に憶える
 * 1つの鍵に入れると、英語を学んでいる間に選んだ `ipa-uk` が台湾華語の
 * 読みの設定として残り、**その言語に存在しない表記**を指したまま画面が
 * 動くことになる。鍵の中を言語ごとの表に分ける。読むときに
 * 「その言語に在る表記か」を必ず確かめ、無ければ既定へ落とす。
 *
 * ## 古い鍵を捨てない
 * `phonetic-pref-v1` で拼音を選んでいた人が、この変更で注音に戻ったら
 * **その人にとっては不具合**。台湾華語の表に何も無いときだけ古い鍵を読む。
 * 書くときは新旧どちらにも書いておく(古い版に戻っても選択が残る)。
 *
 * 外の世界に触れるものをここに入れないこと。
 */

import { useEffect, useState } from "react";
import {
  ZH_TW_PROFILE,
  defaultReading,
  targetProfile,
  type ReadingKind,
  type TargetProfile,
} from "./target-profile";

export type { ReadingKind };

/**
 * 台湾華語の読みの表記。
 *
 * **古い名前。** 呼ぶ側を一度に書き換えないために残してある。
 * 新しく書く物は `ReadingKind` を使うこと。
 */
export type Phonetic = "zhuyin" | "pinyin";

const KEY = "reading-pref-v1";
/** 台湾華語しか無かった頃の鍵。読むだけ・書くだけで、形は変えない。 */
const LEGACY_KEY = "phonetic-pref-v1";
/**
 * 変わったことを知らせる合図。
 * **名前を変えない** — 聞いている側(設定・カード・復習)が全部これを見ている。
 */
const EVENT = "phonetic-pref-changed";

/** localStorage のうち、ここが使う分だけ。試験で本物を用意しなくて済む。 */
export type ReadingStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

/** その表記はこの言語に在るか。無い表記を画面に渡さないための関門。 */
function allowed(profile: TargetProfile, value: unknown): value is ReadingKind {
  return typeof value === "string" && (profile.readings as readonly string[]).includes(value);
}

function readMap(store: ReadingStore): Record<string, unknown> {
  try {
    const raw = store.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    // **壊れた中身で落とさない。** 手で書き換えられることも、古い形が
    // 残っていることもある。表でなければ「何も憶えていない」と扱う。
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * その言語で選ばれている読みの表記。
 *
 * 表 → 古い鍵(台湾華語のときだけ) → 既定、の順に見る。
 * **その言語に無い表記は無視する。**
 */
export function readReadingPref(store: ReadingStore, profile: TargetProfile): ReadingKind {
  const saved = readMap(store)[profile.code];
  if (allowed(profile, saved)) return saved;
  if (profile.code === ZH_TW_PROFILE.code) {
    let legacy: string | null = null;
    try {
      legacy = store.getItem(LEGACY_KEY);
    } catch {
      legacy = null;
    }
    if (allowed(profile, legacy)) return legacy;
  }
  return defaultReading(profile);
}

/** 選び直しを憶える。**その言語に無い表記は憶えない。** */
export function writeReadingPref(
  store: ReadingStore,
  profile: TargetProfile,
  kind: ReadingKind,
): void {
  if (!allowed(profile, kind)) return;
  try {
    store.setItem(KEY, JSON.stringify({ ...readMap(store), [profile.code]: kind }));
    // 古い版に戻っても選択が残るように、台湾華語の分は古い鍵にも書く。
    if (profile.code === ZH_TW_PROFILE.code) store.setItem(LEGACY_KEY, kind);
  } catch {
    /* storage unavailable */
  }
}

/**
 * 選ばれている表記が無い/空のときに、代わりに出せる読みを探す順。
 *
 * 選んだ表記 → その言語の並び順。**片方しか無い語で読みを空にしない。**
 */
export function pickReadingOf(
  profile: TargetProfile,
  kind: ReadingKind,
  readings: Partial<Record<ReadingKind, string | null | undefined>>,
): string {
  for (const k of [kind, ...profile.readings]) {
    const v = readings[k]?.trim();
    if (v) return v;
  }
  return "";
}

/**
 * その表記の名前の翻訳キー。
 *
 * **設定の並びを `readings` から作るための口。** ここを表にしておかないと、
 * 設定画面に `zhuyin` / `pinyin` を直に2つ書くことになり、英語版で
 * 分岐が生える。
 */
export function readingLabelKey(kind: ReadingKind): string {
  return READING_LABEL_KEYS[kind];
}

const READING_LABEL_KEYS: Record<ReadingKind, string> = {
  zhuyin: "settings.zhuyin",
  pinyin: "settings.pinyin",
  "ipa-us": "settings.ipaUs",
  "ipa-uk": "settings.ipaUk",
};

function browserStore(): ReadingStore | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** いま選ばれている表記(端末ごと)。 */
export function getReadingPref(profile: TargetProfile): ReadingKind {
  const store = browserStore();
  return store ? readReadingPref(store, profile) : defaultReading(profile);
}

/** 表記を選び直す。 */
export function setReadingPref(profile: TargetProfile, kind: ReadingKind): void {
  const store = browserStore();
  if (!store) return;
  writeReadingPref(store, profile, kind);
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** いま選ばれている表記を見張る。設定で変えると全画面が同時に変わる。 */
export function useReadingPref(profile: TargetProfile = ZH_TW_PROFILE): ReadingKind {
  const [pref, setPref] = useState<ReadingKind>(() => getReadingPref(profile));
  useEffect(() => {
    const h = () => setPref(getReadingPref(profile));
    h();
    window.addEventListener(EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(EVENT, h);
      window.removeEventListener("storage", h);
    };
  }, [profile]);
  return pref;
}

// ---------------------------------------------------------------------------
// 台湾華語だけを見る古い口。呼ぶ側を一度に書き換えないために残してある。
// **動きは1つも変えていない。**
// ---------------------------------------------------------------------------

export function getPhoneticPref(): Phonetic {
  return getReadingPref(ZH_TW_PROFILE) as Phonetic;
}

export function setPhoneticPref(p: Phonetic) {
  setReadingPref(ZH_TW_PROFILE, p);
}

export function usePhoneticPref(): Phonetic {
  return useReadingPref(ZH_TW_PROFILE) as Phonetic;
}

/** 設定に従って注音か拼音の「どちらかだけ」を返す(無い方しか無ければそれを使う)。 */
export function pickReading(
  pref: Phonetic,
  zhuyin?: string | null,
  pinyin?: string | null,
): string {
  return pickReadingOf(ZH_TW_PROFILE, pref, { zhuyin, pinyin });
}

/**
 * **その学習言語で出してよい読みの文字列**を返す。
 *
 * オーナー報告 2026-08-26:
 * > 「学習言語英語、母語台湾華語のとき、注音やピンインを決して表示しないで。
 * >  単語の詳細や単語の候補、文字入力の候補などを含むアプリ全体で。」
 *
 * `Reading` は要素を描くが、**文字列だけ**が要る所もある（キャッチの演出の
 * ように、字を絵として飛ばす層）。そこで `pickReading` を直に呼ぶと
 * 台湾華語のプロフィールで決め打ちになる（それが報告の中身）。
 * 文字列が要る所はここを通す。
 */
export function useReadingText(
  lang: string | null | undefined,
  readings: Partial<Record<ReadingKind, string | null | undefined>>,
): string {
  const profile = targetProfile(lang);
  const pref = useReadingPref(profile);
  return pickReadingOf(profile, pref, readings);
}

/**
 * 選択された表記だけを描画する読みテキスト。
 *
 * 注音(ㄅㄆㄇ)は繁体字フォントにしか入っていない。日本語フォントに落ちると
 * 記号が別物になったり出なかったりするので、ここで言語を宣言しておく。
 * 読みの表示は全画面がこの部品を通るので、**ここ1箇所で全部が正しくなる**。
 */
export function Reading({
  zhuyin,
  pinyin,
  ipaUs,
  ipaUk,
  lang,
  className,
}: {
  zhuyin?: string | null;
  pinyin?: string | null;
  ipaUs?: string | null;
  ipaUk?: string | null;
  /** 学習言語。既定は台湾華語(いまの唯一の学習言語)。 */
  lang?: string;
  className?: string;
}) {
  const profile = targetProfile(lang);
  const pref = useReadingPref(profile);
  const text = pickReadingOf(profile, pref, {
    zhuyin,
    pinyin,
    "ipa-us": ipaUs,
    "ipa-uk": ipaUk,
  });
  if (!text) return null;
  return (
    <span lang={profile.scriptLang} className={className}>
      {text}
    </span>
  );
}
