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
 * **名指しの1枚から始める束**（通知・ホームの「〇か月前に撮ったこの単語、覚えてる？」を
 * 押した時の行き先 `/review?sticker=…`）を置く鍵。
 *
 * オーナー指示 2026-10-07「通知をタップしたらすぐに問題出るようにして。今日の問題を準備中と
 * 言う待ち時間無しで。通知を出すときは復習の画面を用意してからにして」。
 *
 * 普通の束（`REVIEW_CACHE_KEY`）とは**鍵を分ける** — 混ぜると、普通に開いた時に名指しの
 * 並びが出てきて話が合わない（`wanted` でも弾くが、そもそも上書きし合わないように）。
 * 名指しの1枚は1つだけ置く（新しく用意したら前の物は消える）。
 */
export const REVIEW_TARGET_CACHE_KEY = "review-batch-sticker-v1";

/**
 * 名指しの束を**最長どこまで**使うか（書いた時刻から）。
 *
 * 端末の予約通知は**鳴る時に何もできない**（中身は予約した時に決まる）。だから
 * 「通知を出す前に用意する」＝「予約する時に用意する」で、鳴った後に押されるまで束が
 * 生きていないといけない。予約は先 24 時間ぶん・静かな時間で朝へ回すと最大 34 時間ほど
 * 先になるので、`until`（最後の通知の時刻＋押すまでの猶予）まで延ばせるようにし、
 * その上限をここで切る。写真は用意した時に端末へ落とす（`warmCachedImages`）ので、
 * 署名URLが切れても出る。
 */
export const REVIEW_TARGET_MAX_AGE_MS = 48 * 60 * 60_000;

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
 * 書き留めた束をどれだけ使うか。
 *
 * 前は**署名URLの6時間より短く**4時間にしていた（切れたURLでは絵が出ない）。
 * 2026-09-27 から、束が届いた時点で写真を全部端末へ落とす
 * （`warmCachedImages`、保存場所の道で引く）ので、URLが切れても端末から出る。
 * 「アプリを閉じてもすぐ出る」（オーナー指示）を1日の中で効かせるため 20 時間に。
 * 開いて5分より古ければ、まだ1枚も答えていないうちに裏で読み直す（`review.tsx`）。
 */
export const REVIEW_CACHE_MAX_AGE_MS = 20 * 60 * 60_000;

export type CachedBatch<T> = {
  /** 誰の束か。**別の人が入ったら出さない。** */
  user: string;
  /** 名指しの1枚（`?sticker=`）。違えば別の束。 */
  wanted: string | null;
  /** 書き留めた時刻。 */
  at: number;
  /**
   * ここまでは使ってよい（通知の束だけ。鳴る時刻より後まで生かすため）。
   * 無ければ `at` から `maxAgeMs`。あっても `REVIEW_TARGET_MAX_AGE_MS` で切る。
   */
  until?: number;
  cards: T[];
};

/** 書き留める形を作る。**空の束は書き留めない** — 出すと「今日は無し」に見える。 */
export function packBatch<T>(
  cards: readonly T[] | undefined | null,
  user: string,
  wanted: string | null,
  now: number,
  until?: number,
): CachedBatch<T> | null {
  if (!cards || cards.length === 0) return null;
  const packed: CachedBatch<T> = { user, wanted, at: now, cards: [...cards] };
  if (typeof until === "number" && Number.isFinite(until) && until > now) packed.until = until;
  return packed;
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
  const until =
    typeof b.until === "number" && Number.isFinite(b.until)
      ? Math.min(b.until, b.at + REVIEW_TARGET_MAX_AGE_MS)
      : -Infinity;
  if (now - b.at > maxAgeMs && now > until) return null;
  if (!Array.isArray(b.cards) || b.cards.length === 0) return null;
  const out: CachedBatch<T> = { user, wanted, at: b.at, cards: b.cards as T[] };
  if (Number.isFinite(until)) out.until = b.until;
  return out;
}

/**
 * **名指しの1枚から始める束を、端末にある物から組む**（`/review?sticker=…` を開いた時の
 * 最初の描画。待ち時間 0 にするため）。
 *
 * - 先頭: 名指しの1枚。名指しの束（通知を予約した時・ホームの札を出した時に用意）か、
 *   普通の束に居ればそこから。両方に居れば新しい方。
 * - 続き: 2つのうち**新しい方の束**から、名指しの1枚を除いた物（予約してから普通に
 *   復習していたら、その後の束の方が今に近い）。
 *
 * 名指しの1枚がどちらにも居なければ `null`（いつもどおり読み込みから）。
 * 年齢（`at`）は使った束のうち古い方 — 新しく見せると React Query が読み直さない。
 */
export function composeWantedBatch<T extends { sticker_id: string }>(
  wanted: string,
  targeted: CachedBatch<T> | null,
  normal: CachedBatch<T> | null,
): CachedBatch<T> | null {
  const sources = [targeted, normal]
    .filter((b): b is CachedBatch<T> => !!b)
    .sort((a, b) => b.at - a.at);
  if (sources.length === 0) return null;
  let front: T | undefined;
  let frontFrom: CachedBatch<T> | undefined;
  for (const b of sources) {
    front = b.cards.find((c) => c.sticker_id === wanted);
    if (front) {
      frontFrom = b;
      break;
    }
  }
  if (!front || !frontFrom) return null;
  const base = sources[0];
  const rest = base.cards.filter((c) => c.sticker_id !== wanted);
  return {
    user: base.user,
    wanted,
    at: Math.min(frontFrom.at, base.at),
    cards: [front, ...rest],
  };
}

/**
 * **名指しの束の続きを、サーバの新しい束で差し替える**（Codex 指摘 2026-10-07）。
 *
 * 名指しの束は最長 48 時間前に用意した物なので、続きの札が**もう期限でない・1日の上限を
 * 越えている**ことがある。最初の1枚は端末の物ですぐ出し（待たせない）、裏で読み直した
 * 束が届いたら、**いま出している札より後ろだけ**を入れ替える。
 *
 * - `current` の `idx` 枚目まで（答えた札・いま出ている札）はそのまま残す（問題が目の前で
 *   入れ替わらない・答えた位置がずれない）。
 * - 後ろは `fresh` から、残した札と同じ語を除いた物（同じ札を二重に採点しない）。
 *   サーバが何も返さなければ（期限の札が無い・上限）後ろは無くなる。
 */
export function replaceContinuation<T extends { sticker_id: string }>(
  current: readonly T[],
  idx: number,
  fresh: readonly T[],
): T[] {
  const keep = current.slice(0, Math.max(0, idx) + 1);
  const seen = new Set(keep.map((c) => c.sticker_id));
  return [...keep, ...fresh.filter((c) => !seen.has(c.sticker_id))];
}
