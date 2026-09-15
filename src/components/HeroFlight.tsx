import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createSpring } from "@/lib/spring";
import { motionReducedNow } from "@/hooks/use-reduced-motion";

/**
 * 押した所から、開いた先の見出しへ**絵が飛ぶ**。
 *
 * ## オーナー指示 2026-09-15
 * > 「ホームの画像タップしたらその画像がキュッと1度少ししぼんでから
 * >  ぽわっと広がるようにして、単語の詳細に移行するアニメーションを作って。
 * >  今は単語をタップしたらパッと切り替わって単語の詳細に行くけど、
 * >  そこの軌跡アニメーションを実装してほしい」
 *
 * 「キュッ」は押している間の縮み（`.photo-lift:active` — CSS が持つ）。
 * 「ぽわっ」がここ。押した札の**その場所・その大きさ**から始めて、詳細の
 * 見出しの場所・大きさへ広がる。
 *
 * ## なぜ「軌跡」が要るのか
 * 面が差し替わるだけだと、**開いた物と押した物が同じだと分からない**。
 * 指が触れた所から絵が育てば、続きだと目で追える（apple-design §3
 * 「掴んだ物が動く」）。Apple の写真アプリで1枚を開く動きと同じ考え。
 *
 * ## 作り方 — 写しを1枚飛ばす
 * 本物の見出しを動かすのではなく、**同じ絵の写しを画面の一番上に置いて
 * 飛ばす**。本物は下でそのまま組み上がり、写しが着いたら消える。
 * 本物を動かすと、詳細の中の巻き取りや裏返しと喧嘩する。
 *
 * 行き先は `[data-sheet-hero]` を実測して決める。**決め打ちの座標を書かない**
 * — 画面の幅も、上の帯の高さも、端末で変わる。
 */
export type FlightOrigin = {
  /** 押した札の画面上の位置と大きさ。 */
  x: number;
  y: number;
  w: number;
  h: number;
  /** その札がいま出している絵（解決済みの `blob:` か署名URL）。 */
  url: string;
  /** 札の角の丸み(px)。飛びながら行き先の丸みへ変わる。 */
  radius: number;
};

/** 行き先が現れるのを待つ上限。これを過ぎたら黙って諦める（絵は出ている）。 */
const FIND_TIMEOUT_MS = 400;

/**
 * 「ぽわっ」の跳ね（大きさのばねだけに掛ける）。
 *
 * 減衰比 ζ の理論上の行き過ぎは `exp(-πζ/√(1-ζ²))`。ただし `spring.ts` は
 * 1/60 秒刻みの半陰的オイラーなので、**刻みぶんの減衰が余分に入る** —
 * 理屈の値がそのまま出ない。ブラウザで実測した:
 *
 * 200px の札から 358px の見出しへ飛ばして、**いちばん膨らんだ幅 ÷ 行き先の幅**
 * をブラウザで実測した:
 *
 * | `damping` | 理屈 | 実測 | 見え方 |
 * |---|---|---|---|
 * | 0.86 | 0.5% | **1.000 倍** | 何も起きない |
 * | 0.70 | 4.6% | **1.009 倍**（3px） | 目では拾えない |
 * | 0.60 | 9.5% | **1.030 倍**（11px） | はっきり「ぽわっ」 |
 *
 * 跳ねるのは大きさだけで、居場所は跳ねない。だから行き過ぎても
 * **見出しの真ん中からはみ出すだけ**で、滑り過ぎては見えない。
 */
const POP = { damping: 0.6, response: 0.42 } as const;

/**
 * 溶けるまで。行き先の幅に届いてからこれだけ掛けて消える。
 * いちばん膨らむのは届いた**あと**なので、短すぎるとその一瞬が
 * 消えかけの絵になる（140ms では頂点の濃さが 0.64 だった）。
 */
const FADE_MS = 200;

