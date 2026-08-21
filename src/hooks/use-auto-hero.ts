import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { searchImageCandidates, fetchImageAsDataUrl } from "@/lib/images.functions";
import { setStickerPlaceholder } from "@/lib/stickers.functions";
import { supabase } from "@/integrations/supabase/client";
import { putCachedImage } from "@/lib/image-cache";
import { downscaleDataUrl } from "@/lib/cutout";
import { toImageDataUrl } from "@/lib/sticker-upload";
import { heroSearchQuery, needsWebHero, shouldOfferWebCandidates } from "@/lib/hero-image";
import type { PhotoSources } from "@/lib/sticker-photo";
import { useT } from "@/lib/i18n";

/**
 * 絵の無い札の見出しに、ネットの画像を1枚あてがう。
 *
 * オーナー指摘 2026-08-21:
 * > 「単語の詳細の見出しの画像はネットからその単語を表す画像を添付して。」
 *
 * ## なぜ「札のシート」から出したか
 * 同じ処理が `StickerSheet` の中に直に書かれていて、**図鑑から開く
 * `/dex/$stickerId` には無かった**。あちらは `placeholder_url` を
 * 描くだけなので、文字キャッチの語を図鑑から開くと見出しが空のまま。
 * 判断は `src/lib/hero-image.ts`、手続きはここ、と1つずつに寄せて
 * **両方の詳細から同じ物を呼ぶ**。
 *
 * ## 失敗したら忘れる
 * 一度走ったかを覚えておかないと、書き戻すたびに何度も検索へ行く。
 * ただし**失敗した回は覚えない** — 電波が悪かっただけの札が、
 * その後ずっと絵無しで固定されてしまう。
 */
export type WebImageCandidate = {
  url: string;
  credit?: { name?: string; link?: string };
  source: string;
};

export type AutoHeroSticker = PhotoSources & {
  id: string;
  word: { headword: string; meaning_ja?: string | null };
};

export function useAutoHero(sticker: AutoHeroSticker | null | undefined) {
  const t = useT();
  const qc = useQueryClient();
  const searchImagesFn = useServerFn(searchImageCandidates);
  const fetchImageFn = useServerFn(fetchImageAsDataUrl);
  const setPlaceholderFn = useServerFn(setStickerPlaceholder);
  const triedRef = useRef<Set<string>>(new Set());
  const [candidates, setCandidates] = useState<WebImageCandidate[]>([]);
  const [swapping, setSwapping] = useState<string | null>(null);

  useEffect(() => {
    const s = sticker;
    if (!s) return;
    // 自分で撮った写真がある札は触らない(候補も出さない)。
    if (!shouldOfferWebCandidates(s)) return;
    if (triedRef.current.has(s.id)) return;
    triedRef.current.add(s.id);
    void (async () => {
      try {
        const query = heroSearchQuery({ headword: s.word.headword, meaning: s.word.meaning_ja });
        // 空の検索を投げない(語も意味も無い札は、ただ絵が無いままでよい)。
        if (!query) return;
        const { candidates: cands } = await searchImagesFn({ data: { query } });
        setCandidates(cands.slice(0, 6));
        // すでに絵があるなら候補を出すだけで、勝手には差し替えない。
        if (!needsWebHero(s)) return;
        const cand = cands[0];
        if (!cand) return;
        const path = await uploadWebImage(cand, fetchImageFn);
        if (!path) return;
        await setPlaceholderFn({
          data: {
            sticker_id: s.id,
            placeholder_path: path,
            placeholder_credit: cand.credit
              ? { ...cand.credit, source: cand.source }
              : { source: cand.source },
          },
        });
        await qc.invalidateQueries({ queryKey: ["sticker", s.id] });
        await qc.invalidateQueries({ queryKey: ["stickers"] });
      } catch {
        // **覚えない。** 次に開いたときにもう一度取りに行く。
        triedRef.current.delete(s.id);
      }
    })();
  }, [sticker, searchImagesFn, fetchImageFn, setPlaceholderFn, qc]);

  /**
   * 自動で入ったネット画像を、別の候補に差し替える。
   * 自分で撮った写真ではないので `object` ではなく `placeholder` 側を
   * 入れ替える(あとで実物を撮ったときに、その写真が正として上に来る)。
   */
  async function swap(cand: WebImageCandidate) {
    const s = sticker;
    if (!s || swapping) return;
    setSwapping(cand.url);
    try {
      const path = await uploadWebImage(cand, fetchImageFn);
      if (!path) throw new Error("upload failed");
      await setPlaceholderFn({
        data: {
          sticker_id: s.id,
          placeholder_path: path,
          placeholder_credit: cand.credit
            ? { ...cand.credit, source: cand.source }
            : { source: cand.source },
        },
      });
      await qc.invalidateQueries({ queryKey: ["sticker", s.id] });
      await qc.invalidateQueries({ queryKey: ["stickers"] });
      toast.success(t("card.imageSet"));
    } catch (e) {
      console.warn("Swap web image failed", e);
      toast.error(t("card.photoFailed"));
    } finally {
      setSwapping(null);
    }
  }

  return { candidates, swapping, swap };
}

/**
 * ネットの画像を自分のフォルダへ写す。返すのは保存した path。
 *
 * ネットの画像はサーバ経由(CORS 回避)、AI の生成画像はそのまま —
 * その判断は `toImageDataUrl` が1箇所で持っている。
 */
async function uploadWebImage(
  cand: WebImageCandidate,
  fetchImageFn: Parameters<typeof toImageDataUrl>[1],
): Promise<string | null> {
  const dataUrl = await toImageDataUrl(cand.url, fetchImageFn);
  const small = await downscaleDataUrl(dataUrl, 1024, 0.8);
  const blob = await (await fetch(small)).blob();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;
  const path = `${userId}/${Date.now()}-placeholder.jpg`;
  const { error } = await supabase.storage.from("stickers").upload(path, blob, {
    contentType: blob.type,
    upsert: false,
  });
  if (error) return null;
  void putCachedImage(path, blob);
  return path;
}
