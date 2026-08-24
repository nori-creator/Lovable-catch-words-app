/**
 * 見開きのアルバム — **左右のページに何をどう並べるか**を決める場所。
 *
 * オーナー指摘 2026-08-21:
 * > 「ホームの画面の日、週、月のボタンを消して。そのかわり、今、アルバムの
 * >  壁紙を変更するところを、**本物の本の背表紙の本棚**にして、背表紙に
 * >  日週、月ごとの本も良いし、**それらをタップすると本物のアルバムの
 * >  ページがめくれて**日ごとのアルバムの写真、週ごとのアルバムの写真が
 * >  見えるようにしたい。…**週ごとと月ごとは、画像の大きさを小さく調整して、
 * >  多くの画像が見えるようにして。**」
 * > 「**それぞれの画像をタップしたら、その画像が左側にその日の日記が右側に
 * >  見開きで**でる。」
 *
 * ## 束ね方で絵の大きさを変える
 * 日ごとなら1日ぶん(数枚)なので大きく置ける。月ごとは何十枚も入るので、
 * 同じ大きさで並べると見開きに収まらず、**本ではなく縦に長い一覧**に戻る。
 * 束ねる幅が広いほど小さく、多く。
 *
 * ## 左右に割る
 * 本は左右で1枚。**左に多く**割る — 日本語の本は右から左へめくるが、
 * この app の紙は横書きで左から読むので、最初に目が行く左を厚くする。
 * 奇数のときに右が1枚多いと、めくった瞬間に右だけ詰まって見える。
 *
 * 外の世界に触れるものをここに入れないこと。
 */

import type { AlbumSpan } from "./album-span";

/** 見開きの片面に並べる絵の形。 */
export type TileLayout = {
  /** 片面の列の数。 */
  cols: number;
  /** 1マスの高さ(px)。 */
  rowHeight: number;
};

/**
 * その束ね方のときの絵の並べ方。
 *
 * 日 → 大きく3列 / 週 → 4列 / 月 → 6列。列が増えるほど1枚は小さくなる。
 */
export function tileLayout(span: AlbumSpan): TileLayout {
  if (span === "month") return { cols: 6, rowHeight: 46 };
  if (span === "week") return { cols: 4, rowHeight: 70 };
  return { cols: 3, rowHeight: 96 };
}

/**
 * 片面に置ける枚数の目安。**これを超えたら次の見開きへ送る。**
 * 4段ぶん。溢れたぶんを黙って捨てると「撮ったのに無い」になるので、
 * 呼ぶ側は必ず次の見開きを作ること。
 */
export function tilesPerPage(span: AlbumSpan): number {
  return tileLayout(span).cols * 4;
}

/** 左右に割った1組。 */
export type Spread<T> = { left: T[]; right: T[] };

/**
 * 1つの束を見開きの左右に割る。
 *
 * **左を厚くする。** 奇数のときに右が1枚多いと、めくった瞬間に右だけ
 * 詰まって見える。
 */
export function splitSpread<T>(items: readonly T[]): Spread<T> {
  const half = Math.ceil(items.length / 2);
  return { left: items.slice(0, half), right: items.slice(half) };
}

/**
 * 束を、1組では入りきらないときに**何組かの見開き**に分ける。
 *
 * 月ごとの束は100枚を超えることがある。1組に詰め込むと1枚が点になるので、
 * ページを送る形にする(本と同じ)。
 */
export function paginateSpread<T>(items: readonly T[], span: AlbumSpan): Spread<T>[] {
  const per = tilesPerPage(span) * 2;
  if (items.length === 0) return [{ left: [], right: [] }];
  const out: Spread<T>[] = [];
  for (let i = 0; i < items.length; i += per) out.push(splitSpread(items.slice(i, i + per)));
  return out;
}

/**
 * 見開きに並べる写真のページ。
 *
 * **日ごとは左に全部、右は日記。** オーナー「左側に今日取った画像、
 * 右側に日記を書く部分」。左右に割ってしまうと、狭い画面で縦に積んだとき
 * 「写真 → 日記 → 写真」の順になり、日記が写真の間に挟まって見える
 * (絵で見つけた)。
 *
 * 週・月は日記を置けない(何日ぶんも入るのでどれを出すか決められない)ので、
 * 左右の両面に写真を並べる。
 */
export function photoPages<T>(items: readonly T[], span: AlbumSpan): Spread<T>[] {
  if (!rightPageIsJournal(span)) return paginateSpread(items, span);
  const per = tilesPerPage(span);
  if (items.length === 0) return [{ left: [], right: [] }];
  const out: Spread<T>[] = [];
  for (let i = 0; i < items.length; i += per)
    out.push({ left: items.slice(i, i + per), right: [] });
  return out;
}

/**
 * 日ごとの見開きでは、**右のページは日記**にする。
 *
 * オーナー「左側に今日取った画像、右側に日記を書く部分」。
 * 週・月には何日ぶんもの日記が入り得るので、どれを右に置くか決められない
 * (適当に1日ぶんだけ出すと、書いた日が消える)。だから写真を両面に並べる。
 */
export function rightPageIsJournal(span: AlbumSpan): boolean {
  return span === "day";
}

/**
 * 絵を1枚選んだときの見開き。
 * 左に**その1枚だけ**、右にその日の日記。束ね方に関わらずこの形。
 */
export function isPhotoFocus(picked: string | null | undefined): boolean {
  return typeof picked === "string" && picked.length > 0;
}
