/**
 * **その人がいま何語を学んでいるか**を、画面から読めるようにする。
 *
 * ## なぜ要るか
 * 学習言語は `profiles.target_language` に入っているが、**画面側に
 * それを読む口が無かった**。だから撮る道（スキャン・文字入力・保存）は
 * `DEFAULT_TARGET_LANGUAGE` を直に使っていて、設定で英語を選んでも
 * **台湾華語として辞書を引き、台湾華語として保存する**。
 *
 * 数えたら **6ファイル20箇所**。1つずつ profile を取りに行く形にすると、
 * 撮るたびに問い合わせが増えるうえ、まだ届いていない瞬間の値が
 * バラバラになる。
 *
 * ## 表示言語(`i18n.tsx` の `useUiLang`)と同じ形にする
 * あちらは localStorage に写しを置いて、プロフィールの到着を待たずに
 * 描けるようにしてある。学習言語も同じ性質のもの（**その端末で今どう
 * 動くかを決める値**）なので、同じ形を使う。形を揃えておくと、
 * 片方を直したときにもう片方も直す場所が分かる。
 *
 * ## 表示言語とは**別物**
 * 混ぜてはいけない。英語を学ぶ台湾の人は
 * 「学習言語 = en / 表示言語 = zh-TW」になる。
 * 1つにまとめると、その人がまさに使えなくなる。
 *
 * ## 保存済みの語には使わない
 * ここが返すのは「**これから撮る物を何語として扱うか**」。
 * 既に保存された語は、その語の行に入っている `language` が正しい
 * （台湾華語の語と英語の語を両方持っている人が居る）。
 * カードの読み上げ・コーパス・行き先は `word.language` を見ること。
 *
 * 外の世界に触れるものをここに入れないこと。
 */

import { useEffect, useState } from "react";
import {
  DEFAULT_TARGET_LANGUAGE,
  normalizeTargetLanguage,
  type TargetLanguage,
} from "./target-lang";

const KEY = "target-lang-v1";
const EVENT = "target-lang-changed";

/**
 * いまの学習言語を読む。
 *
 * **知らない値は既定に落とす。** 一覧から外した言語を選んでいた人が
 * 居ても、未知の言語のまま辞書を引きに行かない。
 */
export function getTargetLang(): TargetLanguage {
  if (typeof window === "undefined") return DEFAULT_TARGET_LANGUAGE;
  try {
    return normalizeTargetLanguage(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_TARGET_LANGUAGE;
  }
}

/**
 * 学習言語を憶える。設定で選び直したときと、プロフィールが届いたときに呼ぶ。
 *
 * **同じ値なら知らせない。** プロフィールは画面を開くたびに届くので、
 * 毎回知らせると、聞いている画面が毎回描き直される。
 */
export function setTargetLang(raw: string | null | undefined): void {
  const next = normalizeTargetLanguage(raw);
  try {
    if (localStorage.getItem(KEY) === next) return;
    localStorage.setItem(KEY, next);
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* storage unavailable */
  }
}

/**
 * いまの学習言語（画面用）。
 *
 * **初回は必ず既定を返す。** サーバー側は localStorage を読めないので
 * 既定で描く。ここでクライアントの初回レンダーだけ localStorage を読むと、
 * hydration でサーバーと食い違って React がツリー全体を作り直す
 * (`useUiLang` に書いてある話と同じ)。マウント後の effect で切り替える。
 */
export function useTargetLang(): TargetLanguage {
  const [lang, setLang] = useState<TargetLanguage>(DEFAULT_TARGET_LANGUAGE);
  useEffect(() => {
    const h = () => setLang(getTargetLang());
    h();
    window.addEventListener(EVENT, h);
    // 別のタブで設定を変えたときも追う。
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(EVENT, h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return lang;
}
