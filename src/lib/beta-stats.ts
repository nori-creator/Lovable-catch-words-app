/**
 * ベータ分布の数値。**「だいたい何%か」ではなく「どこからどこまでか」**を
 * 言うために要る。
 *
 * オーナー指摘 2026-08-21:
 * > 「出会う見込みの確率が**適当すぎる**。最新数学の確率の論文を研究し
 * >  分析し、ユーザーが出会う確率を**精密に**推定して。」
 *
 * ## 「精密に」は桁を増やすことではない
 * 4人しか使っていないアプリで「58%」と出すのは、精密なのではなく
 * **精密なふり**をしている。本当に精密にするなら、
 * **どれだけ分かっていないか**まで出さなければならない。
 * ベータ分布の事後から区間を出せば「45〜72%」と言える。
 * 人が増えれば区間はひとりでに狭くなる。
 *
 * ## 近似で済ませない
 * 正規近似は α や β が小さいときに大きく外れる(まさに今のこのアプリ)。
 * 正則化不完全ベータ関数を連分数で出し、そこから二分法で分位点を取る。
 * どちらも古典的で、実装が短く、決定的(乱数を使わない)。
 *
 * 外の世界に触れるものをここに入れないこと。
 */

/** log Γ(x)。Lanczos 近似(g=7, n=9)。x > 0 のみ。 */
export function lgamma(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return Number.NaN;
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // 反射公式。Γ(x)Γ(1−x) = π / sin(πx)
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  const z = x - 1;
  let a = c[0];
  const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** 連分数(Lentz 法)。`regularizedIncompleteBeta` の中身。 */
function betacf(x: number, a: number, b: number): number {
  const TINY = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-16) break;
  }
  return h;
}

/**
 * 正則化不完全ベータ関数 I_x(a,b) = P(X ≤ x), X ~ Beta(a,b)。
 * 壊れた入力では NaN を返さず、端に寄せる。
 */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  if (a <= 0 || b <= 0) return Number.NaN;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = lgamma(a + b) - lgamma(a) - lgamma(b);
  const front = Math.exp(lbeta + a * Math.log(x) + b * Math.log1p(-x));
  // 収束の速いほうから攻める(これをしないと端で桁が落ちる)。
  return x < (a + 1) / (a + b + 2)
    ? (front * betacf(x, a, b)) / a
    : 1 - (front * betacf(1 - x, b, a)) / b;
}

/**
 * Beta(a,b) の p 分位点。二分法。
 *
 * **反復を打ち切らない。** 60回で区間の幅は 2^-60 まで縮む。
 * 連分数のほうが誤差の主因なので、これで十分。
 */
export function betaQuantile(p: number, a: number, b: number): number {
  if (!Number.isFinite(p) || !Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  if (a <= 0 || b <= 0) return Number.NaN;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (regularizedIncompleteBeta(mid, a, b) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * 等裾の信用区間。既定は 80%(両側 10% ずつ)。
 *
 * **95% にしない。** 4人しか使っていない今、95% 区間は「3%〜97%」に
 * なって画面では何も言っていないのと同じになる。80% は
 * 「だいたいこのあたり」を伝える幅で、人が増えれば素直に狭くなる。
 */
export function betaInterval(a: number, b: number, mass = 0.8): { lo: number; hi: number } {
  const m = Math.min(0.999, Math.max(0.01, Number.isFinite(mass) ? mass : 0.8));
  const tail = (1 - m) / 2;
  const lo = betaQuantile(tail, a, b);
  const hi = betaQuantile(1 - tail, a, b);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1 };
  return { lo: Math.min(lo, hi), hi: Math.max(lo, hi) };
}
