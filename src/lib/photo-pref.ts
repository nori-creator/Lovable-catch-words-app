import { useEffect, useState } from "react";
import type { PhotoRole } from "./sticker-photo";

/**
 * 「札はどの絵で見たいか」の設定(要望 #16)。
 *
 * > 「表示画像(切り抜き/元画像/自撮り)を設定から選べるようにしたい」
 *
 * ## なぜ端末ごとの設定にしたか
 * 発音表記(`phonetic.ts`)と同じ形にしてある。あちらの注釈にはこう書いてある
 * — 「端末ごとの好み(localStorage)」。**見え方の好みは同じ性質の設定**で、
 * 揃えておくほうが後から動かしやすい。
 *
 * それに、いま**未適用のマイグレーションが2本たまっている**
 * (`speaking_scaffold_per_sticker` / `review_mode_hybrid`)。
 * 3本目を足すと、この設定も適用されるまで動かない機能になる。
 * 列が要らない形で済むなら、そちらを採る。
 * (利用者をまたいで持ち歩きたくなったら `profiles` に移せばよく、
 *  そのときも下の `resolvePrefer` はそのまま使える。)
 *
 * ## 「おまかせ」を既定にする
 * 画面にはそれぞれ**意図**がある — 棚は切り抜きを立てるし、ホームの
 * アルバムは自撮りを先に見る。既定の `auto` はその意図を尊重し、
 * 人が明示的に選んだときだけ**全画面でそれを先に見る**。
 * 黙って全部を1つの見え方に潰さない。
 */

/** `auto` = 画面ごとの意図に任せる(既定)。 */
export type PhotoPref = "auto" | PhotoRole;

const KEY = "photo-pref-v1";
const EVENT = "photo-pref-changed";

const VALUES: readonly PhotoPref[] = ["auto", "object", "cutout", "selfie", "placeholder"];

/** 保存されている値を読む。知らない値は `auto` に落とす。 */
export function normalizePhotoPref(raw: unknown): PhotoPref {
  return typeof raw === "string" && (VALUES as readonly string[]).includes(raw)
    ? (raw as PhotoPref)
    : "auto";
}

export function getPhotoPref(): PhotoPref {
  if (typeof window === "undefined") return "auto";
  try {
    return normalizePhotoPref(localStorage.getItem(KEY));
  } catch {
    return "auto";
  }
}

export function setPhotoPref(p: PhotoPref) {
  try {
    localStorage.setItem(KEY, p);
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* storage unavailable */
  }
}

export function usePhotoPref(): PhotoPref {
  const [pref, setPref] = useState<PhotoPref>(() => getPhotoPref());
  useEffect(() => {
    const h = () => setPref(getPhotoPref());
    window.addEventListener(EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(EVENT, h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return pref;
}

/**
 * 設定と画面の意図から、`pickStickerPhoto` に渡す `prefer` を決める。
 *
 * **人が選んだほうが勝つ。** ただし `auto`(既定)なら画面の意図をそのまま
 * 通す — 棚が切り抜きを立てるのも、アルバムが自撮りを先に見るのも、
 * 設定を触っていない人にとっては今まで通りであってほしい。
 */
export function resolvePrefer(
  pref: PhotoPref | string | null | undefined,
  screenIntent?: PhotoRole | null,
): PhotoRole | null {
  const p = normalizePhotoPref(pref);
  if (p !== "auto") return p;
  return screenIntent ?? null;
}
