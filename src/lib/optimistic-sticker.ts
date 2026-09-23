import type { StickerWithWord } from "./stickers.functions";

/**
 * 保存が済んだ札を、**図鑑の手元の一覧に先に入れておく**。
 *
 * ## オーナー報告 2026-09-22
 * > 単語をキャッチしたときの祝福の演出、単語の発音をされたあとに
 * > その画面のまま4秒位停止してる。
 *
 * ## 止まっていた理由
 * 演出は保存が済むと図鑑へ移り、**いま捕まえた札のマス目が現れるのを
 * 待って**そこへ絵を着地させる（`v5_reward` の `waitForDestination`、
 * 最長 5 秒）。ところがマス目は、図鑑が**全部の札を読み直し終えて**
 * 初めて描かれる — 保存の直後に一覧を「古い」印にするだけで、
 * 新しい札そのものはどこにも入っていなかった。持っている札が多い人ほど
 * 読み直しは長く、その間ずっと演出の覆い（画面いっぱいの複製）が
 * 被さったまま動かないので、**同じ画面で固まった**ように見えていた。
 *
 * ## 直し方
 * 保存が返した id と、手元に既にある語・写真から札を1枚組み、一覧の
 * **先頭に差し込む**。マス目は図鑑を開いた瞬間に在る。読み直しは
 * そのまま裏で走り、届いたら本物に置き換わる（同じ id なので二重にならない）。
 *
 * 写真は**アップロード前の手元のデータ**を使う。署名付き URL を待つ
 * 必要が無く、同じ絵なので置き換わっても見た目は変わらない。
 */
export type StickerListCache = {
  items: StickerWithWord[];
  truncated?: boolean;
  total?: number | null;
  [key: string]: unknown;
};

export function prependSticker<T extends StickerListCache>(
  cache: T | undefined,
  item: StickerWithWord,
): T | undefined {
  // まだ一度も読んでいない（図鑑を開いたことが無い）なら触らない。
  // 形の分からない物を作ると、図鑑側が本物を待たずにそれを描いてしまう。
  if (!cache || !Array.isArray(cache.items)) return cache;
  // 既に在る（読み直しが先に届いた）なら、本物を残す。
  if (cache.items.some((s) => s.id === item.id)) return cache;
  return {
    ...cache,
    items: [item, ...cache.items],
    total: typeof cache.total === "number" ? cache.total + 1 : cache.total,
  };
}