export function HeroFlight({
  origin,
  onArrive,
  onDone,
}: {
  origin: FlightOrigin;
  /**
   * 写しが**行き先の大きさに届いた**時。ここで本物の見出しを出す。
   *
   * 飛んでいる間、本物は隠してある。隠さないと、育っていく写しの下に
   * **大きいままの本物**が見えて二重になる（オーナー指摘 2026-09-15
   * 「画像がチカチカしてなんか二重に表示されてる」）。
   * 届いた時に本物を出し、写しはその上で溶ける = 継ぎ目が見えない。
   */
  onArrive: () => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 動きを減らす設定の人には飛ばさない。**一瞬だけ写しが出て消える**のも
    // 動きなので、何も出さずに終える。
    if (motionReducedNow()) {
      // **本物を隠したままにしない。** 飛ばさないだけで、見出しは要る。
      onArrive();
      onDone();
      return;
    }

    let raf = 0;
    let done = false;
    /** 本物を出したか。**2度出しても害は無いが、1度で済ませる。** */
    let arrived = false;
    const arrive = () => {
      if (arrived) return;
      arrived = true;
      onArrive();
    };
    const springs: Array<ReturnType<typeof createSpring>> = [];
    const t0 = performance.now();

    const finish = () => {
      if (done) return;
      done = true;
      arrive();
      setGone(true);
      onDone();
    };

    const start = (to: DOMRect, toRadius: number) => {
      /**
       * **ばねは px で回す。0〜1 の進み具合では回さない。**
       *
       * `spring.ts` の収束判定は「誤差 0.05 **px**・速度 0.5 **px/s**」。
       * 画面の値を動かす前提の数なので、0〜1 の進み具合に使うと
       * **1 の手前 5% で「もう着いた」と判断して止まる**。
       * 最初にそう書いたら、狙った 4.6% の行き過ぎが実測 0.7% になり、
       * 「ぽわっ」がまったく出ていなかった（ブラウザ実測）。
       * 幅も位置もそのまま px で持たせれば、判定の数と単位が揃う。
       *
       * ・道のり(中心) … 跳ねない(`damping` 1)。着くべき所にまっすぐ着く
       * ・大きさ       … 跳ねる(`POP`、下)
       *
       * 大きさは**真ん中から**膨らませる（中心は道のりのばねが持ち、左上は
       * そこから引く）。左上を基準にすると膨らむたびに右下へ逃げていく。
       */
      const cx = createSpring(origin.x + origin.w / 2, () => {}, { damping: 1, response: 0.4 });
      const cy = createSpring(origin.y + origin.h / 2, () => {}, { damping: 1, response: 0.4 });
      const w = createSpring(origin.w, () => {}, POP);
      const h = createSpring(origin.h, () => {}, POP);
      springs.push(cx, cy, w, h);
      cx.to(to.left + to.width / 2);
      cy.to(to.top + to.height / 2);
      w.to(to.width);
      h.to(to.height);

      /** 1 に届いた時刻。**膨らみきってから**溶かすための目印。 */
      let peakedAt = 0;
      /**
       * **描くのは自分で回す輪から。**
       *
       * ばねに描かせると、ばねが収束して止まった瞬間に呼ばれなくなる。
       * 溶けていく途中で止まると、写しが**半透明のまま画面に残る**
       * （実測: 透明度 0.287 で固まったまま消えなかった）。
       */
      const tick = () => {
        const ww = w.value();
        const hh = h.value();
        const progress = Math.min(1, (ww - origin.w) / (to.width - origin.w || 1));
        el.style.width = `${ww}px`;
        el.style.height = `${hh}px`;
        el.style.left = `${cx.value() - ww / 2}px`;
        el.style.top = `${cy.value() - hh / 2}px`;
        el.style.borderRadius = `${origin.radius + (toRadius - origin.radius) * progress}px`;
        if (!peakedAt && ww >= to.width) {
          peakedAt = performance.now();
          // 届いた。本物の見出しをここで出す（写しはこの上で溶ける）。
          arrive();
        }
        if (peakedAt) {
          const k = (performance.now() - peakedAt) / FADE_MS;
          el.style.opacity = String(Math.max(0, 1 - k));
          if (k >= 1) {
            finish();
            return;
          }
        }
        // 行き先に届かないまま力尽きることが無いよう、上限でも畳む。
        if (performance.now() - t0 > 1500) {
          finish();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    /** 行き先が組み上がるのを待つ。**見つかるまで写しは出ている。** */
    const look = () => {
      const target = document.querySelector<HTMLElement>("[data-sheet-hero]");
      if (target) {
        const r = target.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          const radius = parseFloat(getComputedStyle(target).borderRadius) || 24;
          start(r, radius);
          return;
        }
      }
      if (performance.now() - t0 > FIND_TIMEOUT_MS) {
        // 行き先が見つからない。**本物を隠したままにしない。**
        finish();
        return;
      }
      raf = requestAnimationFrame(look);
    };
    raf = requestAnimationFrame(look);

    return () => {
      cancelAnimationFrame(raf);
      for (const sp of springs) sp.dispose();
    };
    // `origin` は開くたびに新しく作られる値。**1回の飛行につき1回だけ**
    // 走らせたいので、中身ではなく「その飛行」で張る。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gone) return null;
  /**
   * **画面の直下に置く。**
   *
   * `position: fixed` の基準は「画面」— ただし先祖に `transform` や
   * `filter` / `backdrop-filter` が掛かっていると、**その先祖が基準に
   * 変わる**（CSS の仕様どおり）。札の面は `material-thick` =
   * `backdrop-filter` を持っているので、この写しを面の中に置くと基準が
   * 面になる。いまはその面が `fixed inset-0` ＝ちょうど画面いっぱいなので
   * 数は一致するが、**一致は偶然**で、面に余白が付いた日に静かに壊れる。
   * 実測した座標をそのまま書くのだから、基準も画面そのものにしておく。
   */
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed z-[60] overflow-hidden shadow-2xl"
      style={{
        left: origin.x,
        top: origin.y,
        width: origin.w,
        height: origin.h,
        borderRadius: origin.radius,
      }}
    >
      <img src={origin.url} alt="" className="h-full w-full object-cover" />
    </div>,
    document.body,
  );
}
