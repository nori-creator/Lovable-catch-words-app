/**
 * 図鑑の写真表示。**本物の `DexAlbumGrid` / `PackGallery` を描く。**
 *
 * ## なぜ場面を足したか
 * 性能の道具も絵の検査も、全部 `DexShelf`(棚)に向いていた —
 * `content-visibility` も `scripts/shelf-perf.mjs` も雛形の `shelf` 場面も。
 * ところが `src/lib/features.ts` の `DEX_SHELF_ENABLED` は **false** で、
 * 棚は誰にも出ていない。出ているのはこちらなのに、**一度も撮られて
 * いなかった**。
 *
 * ## 2通り在る
 * 既定のパックは `origin` で、その `layout` は `album`。`dex.tsx` の分岐は
 * `layout !== "album"` のときだけ `PackGallery` を使うので:
 *   ・`?scene=gallery`                … `DexAlbumGrid`(**既定。まずこれを見る**)
 *   ・`?scene=gallery&layout=grid`    … `PackGallery`(設定でパックを変えた人)
 *     このとき `<html data-ui-pack="sticker">` も要る — `pack-styles.css` の
 *     セレクタはほぼ全部 `[data-ui-pack]` の下にある。
 *
 * 雛形の札は `shelf` 場面と共有する。同じ札を別の見え方で描くだけなので、
 * 二重に持つと片方だけ直る事故になる。
 */
import { DexAlbumGrid, PackGallery } from "@/routes/_authenticated/dex";
import { makeStickers } from "./shelf";
import type { LayoutId } from "@/lib/ui-pack";

export function GalleryScene({ q }: { q: URLSearchParams }) {
  const count = Number(q.get("count") ?? 8);
  const items = makeStickers(count);
  const layout = q.get("layout");
  if (layout) {
    // **`layout` は実在する `LayoutId` でなければならない。** 綴りを間違えても
    // 絵は出てしまう(`data-layout` が当たらないだけでタイルは描かれる)ので、
    // 型に見張らせる — 最初 "pokedex" と書いて、CSS が一切当たらない絵を
    // 「実物が壊れている」と読み違えた。tsc が止めてくれた。
    //
    // **`<html data-ui-pack>` も要る。** `pack-styles.css` のセレクタは
    // ほぼ全部 `[data-ui-pack]` の下にあり、付けずに描くと下地の規則しか
    // 当たらない。これも一度読み違えた。属性は検査の場面定義
    // (`ui-audit.mjs` の MODES)から渡す。
    return <PackGallery items={items} onOpen={() => {}} layout={layout as LayoutId} />;
  }
  return <DexAlbumGrid items={items} onOpen={() => {}} />;
}
