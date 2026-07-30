import { useEffect, useState } from "react";

/**
 * 発音表記の全アプリ共通設定(設定画面で切替)。
 * 台湾華語学習では注音派とピンイン派がはっきり分かれるため、
 * どちらか「一方だけ」を全画面で表示する。端末ごとの好み(localStorage)。
 */
export type Phonetic = "zhuyin" | "pinyin";

const KEY = "phonetic-pref-v1";
const EVENT = "phonetic-pref-changed";

export function getPhoneticPref(): Phonetic {
  if (typeof window === "undefined") return "zhuyin";
  return localStorage.getItem(KEY) === "pinyin" ? "pinyin" : "zhuyin";
}

export function setPhoneticPref(p: Phonetic) {
  try {
    localStorage.setItem(KEY, p);
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch { /* storage unavailable */ }
}

export function usePhoneticPref(): Phonetic {
  const [pref, setPref] = useState<Phonetic>(() => getPhoneticPref());
  useEffect(() => {
    const h = () => setPref(getPhoneticPref());
    window.addEventListener(EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(EVENT, h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return pref;
}

/** 設定に従って注音かピンインの「どちらかだけ」を返す(無い方しか無ければそれを使う)。 */
export function pickReading(
  pref: Phonetic,
  zhuyin?: string | null,
  pinyin?: string | null,
): string {
  const z = zhuyin?.trim() || "";
  const p = pinyin?.trim() || "";
  return pref === "pinyin" ? (p || z) : (z || p);
}

/** 選択された表記だけを描画する読みテキスト。 */
export function Reading({
  zhuyin,
  pinyin,
  className,
}: {
  zhuyin?: string | null;
  pinyin?: string | null;
  className?: string;
}) {
  const pref = usePhoneticPref();
  const text = pickReading(pref, zhuyin, pinyin);
  if (!text) return null;
  // 注音(ㄅㄆㄇ)は繁体字フォントにしか入っていない。日本語フォントに落ちると
  // 記号が別物になったり出なかったりするので、ここで言語を宣言しておく。
  // 読みの表示は全画面がこの部品を通るので、ここ1箇所で全部が正しくなる。
  return <span lang="zh-Hant" className={className}>{text}</span>;
}
