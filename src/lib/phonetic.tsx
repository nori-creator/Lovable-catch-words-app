/**
 * 読みの表記を1つだけ選んで、全画面で同じ表記を出す。
 *
 * ## なぜ「どちらか一方だけ」なのか
 * 台湾華語の学習者は注音派と拼音派がはっきり分かれる。両方を並べると、
 * 自分が読まないほうの記号が毎回目に入って、読みを探す時間が増える。
 * **一方だけ**にして、設定で切り替える。
 *
 * ## 台湾華語だけの物にしない
 * 日本語でも同じ形になる — かなとローマ字を並べると読みの欄が2行になる。
 * **「注音か拼音か」ではなく「その言語の読みの表記のどれか」**として持つ。
 *
 *     zh-TW  注音(ㄅㄆㄇ) ／ 拼音        既定 = 注音
 *     ja     かな        ／ ローマ字    既定 = かな
 *
 * 英語の発音記号(IPA)は画面に出さない(オーナー指示 2026-09-30・2026-10-02)。
 * 選ぶ物も無い。IPA の列は残す — 音声や解説の生成が読んでいる。
 *
 * 並びは `target-profile.ts` が持っている(`profile.readings`、先頭が既定)。
 * ここは**選び方と憶え方**だけを持つ。
 *
 * ## 言語ごとに別に憶える
 * 1つの鍵に入れると、日本語を学んでいる間に選んだ `romaji` が台湾華語の
 * 読みの設定として残り、**その言語に存在しない表記**を指したまま画面が
 * 動くことになる。鍵の中を言語ごとの表に分ける。読むときに
 * 「その言語で選べる表記か」を必ず確かめ、無ければ既定へ落とす。
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
import { neutralizeMeasureGe, neutralizeMeasureGePinyin } from "./tw-neutral-tone";

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

/** その表記はこの言語で選べるか。選べない表記を画面に渡さないための関門。 */
function allowed(profile: TargetProfile, value: unknown): value is ReadingKind {
  return readingChoices(profile).some((c) => c.value === value);
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

/** 選び直しを憶える。**その言語で選べない表記は憶えない。** */
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

/** 本人がその言語の表記を**選んだことがあるか**（新しい表か、台湾華語なら古い鍵に有効な値）。 */
export function hasReadingPref(store: ReadingStore, profile: TargetProfile): boolean {
  if (allowed(profile, readMap(store)[profile.code])) return true;
  if (profile.code !== ZH_TW_PROFILE.code) return false;
  try {
    return allowed(profile, store.getItem(LEGACY_KEY));
  } catch {
    return false;
  }
}

/**
 * **まだ選んでいない時だけ**憶える。選んだ人の表記には触らない。書いたら true。
 *
 * 登録前のチュートリアルが台湾華語で拼音を入れるため（オーナー指示 2026-10-03「中文を
 * 選択したら必ずピンインを表示して。外国人が中文を学ぶときほとんどがピンイン使うから」）。
 * 全員の既定（`defaultReading`）は変えない — チュートリアルを通らない今までの人は、
 * 選んでいなければ今まで通り注音のまま。
 */
export function seedReadingPref(
  store: ReadingStore,
  profile: TargetProfile,
  kind: ReadingKind,
): boolean {
  if (hasReadingPref(store, profile) || !allowed(profile, kind)) return false;
  writeReadingPref(store, profile, kind);
  return true;
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
  // **英語の発音記号は出さない**（オーナー指示 2026-09-30「学習言語英語の
  // 発音記号は消して」）。読みの表示は全画面がここを通るので、ここ1箇所で
  // 4択・単語の詳細・候補・図鑑のすべてから消える。データ（IPA の列）は
  // 残す — 音声や解説の生成が読んでいる。
  if (!showsReading(profile)) return "";
  for (const k of [kind, ...profile.readings]) {
    const v = readings[k]?.trim();
    if (v) return v;
  }
  return "";
}

/**
 * その言語で読みの表記を画面に出すか。
 *
 * 台湾華語（注音・拼音）と日本語（かな・ローマ字）は出す。英語（IPA）は
 * 出さない（オーナー指示 2026-09-30）。
 */
export function showsReading(profile: TargetProfile): boolean {
  return !profile.readings.some((r) => r === "ipa-us" || r === "ipa-uk");
}

/**
 * 画面に出す表記の名前の翻訳キー。**ここに無い表記は画面に出さない**
 * (英語の IPA)ので、設定の選択肢にも並ばない。
 */
const READING_LABEL_KEYS: Partial<Record<ReadingKind, string>> = {
  zhuyin: "settings.zhuyin",
  pinyin: "settings.pinyin",
  kana: "settings.kana",
  romaji: "settings.romaji",
};

/**
 * 設定で選べる表記(並びは `readings` の順)と、その名前の翻訳キー。
 *
 * **設定の並びを `readings` から作るための口。** 設定画面に `zhuyin` /
 * `pinyin` を直に2つ書くと、学習言語ごとに分岐が生える。
 * 英語は画面に読みを出さないので、選べる物が無い(空)。
 */
export function readingChoices(
  profile: TargetProfile,
): Array<{ value: ReadingKind; labelKey: string }> {
  if (!showsReading(profile)) return [];
  return profile.readings.flatMap((value) => {
    const labelKey = READING_LABEL_KEYS[value];
    return labelKey ? [{ value, labelKey }] : [];
  });
}

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

/** `seedReadingPref` の端末版。書いたら画面にも知らせる。 */
export function seedReadingPrefNow(profile: TargetProfile, kind: ReadingKind): void {
  const store = browserStore();
  if (store && seedReadingPref(store, profile, kind)) window.dispatchEvent(new CustomEvent(EVENT));
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
 * **言語に依らない「読み1・読み2」を、その言語の表記に割り当てる。**
 *
 * 辞書の行(`reading_primary` / `reading_alt`)や、AI が返す関連語の読みは
 * 「注音か IPA か」を知らない。知っているのは `target-profile.ts` の
 * `readings` だけなので、割り当てはここ1箇所で行う。
 *
 * 呼ぶ側が `lang === "en" ? { ipaUs } : { zhuyin }` と書き始めると、
 * 学習言語が増えた日にその分岐だけ増えない — この app が何度も踏んだ形。
 */
export function neutralReadings(
  lang: string | null | undefined,
  primary?: string | null,
  alt?: string | null,
  /** 見出し語。渡すと量詞の「個」を輕聲に直す（`tw-neutral-tone.ts`）。 */
  headword?: string | null,
): Partial<Record<ReadingKind, string | null | undefined>> {
  const [first, second] = targetProfile(lang).readings;
  const out: Partial<Record<ReadingKind, string | null | undefined>> = {};
  if (first) out[first] = headword ? colloquialReading(first, headword, primary) : primary;
  if (second) out[second] = headword ? colloquialReading(second, headword, alt) : alt;
  return out;
}

/** 注音・ピンインの量詞「個」を輕聲に。ほかの表記はそのまま。 */
export function colloquialReading(
  kind: ReadingKind,
  headword: string | null | undefined,
  reading: string | null | undefined,
  opts?: { measureWord?: boolean },
): string | null | undefined {
  if (!reading) return reading;
  if (kind === "zhuyin") return neutralizeMeasureGe(headword, reading, opts);
  if (kind === "pinyin") return neutralizeMeasureGePinyin(headword, reading, opts);
  return reading;
}

/**
 * 「読み1・読み2」しか手元に無いときの読み。中身は `Reading` と同じ規則
 * (選ばれている表記だけを出す・空なら何も出さない)。
 */
export function ReadingOf({
  lang,
  primary,
  alt,
  className,
}: {
  lang?: string | null;
  primary?: string | null;
  alt?: string | null;
  className?: string;
}) {
  const profile = targetProfile(lang);
  const pref = useReadingPref(profile);
  const text = pickReadingOf(profile, pref, neutralReadings(lang, primary, alt));
  if (!text) return null;
  return (
    <span lang={profile.scriptLang} className={className}>
      {text}
    </span>
  );
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
  lang,
  className,
}: {
  zhuyin?: string | null;
  pinyin?: string | null;
  /** 学習言語。既定は台湾華語。 */
  lang?: string;
  className?: string;
}) {
  const profile = targetProfile(lang);
  const pref = useReadingPref(profile);
  const text = pickReadingOf(profile, pref, { zhuyin, pinyin });
  if (!text) return null;
  return (
    <span lang={profile.scriptLang} className={className}>
      {text}
    </span>
  );
}
