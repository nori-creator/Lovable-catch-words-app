import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { useUiLang } from "@/lib/i18n";
import { readerL1 } from "@/lib/reader-language";
import { explanationKey } from "@/lib/word-explanation";
import { readExplanationCache, wordExplanationQuery } from "@/lib/reader-explanation";
import { getWordExplanation, type WordExplanationResult } from "@/lib/word-explanation.functions";

/**
 * **例文の札を返事の後で書きに行った時、札の画面の控えを古くする**（PR #189 の点検）。
 *
 * `getWordExplanation` は札の無い古い例文を見つけると、返事の後で札を書き（`labelPending`）、共有の行
 * （`words.extras`）も直す。札の画面は共有の行を `["sticker", id]` の控えから出していて、その控えは
 * 5 分新しいままなので、閉じてすぐ開き直しても直す前の行が出ていた。いま読み直すと書く前の行が返るので、
 * **古い印だけ付けて**（`refetchType: "none"`）、次に開いた時に読み直させる。
 */
export function useRefreshStickerAfterLabel(
  result: WordExplanationResult | undefined,
  stickerId: string | null | undefined,
): void {
  const qc = useQueryClient();
  const pending = !!result?.labelPending;
  useEffect(() => {
    if (!pending || !stickerId) return;
    void qc.invalidateQueries({ queryKey: ["sticker", stickerId], refetchType: "none" });
  }, [pending, stickerId, qc]);
}

/**
 * **図鑑から開いた詳細（`/dex/$stickerId`）でも、札のシートと同じ解説を引く**（PR #189 の点検）。
 *
 * 詳細の画面は共有の行だけを出していて、解説を引かなかったので、ここから開く人（撮り直しの後の移動も）
 * には古い例文の札の直し（`getWordExplanation` が返事の後で始める）が届かなかった。鍵・控え・問い合わせは
 * 札のシートと同じ物（`wordExplanationQuery` — 同じ控えを共有するので、シートを開いた時に読み直さない）。
 * 鍵は人の設定（母語）で決まるので、設定を読み終えてから引く（違う鍵で一度引かない）。
 */
export function useReaderExplanationForDetail(
  wordId: string | null | undefined,
  stickerId: string | null | undefined,
): WordExplanationResult | undefined {
  const uiLang = useUiLang();
  const fetchProfile = useServerFn(getMyProfile);
  const fetchExplanation = useServerFn(getWordExplanation);
  const { data: profile, isFetched: profileFetched } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    staleTime: 60_000,
  });
  const p = profile as { native_language?: string; target_language?: string } | null | undefined;
  const l1 = readerL1({
    uiLanguage: uiLang,
    nativeLanguage: p?.native_language,
    targetLanguage: p?.target_language,
  });
  const wantKey = useMemo(() => explanationKey(uiLang, l1), [uiLang, l1]);
  const cached = useMemo(() => readExplanationCache(wordId, wantKey), [wordId, wantKey]);
  const { data } = useQuery({
    ...wordExplanationQuery(fetchExplanation, wordId, wantKey, cached),
    enabled: !!wordId && profileFetched,
  });
  useRefreshStickerAfterLabel(data, stickerId);
  return data;
}
