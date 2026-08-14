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
 * - 3以上: 1回目→1日、2回目→3日、それ以降は ease 倍に伸ばす。
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
