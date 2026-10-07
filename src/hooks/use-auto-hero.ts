import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  searchImageCandidates,
  fetchImageAsDataUrl,
  generateProWordImage,
} from "@/lib/images.functions";
import { setStickerPlaceholder } from "@/lib/stickers.functions";
import { supabase } from "@/integrations/supabase/client";
import { putCachedImage } from "@/lib/image-cache";
import { downscaleDataUrl } from "@/lib/image-resize";
import { toImageDataUrl } from "@/lib/sticker-upload";
import { heroSearchQuery, needsWebHero, shouldOfferWebCandidates } from "@/lib/hero-image";
import type { PhotoSources } from "@/lib/sticker-photo";
import { useT } from "@/lib/i18n";
import { useReadableError } from "@/lib/errors";

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
 *
 * ## 失敗したら「探しています」をやめる（オーナー報告 2026-10-07）
 * 前は失敗しても画面が知る手段が無く、見出しは「画像をネットから探しています…」の
 * まま**ずっと**止まっていた。`failed` で「見つけられなかった」と伝え、下の候補か
 * 写真を勧める（次に開いた時はまた取りに行く）。
 */
export type WebImageCandidate = {
  url: string;
  /** 一覧に並べる小さい絵（無ければ `url`）。 */
  thumb?: string;
  credit?: { name?: string; link?: string };
  source: string;
};

export type AutoHeroSticker = PhotoSources & {
  id: string;
  word: { headword: string; meaning_ja?: string | null };
};

export function useAutoHero(sticker: AutoHeroSticker | null | undefined) {
  const t = useT();
  const readable = useReadableError();
  const qc = useQueryClient();
  const searchImagesFn = useServerFn(searchImageCandidates);
  const fetchImageFn = useServerFn(fetchImageAsDataUrl);
  const setPlaceholderFn = useServerFn(setStickerPlaceholder);
  const generateProImageFn = useServerFn(generateProWordImage);
  const triedRef = useRef<Set<string>>(new Set());
  const [candidates, setCandidates] = useState<WebImageCandidate[]>([]);
  const [swapping, setSwapping] = useState<string | null>(null);
  /** 自動の1枚を入れられなかった札（その札を開いている間だけ「見つけられなかった」）。 */
  const [failedId, setFailedId] = useState<string | null>(null);

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
        // 1枚も無い・最初の1枚が保存できない → 「探しています」で止めない。
        const cand = cands[0];
        if (!cand) throw new Error("no candidates");
        const path = await uploadWebImage(cand, fetchImageFn);
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
      } catch (e) {
        console.warn("Auto web image failed", e);
        // **覚えない。** 次に開いたときにもう一度取りに行く。
        triedRef.current.delete(s.id);
        setFailedId(s.id);
      }
    })();
  }, [sticker, searchImagesFn, fetchImageFn, setPlaceholderFn, qc]);

  /** 選んだ1枚を、この札の仮画像として保存する（差し替えと AI の絵で共通）。 */
  async function saveAsPlaceholder(stickerId: string, cand: WebImageCandidate) {
    const path = await uploadWebImage(cand, fetchImageFn);
    await setPlaceholderFn({
      data: {
        sticker_id: stickerId,
        placeholder_path: path,
        placeholder_credit: cand.credit
          ? { ...cand.credit, source: cand.source }
          : { source: cand.source },
      },
    });
    await qc.invalidateQueries({ queryKey: ["sticker", stickerId] });
    await qc.invalidateQueries({ queryKey: ["stickers"] });
    setFailedId(null);
  }

  /** 失敗の知らせ。**理由も出す**（前は「失敗しました」だけで、何が悪いのか読めなかった）。 */
  function failToast(head: string, e: unknown) {
    const why = readable(e, "");
    toast.error(why ? `${head} ${why}` : head);
  }

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
      await saveAsPlaceholder(s.id, cand);
      toast.success(t("card.imageSet"));
    } catch (e) {
      console.warn("Swap web image failed", e);
      failToast(t("card.photoFailed"), e);
    } finally {
      setSwapping(null);
    }
  }

  /**
   * **Pro の人が AI で絵を1枚作る**（オーナー指示 2026-10-07）。Pro かどうか・枠は
   * サーバが確かめる（`generateProWordImage`）。保存は差し替えと同じ道。
   */
  async function generateAi() {
    const s = sticker;
    if (!s || swapping) return;
    setSwapping(AI_IMAGE_KEY);
    try {
      const made = await generateProImageFn({ data: { sticker_id: s.id } });
      await saveAsPlaceholder(s.id, { url: made.url, source: made.source });
      toast.success(t("card.aiImageDone"));
    } catch (e) {
      console.warn("Pro AI image failed", e);
      failToast(t("card.aiImageFailed"), e);
    } finally {
      setSwapping(null);
    }
  }

  const failed = !!sticker && failedId === sticker.id && needsWebHero(sticker);
  return {
    candidates,
    swapping,
    swap,
    failed,
    generateAi,
    generatingAi: swapping === AI_IMAGE_KEY,
  };
}

/** AI の絵を作っている間の `swapping` の印（候補の URL と重ならない）。 */
const AI_IMAGE_KEY = "ai:generating";

/**
 * ネットの画像を自分のフォルダへ写す。返すのは保存した path。
 * 失敗は**理由の文を付けて投げる**（差し替えの知らせに出す）。
 *
 * ネットの画像はサーバ経由(CORS 回避)、AI の生成画像はそのまま —
 * その判断は `toImageDataUrl` が1箇所で持っている。
 */
async function uploadWebImage(
  cand: WebImageCandidate,
  fetchImageFn: Parameters<typeof toImageDataUrl>[1],
): Promise<string> {
  const dataUrl = await toImageDataUrl(cand.url, fetchImageFn);
  const small = await downscaleDataUrl(dataUrl, 1024, 0.8);
  const blob = await (await fetch(small)).blob();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("ログインが切れています。もう一度ログインしてください");
  const path = `${userId}/${Date.now()}-placeholder.jpg`;
  const { error } = await supabase.storage.from("stickers").upload(path, blob, {
    contentType: blob.type,
    upsert: false,
  });
  if (error) throw new Error(`画像を保存できませんでした: ${error.message}`);
  void putCachedImage(path, blob);
  return path;
}
