/**
 * 復習の間隔を決める計算(SM-2 の簡略版)と、忘却曲線。
 *
 * ## なぜ別ファイルにしたか
 * これは `reviews.functions.ts` の中にあった。あのファイルは
 * `createServerFn` と Supabase を読み込むので、**この計算だけを取り出して
 * 確かめることができない**。アプリでいちばん間違えたら痛い計算 —
 * 間違えても誰も気づかないまま「いつ出すか」が狂い続ける計算 — が、
 * 試しようのない場所に置かれていた。
 *
 * ここには外の世界に触れるものを一切入れないこと。入れた瞬間に、
 * また試せなくなる。
 *
 * ---
 *
 * # 点検 2026-09-15（オーナー指示「復習の最適な頻度のアルゴリズムが
 * 科学的に正しいか点検して」）
 *
 * 出典と1行ずつ突き合わせた。**合っている所**:
 *
 * | | SM-2 の原典 | この実装 |
 * |---|---|---|
 * | 1回目の間隔 | 1日 | 1日 ✓ |
 * | n>2 の間隔 | 前の間隔 × EF | 同じ ✓ |
 * | EF の更新式 | `EF + (0.1 − (5−q)(0.08 + (5−q)0.02))` | 同じ ✓ |
 * | EF の下限 | 1.3 | 1.3 ✓ |
 * | q<3 のとき | 連続回数 0・間隔 1日・**EF は変えない** | 同じ ✓ |
 *
 * 採点も二値ではなく 1〜5 を実際に使っている（正解 5、ぼかしを見たら −1、
 * 8秒超で −1、ヒント 2、不正解 1）。二値 SM-2 だと EF が上がる一方になり
 * 「難しい語」の信号が消えるので、ここは原典の意図に沿っている。
 *
 * ## ずれ ①：2回目の間隔が **3日**（原典は 6日）
 * 意図的に短くしたもので、間違いではない（復習は増えるが取りこぼしは減る）。
 * ただし**どこにも書いていなかった**ので、ここに書き留める。戻すなら
 * `interval_days = 6` の1箇所。
 *
 * ## ずれ ②：**出す日と、画面が言う「最適な日」が食い違っている**
 * こちらは表示と計算の不一致で、**直す価値がある**。
 *
 * 安定度を `S = 間隔 × ease` と置いているので、`R(t) = exp(−t/S)` に
 * 出題日 `t = 間隔` を入れると `R = exp(−1/ease)` ＝ ease 2.5 で **67%**、
 * ease 1.3 なら 46%。つまり**この app は「67% まで落ちた頃」に出している**。
 *
 * 一方、忘却曲線の画面は「85% 付近がいちばんおいしい復習タイミング」と
 * 書き、その日を `S·ln(1/0.85)` で出している。間隔 30日の語で測ると:
 *
 * | | いまの式 |
 * |---|---|
 * | 安定度 | 75.0日 |
 * | 出題日(30日後)の定着度 | **67%** |
 * | 画面が言う「最適日」 | **12.2日後** |
 *
 * **出題日より 18日も前**を最適だと言っている。SuperMemo も Anki も
 * FSRS も、狙いは「出題時に約 90%」（FSRS は安定度を
 * *R が 0.9 に落ちるまでの日数* と定義している）。ここだけが別の値で
 * 動いていて、しかも画面の文言とも合っていない。
 *
 * 直すなら `stabilityOf` を `間隔 / ln(1/0.9) ≒ 間隔 × 9.49` にすると、
 * どの語も出題日にちょうど 90% になり、曲線と出題日が噛み合う。
 *
 * **ただし勝手には変えない。** 定着度の数字は `lib/memory.ts` の6段
 * (30/50/70/85%) の閾値と、上の帯グラフの語数に直結している。式を変えると
 * **ほぼ全部の語が「長期記憶」へ動く** — 見た目の意味が変わる作業なので、
 * オーナーの判断を待つ（2026-09-15 時点で保留）。
 */

export type SrsState = {
  /** 覚えやすさ。大きいほど間隔が伸びる。下限 1.3。 */
  ease: number;
  /** 次に出すまでの日数。 */
  interval_days: number;
  /** 連続で正解した回数。間違えると 0 に戻る。 */
  repetitions: number;
};

/** 間違いと見なす境目。3未満は「思い出せなかった」。 */
export const LAPSE_SCORE = 3;
/** ease の下限。ここを割ると間隔が縮み続けて復習が終わらなくなる。 */
export const MIN_EASE = 1.3;

/**
 * 採点(0〜5)から次の状態を出す。
 *
 * - 3未満(思い出せなかった): 連続回数を捨てて**明日また出す**。
 *   ease はここでは動かさない — 失敗のたびに ease まで削ると、
 *   一度つまずいた語が二度と間隔を伸ばせなくなる。
 * - 3以上: 1回目→1日、2回目→**3日**、それ以降は ease 倍に伸ばす。
 *   原典の SM-2 は2回目が **6日**。短くしてあるのは意図（上の点検 ①）。
 */
export function nextSrs(prev: SrsState, score: number): SrsState {
  let { ease, interval_days, repetitions } = prev;
  if (score < LAPSE_SCORE) {
    repetitions = 0;
    interval_days = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval_days = 1;
    else if (repetitions === 2) interval_days = 3;
    else interval_days = Math.round(interval_days * ease);
    ease = Math.max(MIN_EASE, ease + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02)));
  }
  return { ease, interval_days, repetitions };
}

/**
 * 記憶の安定度(日)。大きいほどゆっくり忘れる。
 *
 * 未復習のカードは `interval_days` が 0 になる。そのまま計算すると
 * 安定度が 0.5 日になり、**キャッチした直後の語が数時間で「忘れかけ」に
 * 落ちる**。実感と食い違うので、下限を1日ぶんに持ち上げてある。
 */
export function stabilityOf(interval_days: number, ease: number): number {
  return Math.max(0.5, Math.max(1, interval_days) * Math.max(1, ease));
}

/**
 * いまの定着度(0〜100)。指数の忘却曲線。
 *
 * `lastMs` は「記憶の起点」— 最後に復習した時刻、無ければその語に
 * 出会った時刻。null(どちらも無い)なら、まだ忘れる時間が経っていない
 * ということなので 100 を返す。
 */
export function retentionNow(
  interval_days: number,
  ease: number,
  lastMs: number | null,
  nowMs: number,
): number {
  if (lastMs == null) return 100;
  const dt = (nowMs - lastMs) / 86400_000;
  if (dt <= 0) return 100;
  return Math.max(0, Math.min(100, 100 * Math.exp(-dt / stabilityOf(interval_days, ease))));
}

export type ReviewMode = "recognition" | "listening" | "reverse" | "production";

/**
 * 何回目の復習かで出題形式を変える。
 * 見て分かる → 聞いて分かる → 意味から言える → 使える、の順に上げていく。
 */
export function modeFor(repetitions: number): ReviewMode {
  if (repetitions <= 1) return "recognition";
  if (repetitions <= 3) return "listening";
  if (repetitions <= 5) return "reverse";
  return "production";
}
