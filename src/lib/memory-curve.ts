import { memoryLevel } from "./memory";
import { TARGET_RETENTION } from "./srs";

/**
 * 忘却曲線の**形**を決める所。描画（recharts）からは切り離してある。
 *
 * （オーナー指摘 2026-09-22「記憶のグラフが見づらい」）で直したこと:
 *
 *  ・**「復習5回なのに点が2つしか無い」** — 以前は曲線を直近45日で切り、
 *    さらに**日単位に丸めていた**ので、古い復習は枠の外へ落ち、同じ日の
 *    復習は1点に潰れていた。いまは**全ての復習**を1つずつ残す。
 *  ・**今日がどこか分からない** — 今日の位置を `today` として返す。
 *  ・**点線が見にくい** — これまで（実線）と、復習しなかった場合の予測
 *    （点線は1本だけ）を分けて返す。補助線の点線は描画側で全部やめた。
 *  ・**下の日付が多すぎる** — 目盛りは「今日・復習した日・復習どき」だけ。
 *
 * 保持率のモデルは従来どおり `R(t) = exp(-t / S)`。S（安定度）は
 * `lib/srs.ts` の `stabilityOf` から来た値を受け取る（式を写さない）。
 */

const DAY = 86_400_000;

/** 記憶の出来事 = 復習した瞬間（無ければ出会った瞬間）と、その後の安定度。 */
export type CurveEvent = { t: number; stability: number };

/** d = 今日からの日数（小数）。r = 保持率 0〜100。 */
export type CurvePoint = { d: number; r: number };

export type TickKind = "today" | "review" | "best";
export type CurveTick = { d: number; kind: TickKind };

export type MemoryCurve = {
  /** これまで。復習の瞬間は同じ d に「直前」と「100」の2点が並ぶ（垂直に回復）。 */
  past: CurvePoint[];
  /** 今日から先、**復習しなかった場合**の予測。先頭は今日の点。 */
  future: CurvePoint[];
  /** 復習した日（今日からの日数）。**同じ日の複数回も別々に残す。** */
  reviews: number[];
  /** 今日の保持率。 */
  todayR: number;
  /**
   * 復習どき = 保持率が {@link BEST_R}% まで下がる日（今日からの日数、小数）。
   * 0 以下なら**もう来ている**。
   */
  bestDay: number;
  /** 横軸の範囲。 */
  domain: [number, number];
  /** 軸に出す目盛り。今日・復習どき・復習日だけ。 */
  ticks: CurveTick[];
};

/**
 * 復習どき = **復習の間隔を決めている狙いの保持率**（`srs.ts` の
 * `TARGET_RETENTION`、90%）。
 *
 * 以前のグラフは 85% の日を「ベスト復習」と呼び、隣に「次の出題」（90% の
 * 日）を並べていた。**同じ画面に復習の日が2つ**あり、どちらに従えばいいか
 * 分からない。狙いの値を1つにすれば、グラフの「復習どき」と、アプリが
 * 実際に出題する日がそろう。
 */
export const BEST_R = Math.round(TARGET_RETENTION * 100);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const retention = (dtDays: number, stability: number) =>
  clamp(100 * Math.exp(-Math.max(0, dtDays) / Math.max(0.1, stability)), 0, 100);
/** 表示は整数（記憶率は推定値なので小数は偽りの精度）。日は 0.01 日まで。 */
const r0 = (v: number) => Math.round(v);
const d2 = (v: number) => Math.round(v * 100) / 100;

/** 1区間を何点で描くか。指数の坂が滑らかに見える最小限。 */
const SEG_STEPS = 16;

