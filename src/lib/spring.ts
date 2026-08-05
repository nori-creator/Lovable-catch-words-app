/**
 * ばね(spring)— 触れるものの動きはこれで動かす。
 *
 * apple-design §4「振り付けではなく振る舞い」。時間を決め打ちしたアニメーション
 * (CSS transition / keyframes)は、走っている最中に新しい入力が来ても応えられない。
 * 途中で掴んで逆向きに投げ直す、という当たり前のことができない。
 *
 * ばねなら「目標を変える」だけで動きは途切れない。しかも:
 * - §3 いまの**画面上の値**から続く(掴んだ瞬間に飛ばない)
 * - §5 指を離した**速度をそのまま引き継ぐ**(ドラッグと自走の継ぎ目が消える)
 * - §3 逆向きに切り替えても速度が連続する(「壁にぶつかった」感じが出ない)
 *
 * 指定は Apple と同じ2つだけ。質量・剛性・減衰では設計しない。
 * - `damping` 減衰比: 1.0 = 行き過ぎなし。1未満で跳ねる(0.8 くらいが心地よい)
 * - `response` 目標に届くまでのおよその秒数。小さいほど機敏。**持続時間ではない**
 */

export type SpringOptions = {
  /** 減衰比。1.0 = 行き過ぎなし(既定)。勢いのある操作の後だけ 0.8 前後に。 */
  damping?: number;
  /** 目標に届くまでのおよその秒数。小さいほど機敏。 */
  response?: number;
};

export type Spring = {
  /** いまの値(画面に出ている値)。 */
  value: () => number;
  /** いまの速度(px/s)。 */
  velocity: () => number;
  /** 目標を変える。走行中でも呼べる — 速度は引き継がれる。 */
  to: (target: number, opts?: SpringOptions & { velocity?: number }) => void;
  /** 動きを止めてその場に置く(ドラッグを始めるときに使う)。 */
  stop: () => void;
  /** 値も速度も即座に置き換える(1:1追従の最中に使う)。 */
  set: (value: number, velocity?: number) => void;
  /** 後片付け。 */
  dispose: () => void;
};

const DEFAULTS = { damping: 1, response: 0.4 };

/** 収束判定。ここより小さい誤差と速度は目に見えない。 */
const EPS_X = 0.05; // px
const EPS_V = 0.5; // px/s

/**
 * 値ひとつ分のばねを作る。
 *
 * 2次元は**軸ごとに別のばね**にすること(§3)。XとYの速度が違うとき、
 * 距離ひとつのばねにまとめると軸がずれて不自然になる。
 */
export function createSpring(
  initial: number,
  onFrame: (value: number) => void,
  options: SpringOptions = {},
): Spring {
  let x = initial;
  let v = 0;
  let target = initial;
  let damping = options.damping ?? DEFAULTS.damping;
  let response = options.response ?? DEFAULTS.response;
  let raf = 0;
  let last = 0;
  let disposed = false;

  function step(now: number) {
    if (disposed) return;
    // 最初のフレームは経過時間が分からないので1フレーム分とみなす。
    // タブが裏に回っていた場合に備えて上限も掛ける(巨大な dt で発散させない)。
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;

    const omega = (2 * Math.PI) / Math.max(response, 0.0001);
    const k = omega * omega;
    const c = 2 * damping * omega;

    // 半陰的オイラー。速度を先に更新するので、この用途では安定して収束する。
    const a = -k * (x - target) - c * v;
    v += a * dt;
    x += v * dt;

    if (Math.abs(x - target) < EPS_X && Math.abs(v) < EPS_V) {
      x = target;
      v = 0;
      raf = 0;
      last = 0;
      onFrame(x);
      return;
    }
    onFrame(x);
    raf = requestAnimationFrame(step);
  }

  function ensureRunning() {
    if (raf || disposed) return;
    last = 0;
    raf = requestAnimationFrame(step);
  }

  return {
    value: () => x,
    velocity: () => v,
    to(next, opts) {
      target = next;
      if (opts?.damping != null) damping = opts.damping;
      if (opts?.response != null) response = opts.response;
      // 速度を渡さなければ**いまの速度のまま**目標だけ差し替わる。
      // これが「逆向きに投げ直しても壁にぶつからない」理由(§3)。
      if (opts?.velocity != null) v = opts.velocity;
      ensureRunning();
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      v = 0;
    },
    set(value, velocity) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      x = value;
      if (velocity != null) v = velocity;
      onFrame(x);
    },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}

/**
 * 弾いたときに滑り着く先(§6)。Apple の指数減衰の式そのまま。
 * 教科書の v²/(2a) ではないので注意 — 手触りが違う。
 */
export function projectMomentum(velocity: number, decelerationRate = 0.998): number {
  return (velocity / 1000) * (decelerationRate / (1 - decelerationRate));
}

/**
 * 端での抵抗(§9)。行き過ぎるほど付いてこなくなる。
 * 硬く止めると「固まった」と読まれるが、これなら「反応はしている、
 * でもこの先には何も無い」と伝わる。
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  const d = Math.max(dimension, 1);
  return (overshoot * d * constant) / (d + constant * Math.abs(overshoot));
}

/**
 * 直近の位置履歴から離した瞬間の速度(px/s)を出す。
 * 最後の1点だけ見ると指が止まった瞬間に0になってしまうので、
 * 数フレーム分をまとめて見る(§2)。
 */
export function velocityFrom(history: { t: number; x: number }[]): number {
  if (history.length < 2) return 0;
  const a = history[0];
  const b = history[history.length - 1];
  const dt = b.t - a.t;
  if (dt <= 0) return 0;
  return ((b.x - a.x) / dt) * 1000;
}
