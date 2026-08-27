/**
 * プロフィールの言語設定を、**端末の写しに反映する**。
 *
 * ## なぜ要るか（この app でいちばん高くついた不具合）
 * 学習言語は `profiles.target_language`、表示言語は `profiles.ui_language` に
 * 入っている。ところが画面はどちらも **localStorage の写し**から読む
 * （プロフィールの到着を待たずに描くため）。
 *
 * その写しを書いていたのは **`settings.tsx` だけ**だった。つまり:
 *
 *   **設定画面を一度も開かないと、写しは既定（台湾華語）のまま。**
 *
 * オーナーは設定で「学習言語=英語」を選んだのに、
 *   ・撮ると台湾華語の候補しか出ない
 *   ・保存された語が `language='zh-TW'` になる
 *   ・その結果 TOCFL の級が出て、台湾のリンクが出て、量詞の欄が出る
 * という状態になった。**部品はどれも言語に追従できていて、渡している値だけが
 * 間違っていた。** 1つの取りこぼしが症状を4つ作っていた。
 *
 * ## だから「設定画面の責任」にしない
 * プロフィールを読む所は**必ず**写す。全画面の親（`AppShell`）で1回呼べば、
 * どの入口から入っても写しが揃う。問い合わせは `queryKey: ["profile"]` で
 * 共有されるので、余分な通信は増えない。
 *
 * `dictionary-import.test.ts` と同じ考えで、**写し忘れを試験で数える**
 * （`use-language-prefs.test.ts`）。
 */

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { setTargetLang, storedTargetLang, useTargetLang } from "@/lib/target-lang-pref";
import { setUiLang, normalizeUiLang, storedUiLang } from "@/lib/i18n";
import { reconcileLanguage } from "@/lib/language-sync";
import { DEFAULT_TARGET_LANGUAGE } from "@/lib/target-lang";

/**
 * プロフィールが届いたら、学習言語と表示言語を端末に写す。
 *
 * **両方まとめて写す。** 片方だけにすると、
 * 「画面は繁體中文なのに撮ると台湾華語」のような食い違いが残る。
 */
export function useLanguagePrefsSync(): void {
  const fetchProfile = useServerFn(getMyProfile);
  const { data } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const p = data as
      | { target_language?: string; ui_language?: string; partial?: boolean }
      | undefined;
    if (!p) return;
    /**
     * **中身の無いプロフィールで上書きしない。**
     *
     * `getMyProfile` は私用の列が読めなかったとき、既定を詰めた行を
     * `partial: true` 付きで返す。そこに入っている言語は「その人の設定」
     * ではなく置き場所なので、写すと**英語を学んでいる人の端末が黙って
     * 台湾華語に戻る** — 直したばかりの根っこがそのまま再発する。
     *
     * 端末の写しは前のまま残すのが正しい。次に本物が届いたときに揃う。
     */
    if (p.partial) return;
    /**
     * **この端末で一度選んでいるなら、サーバの値で塗り替えない**
     * (オーナー報告 2026-08-26、2度目「一度設定を保存したらその後
     * キープして」)。
     *
     * ここは画面を開くたびに走る。サーバに保存が届いていなかった場合、
     * 「開く → 古い値で上書き」が毎回起きて、設定画面を直しただけでは
     * 塞ぎきれない。選んだ事実が残っているのは端末のほうなので、
     * **選んでいない端末にだけ**サーバの値を配る
     * (突き合わせの規則は `language-sync.ts` の1つだけ)。
     */
    const target = reconcileLanguage({
      stored: storedTargetLang(),
      server: p.target_language,
      fallback: DEFAULT_TARGET_LANGUAGE,
    });
    const ui = reconcileLanguage({
      stored: storedUiLang(),
      server: p.ui_language,
      fallback: "ja",
    });
    // `setTargetLang` / `setUiLang` は同じ値なら何も知らせないので、
    // プロフィールが届くたびに描き直しが起きることはない。
    setTargetLang(target.value);
    setUiLang(normalizeUiLang(ui.value));
  }, [data]);
}

/**
 * **学習言語を切り替えたら、その言語で絞っている画面を全部読み直す。**
 *
 * オーナー指示 2026-08-26:
 * > 「学習言語を変更したら、アルバムと図鑑に表示されるカードがすべて
 * >  すぐ切り替わるようにして。」
 *
 * ## なぜ切り替わらなかったか
 * `setTargetLang` は端末の写しを書いて知らせを出すので、`useTargetLang` を
 * 読んでいる部品はすぐ描き直る。ところが**一覧そのものは問い合わせの
 * 結果**で、その結果は前の言語で絞ったまま React Query に残っている。
 * 鍵に言語が入っていないので、React Query から見れば「同じ問い合わせ」で、
 * 読み直す理由が無い。
 *
 * ## 鍵を全部書き換えない
 * 言語で絞る問い合わせは図鑑・アルバム・復習・記憶・単語帳に散っていて、
 * 鍵に言語を足して回ると**足し忘れた1つだけが古いまま**残る
 * （この app が何度も踏んでいる形）。切り替わった瞬間に**まとめて古くする**
 * ほうが、抜けようがない。切り替えは滅多に起きないので、費用も問題ない。
 */
const LANGUAGE_SCOPED_QUERIES = [
  "stickers",
  "sticker",
  "sticker-photos",
  "reviews-due",
  "review-cap",
  "memory-stats",
  "memory-overview",
  "my-stats",
  "wordbooks",
  "wordbook-due",
  "user-shelves",
  "search-words",
] as const;

export function useRefreshOnTargetLanguage(): void {
  const qc = useQueryClient();
  const target = useTargetLang();
  const seen = useRef<string | null>(null);
  useEffect(() => {
    // 最初の1回は「切り替わった」ではないので読み直さない。
    if (seen.current === null) {
      seen.current = target;
      return;
    }
    if (seen.current === target) return;
    seen.current = target;
    for (const key of LANGUAGE_SCOPED_QUERIES) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  }, [target, qc]);
}
