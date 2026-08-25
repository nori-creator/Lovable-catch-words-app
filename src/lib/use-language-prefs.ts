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

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { setTargetLang } from "@/lib/target-lang-pref";
import { setUiLang, normalizeUiLang } from "@/lib/i18n";

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
    // `setTargetLang` / `setUiLang` は同じ値なら何も知らせないので、
    // プロフィールが届くたびに描き直しが起きることはない。
    setTargetLang(p.target_language);
    setUiLang(normalizeUiLang(p.ui_language));
  }, [data]);
}
