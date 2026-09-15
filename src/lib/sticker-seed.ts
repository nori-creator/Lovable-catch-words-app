import type { QueryClient } from "@tanstack/react-query";
import type { StickerWithWord } from "./stickers.functions";

/**
 * **もう手元にある札を、そのまま最初の絵にする。**
 *
 * ## 何が問題だったか（オーナー指摘 2026-09-15）
 * > 「ホームの画像をタップしたらくるくるとロード中が回って単語の詳細が
 * >  開くまでのロードがストレス」
 *
 * ホームも図鑑も `["stickers"]` で**札を丸ごと**持っている。語・読み・意味・
 * 例文・写真のURL・場所・日付、詳細が出すものはほぼ全部そこに在る。
 * それなのに札を1枚開くと `["sticker", id]` という別の鍵で**ゼロから
 * 取り直し**ていたので、`isLoading` が立ち、くるくるが回っていた。
 *
 * **持っている物を出さずに待たせるのは、遅いのではなく無駄。**
 *
 * ## 取り直しはやめない
 * 詳細にしか無いもの（一言の動画 `voice_video_url`、語の枝 `branch_plan`、
 * 復習した回数）は一覧に入っていない。だから**出しながら裏で取り直す** —
 * `initialDataUpdatedAt` に大昔を渡すと、React Query はこの種を
 * 「古い」と見なして即座に取りに行く。画面は最初から埋まっていて、
 * 足りない所だけが後から差し変わる。
 *
 * `1`（1970-01-01 00:00:00.001）を使うのは、`0` が偽値として扱われて
 * 「指定なし＝いま取得した」に倒れる実装があるため。**古いことが伝われば
 * よい**ので、1ミリ秒で足りる。
 */
export const SEED_UPDATED_AT = 1;

type StickerListPage = { items?: StickerWithWord[] } | undefined;

/**
 * `["stickers"]` の一覧から札を1枚探す。見つからなければ `undefined`
 * （撮った直後や、共有リンクから直に開いた時など）。その回は今までどおり
 * 取りに行って待つ — **嘘の中身を作って埋めない。**
 */
export function seedStickerFromList(
  qc: QueryClient,
  id: string | null | undefined,
): StickerWithWord | undefined {
  if (!id) return undefined;
  // 学習言語を切り替えると一覧は取り直されるが鍵は同じなので、
  // `["stickers"]` で始まる物を新しい順に見る。
  const entries = qc.getQueriesData<StickerListPage>({ queryKey: ["stickers"] });
  for (const [, data] of entries) {
    const hit = data?.items?.find((s) => s.id === id);
    if (hit) return hit;
  }
  return undefined;
}