export function buildMemoryCurve(
  events: CurveEvent[],
  nowMs: number,
  opts: {
    /**
     * 出会った（撮った）瞬間。線の**始まり**にするが、復習ではないので
     * 復習の印も目盛りも付けない。最初の復習より後なら使わない。
     */
    encounter?: CurveEvent | null;
  } = {},
): MemoryCurve | null {
  const ok = (e: CurveEvent) => Number.isFinite(e.t) && Number.isFinite(e.stability);
  // 未来の出来事（端末の時計ずれ）は今日に寄せる。
  const norm = (e: CurveEvent) => ({ t: Math.min(e.t, nowMs), stability: e.stability });
  const revs = events
    .filter(ok)
    .map(norm)
    .sort((a, b) => a.t - b.t);
  const enc = opts.encounter && ok(opts.encounter) ? norm(opts.encounter) : null;
  const ev = enc && (revs.length === 0 || enc.t < revs[0].t) ? [enc, ...revs] : revs;
  if (ev.length === 0) return null;

  const dOf = (ms: number) => (ms - nowMs) / DAY;

  // ---- これまで（実線） ----
  const past: CurvePoint[] = [];
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    const startD = dOf(e.t);
    if (i > 0) {
      // 復習の直前の値 → 100 へ垂直に戻る。
      const prev = ev[i - 1];
      past.push({ d: d2(startD), r: r0(retention((e.t - prev.t) / DAY, prev.stability)) });
    }
    past.push({ d: d2(startD), r: 100 });
    const endMs = i + 1 < ev.length ? ev[i + 1].t : nowMs;
    for (let k = 1; k <= SEG_STEPS; k++) {
      const ms = e.t + ((endMs - e.t) * k) / SEG_STEPS;
      if (ms <= e.t) break;
      // 次の復習の瞬間の点は、次の区間の先頭が置く（二重に置かない）。
      if (i + 1 < ev.length && k === SEG_STEPS) break;
      past.push({ d: d2(dOf(ms)), r: r0(retention((ms - e.t) / DAY, e.stability)) });
    }
  }

  const last = ev[ev.length - 1];
  const sinceLast = (nowMs - last.t) / DAY;
  const todayR = r0(retention(sinceLast, last.stability));
  // 今日の点は必ず線の終わりに置く（今日キャッチした語でも線が1点で終わらない）。
  if (past.length === 0 || past[past.length - 1].d !== 0) past.push({ d: 0, r: todayR });

  // ---- 復習どき ----
  const bestDay = d2(dOf(last.t) + last.stability * Math.log(100 / BEST_R));

  // ---- 横軸の範囲 ----
  // 右端は「半分忘れる日」あたりまで — 復習しないと**どこまで落ちるか**が
  // 見えないと、予測の点線を描く意味が無い。ただし復習どきより先は必ず含め、
  // 最低1週間・最長半年に収める。
  //
  // さらに**未来に横幅の4割**は残す。復習の歴が長いと過去が軸を占め、
  // 肝心の「これから」が右端の数ミリに潰れる（実測: 過去69日・未来7日）。
  const halfDay = dOf(last.t) + last.stability * Math.LN2;
  const start = Math.floor(Math.min(0, dOf(ev[0].t)));
  const end = Math.ceil(clamp(Math.max(halfDay, bestDay + 3, 7, -start * (2 / 3)), 7, 180));

  // ---- これから（点線・復習しなかった場合） ----
  const future: CurvePoint[] = [{ d: 0, r: todayR }];
  for (let k = 1; k <= SEG_STEPS * 2; k++) {
    const d = (end * k) / (SEG_STEPS * 2);
    future.push({ d: d2(d), r: r0(retention(sinceLast + d, last.stability)) });
  }

  const reviewDays = revs.map((e) => d2(dOf(e.t)));

  return {
    past,
    future,
    reviews: reviewDays,
    todayR,
    bestDay,
    domain: [start, end],
    ticks: curveTicks({ reviews: reviewDays, bestDay, domain: [start, end] }),
  };
}

/**
 * 目盛り。**今日・復習どき・復習した日だけ**を、重ならない間隔で選ぶ。
 * 優先は 復習どき ＞ 今日 ＞ 新しい復習日。軸の幅の 14% より近い目盛りは
 * 後から来た方を落とす（字が重なると、どれも読めなくなる）。
 */
export function curveTicks({
  reviews,
  bestDay,
  domain,
}: {
  reviews: number[];
  bestDay: number;
  domain: [number, number];
}): CurveTick[] {
  const [lo, hi] = domain;
  const gap = Math.max(1, (hi - lo) * 0.14);
  // 復習どきを今日より先に取る。今日は点の上に「今日 N%」と出ているので、
  // 近すぎて片方しか置けないときは、軸には**復習どきの日付**を残す。
  const want: CurveTick[] = [];
  if (bestDay > 0 && bestDay <= hi) want.push({ d: bestDay, kind: "best" });
  want.push({ d: 0, kind: "today" });
  for (const d of [...reviews].sort((a, b) => b - a)) {
    if (d >= lo) want.push({ d, kind: "review" });
  }
  const out: CurveTick[] = [];
  for (const tk of want) {
    if (out.some((o) => Math.abs(o.d - tk.d) < gap)) continue;
    out.push(tk);
  }
  return out.sort((a, b) => a.d - b.d);
}

/**
 * 線を**縦軸の値で塗り分ける**ための色の区切り。
 *
 * SVG の線形グラデーション（線の外接矩形の上端 = 0, 下端 = 1）の止まり位置
 * を返す。段の境目で色が**すぱっと**変わるよう、同じ位置に2つ置く。
 * 段の境目は `memoryLevel` と同じ（30 / 50 / 70 / 85 / 95）— 一覧やバッジと
 * 同じ色が同じ高さに来る。
 *
 * 高さが無い線（全部同じ値）は外接矩形の高さが 0 になり、SVG はグラデー
 * ションを塗らない（線ごと消える）。その場合は null を返し、単色で描かせる。
 */
export const LEVEL_EDGES = [30, 50, 70, 85, 95] as const;

export function gradientStops(values: number[]): Array<{ offset: number; level: number }> | null {
  if (values.length === 0) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max - min < 1) return null;
  const pos = (r: number) => clamp((max - r) / (max - min), 0, 1);
  const stops: Array<{ offset: number; level: number }> = [
    { offset: 0, level: memoryLevel(max).level },
  ];
  // 上（高い値）から下へ。
  for (const edge of [...LEVEL_EDGES].reverse()) {
    if (edge <= min || edge > max) continue;
    const o = pos(edge);
    stops.push({ offset: o, level: memoryLevel(edge).level });
    stops.push({ offset: o, level: memoryLevel(edge - 0.001).level });
  }
  stops.push({ offset: 1, level: memoryLevel(min).level });
  return stops;
}

/** 単色で描くときの色の段。 */
export function levelOfR(r: number): number {
  return memoryLevel(r).level;
}

/**
 * 復習の印を**同じ日ごと**にまとめる。同じ日に2回復習すると印が重なり、
 * 「5回なのに4つ」に見える — まとめた印に回数（×2）を添えるために使う。
 */
export function groupReviews(reviews: number[]): Array<{ d: number; n: number }> {
  const out: Array<{ d: number; n: number }> = [];
  for (const d of [...reviews].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && d - last.d < 1) last.n += 1;
    else out.push({ d, n: 1 });
  }
  return out;
}
