import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchImageAsDataUrl, searchImageCandidates } from "@/lib/images.functions";
import { setStickerPlaceholder } from "@/lib/stickers.functions";
import { textStickerImageSearch } from "@/lib/text-sticker";
import { uploadWebImage, type WebImageCandidate } from "@/hooks/use-auto-hero";

/** 札の下に並べる「別の画像」の数。 */
const MAX_CHOICES = 6;
/** 1枚目が読めない時に、次を試す数（読めない絵を札にしない）。 */
const PRELOAD_TRIES = 3;
/** 探しても届かない時の上限（ms）。これを過ぎたら語を組んだ札で決着させる。
 *  サーバの意味決め（最大3.5秒）と見た目の確認（最大4秒）が入っても間に合う長さ。 */
export const CATCH_IMAGE_WAIT_MS = 8000;

/**
 * **文字で調べた語の札の絵と、その「別の画像」の候補**（オーナー指示 2026-10-08
 * 「シールを表示するときは必ず画像や発音が表示されてから、画像も変更出来きるように」）。
 *
 * 画像の検索（`textStickerImageSearch` → `searchImageCandidates`）を
 * 札を出す**前に**走らせ、画面に出せることを確かめた1枚を札の絵にする。候補は札の下の
 * 「別の画像」（`HeroImageChoices`）に並び、押すとその絵に替わる。保存の後は、いま札に
 * 載っている1枚をその札の仮画像にする（`attach`、まだ空の時だけ）。
 *
 * 探し始めるのは語が決まった時（`enabled`）。見出しが変われば探し直す。
 */
export function useCatchImages(opts: {
  enabled: boolean;
  headword: string;
  meaning: string | null | undefined;
  /** 画像検索用の英語（語を引いた時の `image_query`、カードの `extras.image_query`）。 */
  imageQuery?: string | null;
  category?: string | null;
  /** 写っていてはいけない物（花・池など。カードの `extras.image_avoid`）。 */
  avoid?: string[] | null;
}) {
  const qc = useQueryClient();
  const searchImagesFn = useServerFn(searchImageCandidates);
  const fetchImageFn = useServerFn(fetchImageAsDataUrl);
  const setPlaceholderFn = useServerFn(setStickerPlaceholder);
  const [state, setState] = useState<{
    key: string | null;
    candidates: WebImageCandidate[];
    chosen: WebImageCandidate | null;
    /** 札に出す URL（候補の小さい方）。 */
    shown: string | null;
    settled: boolean;
  }>({ key: null, candidates: [], chosen: null, shown: null, settled: false });
  const [swapping, setSwapping] = useState<string | null>(null);
  const meaningRef = useRef(opts.meaning);
  meaningRef.current = opts.meaning;
  const imageQueryRef = useRef(opts.imageQuery);
  imageQueryRef.current = opts.imageQuery;
  const categoryRef = useRef(opts.category);
  categoryRef.current = opts.category;
  const avoidRef = useRef(opts.avoid);
  avoidRef.current = opts.avoid;
  const key = opts.enabled && opts.headword ? opts.headword : null;

  useEffect(() => {
    if (!key) return;
    let alive = true;
    setState({ key, candidates: [], chosen: null, shown: null, settled: false });
    setSwapping(null);
    const settleEmpty = () =>
      setState((s) => (s.key === key && !s.settled ? { ...s, settled: true } : s));
    const cap = setTimeout(() => alive && settleEmpty(), CATCH_IMAGE_WAIT_MS);
    // 検索語は `heroSearchQuery` で組む（`textStickerImageSearch` の中。図鑑の詳細と同じ）。
    const req = textStickerImageSearch({
      headword: key,
      meaning: meaningRef.current,
      imageQuery: imageQueryRef.current,
      category: categoryRef.current,
      avoid: avoidRef.current,
    });
    void (async () => {
      try {
        if (!req.query.trim()) throw new Error("empty query");
        const { candidates } = await searchImagesFn({
          data: {
            query: req.query,
            category: req.category,
            // 英語の検索語がまだ無い時は、サーバが意味を決めてから探す（`image-sense.ts`）。
            headword: req.headword,
            meaning: req.meaning,
            avoid: req.avoid,
          },
        });
        if (!alive) return;
        const list = candidates.slice(0, MAX_CHOICES);
        setState((s) => (s.key === key ? { ...s, candidates: list } : s));
        for (const c of list.slice(0, PRELOAD_TRIES)) {
          const shown = c.thumb || c.url;
          try {
            await preloadImage(shown);
          } catch {
            continue;
          }
          if (!alive) return;
          // 上限を過ぎて語の札で決着した後でも、まだ誰も選んでいなければ絵を載せない
          // （出ている札を勝手に替えない）。
          setState((s) =>
            s.key === key && !s.settled ? { ...s, chosen: c, shown, settled: true } : s,
          );
          return;
        }
        if (alive) settleEmpty();
      } catch (e) {
        console.warn("catch image search failed", e);
        if (alive) settleEmpty();
      }
    })();
    return () => {
      alive = false;
      clearTimeout(cap);
    };
  }, [key, searchImagesFn]);

  /** 「別の画像」を押した。読み込めてから札を替える。 */
  const choose = useCallback(
    async (c: WebImageCandidate) => {
      const shown = c.thumb || c.url;
      setSwapping(c.url);
      try {
        await preloadImage(shown);
        setState((s) => (s.key === key ? { ...s, chosen: c, shown, settled: true } : s));
      } catch (e) {
        console.warn("catch image choice failed", e);
        // 読めない絵は候補から外す（押しても何も起きない絵を残さない）。
        setState((s) =>
          s.key === key ? { ...s, candidates: s.candidates.filter((x) => x.url !== c.url) } : s,
        );
      } finally {
        setSwapping(null);
      }
    },
    [key],
  );

  /**
   * 保存できた札に、いま載っている1枚を仮画像として付ける（待たずに呼んでよい）。
   * 失敗しても札は保存済みなので黙って諦める（図鑑の詳細が `use-auto-hero` で探し直す）。
   */
  const chosenRef = useRef<{ key: string | null; chosen: WebImageCandidate | null }>({
    key: null,
    chosen: null,
  });
  chosenRef.current = { key: state.key, chosen: state.chosen };
  const attach = useCallback(
    async (stickerId: string, headword: string) => {
      // 見出しは保存の直前に直ることがある（`adoptResolvedHead`）。絵は探した時の語の物。
      const { key: k, chosen } = chosenRef.current;
      if (!chosen || !k || !headword) return;
      try {
        const path = await uploadWebImage(chosen, fetchImageFn);
        await setPlaceholderFn({
          data: {
            sticker_id: stickerId,
            placeholder_path: path,
            placeholder_credit: chosen.credit
              ? { ...chosen.credit, source: chosen.source }
              : { source: chosen.source },
            only_if_empty: true,
          },
        });
        await qc.invalidateQueries({ queryKey: ["stickers"] });
        await qc.invalidateQueries({ queryKey: ["sticker", stickerId] });
      } catch (e) {
        console.warn("catch image placeholder failed", e);
      }
    },
    [fetchImageFn, setPlaceholderFn, qc],
  );

  const mine = state.key === key && !!key;
  return {
    /** 札に載せるネットの画像（無ければ null — 語を組んだ札を使う）。 */
    image: mine ? state.shown : null,
    /** 「別の画像」の候補。 */
    candidates: mine ? state.candidates : [],
    /** 探し終えたか（絵が決まった・無かった・上限を過ぎた）。 */
    settled: mine ? state.settled : false,
    /** 「別の画像」を読み込んでいる候補の URL。 */
    swapping,
    choose,
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
