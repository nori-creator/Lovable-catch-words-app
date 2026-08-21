import { useEffect, useState } from "react";
import { normalizeReviewMode, type ReviewModePref } from "./review-format";

/**
 * 復習の出題形式を**端末に持つ**(オーナー報告 2026-08-21)。
 *
 * > 「復習のAIが選ぶボタンを押したらエラーが出た。」
 *
 * ## 何が起きていたか
 * この設定は `profiles.review_mode` だけに保存していた。その列には
 * `check (review_mode in ('speaking','choice'))` が付いていて、
 * **`'hybrid'` を足す移行が当たっていないと保存が制約違反で落ちる**。
 * 画面は押すたびにエラーを出し、つまみは元に戻る。
 *
 * 移行を当てれば直る — が、**当たっていない DB でボタンが壊れる**設計を
 * そのままにはしない。この設定は
 *
 *   ・その人の見え方の好みでしかない
 *   ・server は1度も読んでいない(画面が出題の形を選ぶのに使うだけ)
 *
 * ので、`phonetic.ts` / `photo-pref.ts` / `catch-speed.ts` と同じ
 * **端末ごとの設定**にする。DB は「他の端末にも持っていくための控え」に
 * 格下げし、控えが失敗しても選んだ形はその端末で効く。
 *
 * ## どちらが勝つか
 * **この端末で選んだ値が勝つ。** 一度も選んでいなければ DB の値、
 * それも無ければ既定(`speaking`)。押した直後に画面が別の値へ戻らない、
 * というのがここでいちばん大事なこと。
 */

const KEY = "review-mode-v1";
const EVENT = "review-mode-changed";

/** この端末で選ばれた値。一度も選んでいなければ `null`。 */
export function getStoredReviewMode(): ReviewModePref | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw == null ? null : normalizeReviewMode(raw);
  } catch {
    return null;
  }
}

export function setStoredReviewMode(mode: ReviewModePref): void {
  try {
    localStorage.setItem(KEY, mode);
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* 端末に書けなくても、その場の選択は画面の state で効く。 */
  }
}

/**
 * 端末の値と DB の値から、いま使う出題形式を決める。
 * 純粋な関数として置くのは、**どちらが勝つかを試験で固定する**ため。
 */
export function resolveReviewMode(
  stored: ReviewModePref | null,
  fromProfile: unknown,
): ReviewModePref {
  return stored ?? normalizeReviewMode(fromProfile);
}

/** 画面から使う。DB の値は初期値としてだけ効く。 */
export function useReviewMode(fromProfile: unknown): ReviewModePref {
  const [stored, setStored] = useState<ReviewModePref | null>(() => getStoredReviewMode());
  useEffect(() => {
    const h = () => setStored(getStoredReviewMode());
    window.addEventListener(EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(EVENT, h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return resolveReviewMode(stored, fromProfile);
}
