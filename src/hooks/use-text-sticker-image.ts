import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchImageAsDataUrl, searchImageCandidates } from "@/lib/images.functions";
import { setStickerPlaceholder } from "@/lib/stickers.functions";
import {
  findTextStickerImage,
  textStickerImageSearch,
  TEXT_STICKER_IMAGE_WAIT_MS,
} from "@/lib/text-sticker";
import { uploadWebImage, type WebImageCandidate } from "@/hooks/use-auto-hero";

/**
 * **文字で調べた語の札に載せる、ネットの画像**（`lib/text-sticker.ts` の注）。
 *
 * カードが出た時に探し始め、`TEXT_STICKER_IMAGE_WAIT_MS` の間に画面に出せる1枚が
 * 届けばそれを返す。届かなければ `null` のまま**決着**（語の札で進む）。決着した後や、
 * 剥がし始めた後（`frozen`）に届いた画像で、札を差し替えない。
 *
 * 探し方は図鑑の詳細の自動の1枚（`use-auto-hero`）と同じ検索。保存した後は、届いた
 * 1枚を**その札の仮画像として**残す（`attach`）— 図鑑のマス目にも同じ絵が出る。
 * 上限を過ぎて届いた画像も、ここで仮画像にする（探した分を無駄にしない）。
 */
export function useTextStickerImage(opts: {
  /** 探すか（写真の無いカードが出ている間）。 */
  enabled: boolean;
  headword: string;
  meaning: string | null | undefined;
  /**
   * AI が返した画像検索用の英語（`imageQueryOf(extras)`）。図鑑の詳細の自動の1枚と同じく
   * これを先に使う（オーナー報告 2026-10-08「牛蒡を検索すると花の写真しか出ない」）。
   */
  imageQuery?: string | null;
  /** 語の分類の鍵（検索の並べ替えに使う。`use-auto-hero` と同じ）。 */
  category?: string | null;
  /** 剥がし始めた・飛んでいる。これ以降は札を差し替えない。 */
  frozen: boolean;
}) {
  const qc = useQueryClient();
  const searchImagesFn = useServerFn(searchImageCandidates);
  const fetchImageFn = useServerFn(fetchImageAsDataUrl);
  const setPlaceholderFn = useServerFn(setStickerPlaceholder);
  const [state, setState] = useState<{
    key: string | null;
    image: string | null;
    settled: boolean;
  }>({ key: null, image: null, settled: false });
  /** 探している1枚（上限を過ぎても、保存の後に仮画像にするため最後まで持つ）。 */
  const jobRef = useRef<{ key: string; job: Promise<WebImageCandidate | null> } | null>(null);
  const meaningRef = useRef(opts.meaning);
  meaningRef.current = opts.meaning;
  const imageQueryRef = useRef(opts.imageQuery);
  imageQueryRef.current = opts.imageQuery;
  const categoryRef = useRef(opts.category);
  categoryRef.current = opts.category;
  const key = opts.enabled && opts.headword ? opts.headword : null;

  useEffect(() => {
    if (!key) return;
    let alive = true;
    setState({ key, image: null, settled: false });
    const settle = (image: string | null) =>
      setState((s) => (s.key === key && !s.settled ? { key, image, settled: true } : s));
    const cap = setTimeout(() => alive && settle(null), TEXT_STICKER_IMAGE_WAIT_MS);
    // 検索語は `heroSearchQuery` で組む（`textStickerImageSearch` の中。図鑑の詳細と同じ）。
    const req = textStickerImageSearch({
      headword: key,
      meaning: meaningRef.current,
      imageQuery: imageQueryRef.current,
      category: categoryRef.current,
    });
    const job = findTextStickerImage<WebImageCandidate>({
      query: req.query,
      search: (query) => searchImagesFn({ data: { query, category: req.category } }),
      preload: preloadImage,
    }).catch((e) => {
      console.warn("text sticker image failed", e);
      return null;
    });
    jobRef.current = {
      key,
      job: job.then((found) => found?.candidate ?? null),
    };
    void job.then((found) => {
      if (alive) settle(found?.shown ?? null);
    });
    return () => {
      alive = false;
      clearTimeout(cap);
    };
  }, [key, searchImagesFn]);

  // 剥がし始めたら、その時の札で決着させる。
  useEffect(() => {
    if (!opts.frozen) return;
    setState((s) => (s.settled ? s : { ...s, settled: true }));
  }, [opts.frozen]);

  /**
   * 保存できた札に、探した1枚を仮画像として付ける。**待たずに呼んでよい**（裏で走る）。
   * 失敗しても札そのものは保存済みなので、黙って諦める（図鑑の詳細を開けば
   * `use-auto-hero` がもう一度探す）。
   */
  const attach = useCallback(
    async (stickerId: string, headword: string) => {
      const current = jobRef.current;
      if (!current || current.key !== headword) return;
      try {
        const cand = await current.job;
        if (!cand) return;
        const path = await uploadWebImage(cand, fetchImageFn);
        await setPlaceholderFn({
          data: {
            sticker_id: stickerId,
            placeholder_path: path,
            placeholder_credit: cand.credit
              ? { ...cand.credit, source: cand.source }
              : { source: cand.source },
            // 自動で付ける1枚。**もう絵が在る札には入れない**（その人が選んだ絵を上書きしない）。
            only_if_empty: true,
          },
        });
        await qc.invalidateQueries({ queryKey: ["stickers"] });
        await qc.invalidateQueries({ queryKey: ["sticker", stickerId] });
      } catch (e) {
        console.warn("text sticker placeholder failed", e);
      }
    },
    [fetchImageFn, setPlaceholderFn, qc],
  );

  const mine = state.key === key;
  return {
    /** 札に載せるネットの画像（無ければ null — 語の札を使う）。 */
    image: mine ? state.image : null,
    /** 決着したか（届いた・上限を過ぎた・剥がし始めた）。 */
    settled: mine ? state.settled : false,
    attach,
  };
}

/** 画面に出せるか確かめる（読み込めれば解決、読めなければ拒否）。 */
function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}
