/**
 * **出した束を、アプリを閉じても憶えておく。**
 *
 * ## オーナー報告 2026-09-15
 * > 「復習の今日の問題を準備中っていうのがいつもラグが長い、他のページや
 * >  アプリを一旦閉じたりすると毎回準備中と表示されストレスです。」
 *
 * ## 2026-08-26 の直しで、半分だけ残っていた
 * あのとき `review-session.ts` に**何枚目まで進んだか**を書き留め、束の
 * 問い合わせに `staleTime` を付けた。それで「別の頁へ行って戻る」は直った。
 *
 * 残っていたのは**束そのもの**で、これは React Query が持っている＝
 * **メモリの上にしか無い**。アプリを閉じる、Android が背面のアプリを
 * 畳む、`gcTime`(既定5分)を過ぎる — どれが起きても束は消え、次に開いた
 * ときは何も無い所から `getDueReviews` をやり直す。あれはこの app で
 * いちばん重い問い合わせで、
 *   ・期限切れを全部読む
 *   ・写真と音声の署名URLを作る（各6時間有効）
 *   ・4択を組む
 *   ・辞書から囮を引く
 * と往復が10回以上ある。だから毎回「準備中…」が出る。
 *
 * ## ここが持つのは「前に出した束」だけ
 * 何枚目まで進んだかは `review-session.ts` の持ち物。ここは束の中身だけを
 * 書き留め、開いた瞬間に**前の束をそのまま出す**ための物。新しいかどうかの
 * 判断は React Query に任せる（裏で読み直して、届いたら差し替わる）。
 *
 * ## 署名URLの寿命より短く切る
 * 写真と音声のURLは6時間で切れる（`reviews.functions.ts`）。切れた束を
 * 出すと**絵の出ない札**が並ぶので、余裕を見て4時間で捨てる。
 * 「古いかもしれない」より「壊れている」ほうがずっと悪い。
 *
 * ここには外の世界に触れるものを入れないこと（`localStorage` は呼ぶ側）。
 */

/** `localStorage` の鍵。版を付けて、形を変えた日に古い物を無視できるように。 */
export const REVIEW_CACHE_KEY = "review-batch-v1";

/**
 * **いま入っている人の id を置いておく鍵。**
 *
 * 束を出すかどうかは**最初の描画で**決めないといけない（後から決めると、
 * 一瞬「準備中」が出てから差し替わる = いちばん落ち着かない見え方）。
 * ところが `supabase.auth.getUser()` は待つ形なので、そこでは間に合わない。
 *
 * そこで、入った / 出た / 変わったの度に id をここへ写しておく
 * (`__root.tsx`)。**Supabase の内部の置き場所は読まない** — あちらの都合で
 * 形が変わると静かに壊れるので、自分の鍵だけを見る。
 */
export const REVIEW_CACHE_USER_KEY = "uid-v1";

/**
 * 書き留めた束をどれだけ使うか。**署名URLの6時間より短く。**
 * 4時間 = 6時間の寿命に2時間の余裕。
 */
export const REVIEW_CACHE_MAX_AGE_MS = 4 * 60 * 60_000;

export type CachedBatch<T> = {
  /** 誰の束か。**別の人が入ったら出さない。** */
  user: string;
  /** 名指しの1枚（`?sticker=`）。違えば別の束。 */
  wanted: string | null;
  /** 書き留めた時刻。 */
  at: number;
  cards: T[];
};

/** 書き留める形を作る。**空の束は書き留めない** — 出すと「今日は無し」に見える。 */
export function packBatch<T>(
  cards: readonly T[] | undefined | null,
  user: string,
  wanted: string | null,
  now: number,
): CachedBatch<T> | null {
  if (!cards || cards.length === 0) return null;
  return { user, wanted, at: now, cards: [...cards] };
}

/**
 * 書き留めた束を読む。**出してよい物だけ返す。**
 *
 * 次のどれかに当たれば `null`（＝いつもどおり読み込みから始める）:
 *   ・形が違う / 壊れている（`localStorage` は人が触れる）
 *   ・別の人の束
 *   ・別の名指し
 *   ・古すぎる（署名URLが切れている恐れ）
 */
export function readBatch<T>(
  raw: string | null | undefined,
  user: string,
  wanted: string | null,
  now: number,
  maxAgeMs: number = REVIEW_CACHE_MAX_AGE_MS,
): CachedBatch<T> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const b = parsed as Partial<CachedBatch<T>>;
  if (typeof b.user !== "string" || b.user !== user) return null;
  if ((b.wanted ?? null) !== wanted) return null;
  if (typeof b.at !== "number" || !Number.isFinite(b.at)) return null;
  // 先の時刻が入っていたら信じない（端末の時計が動いた後など）。
  if (b.at > now) return null;
  if (now - b.at > maxAgeMs) return null;
  if (!Array.isArray(b.cards) || b.cards.length === 0) return null;
  return { user, wanted, at: b.at, cards: b.cards as T[] };
}
