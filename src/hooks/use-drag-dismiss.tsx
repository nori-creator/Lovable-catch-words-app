import { useCallback, useEffect, useRef } from "react";
import {
  APPLE_SPRING,
  createSpring,
  projectMomentum,
  rubberband,
  velocityFrom,
  type Spring,
} from "@/lib/spring";

/**
 * 下へ引いて閉じる。**覆っている面を、指で押しのけられるようにする。**
 *
 * ## なぜ要るのか
 * この app の「シート」4本はどれも `fixed inset-0` の全画面の面で、
 * 出入りは 10px 浮いて薄くなるだけだった。**掴む余地が無い** —
 * ドラッグで閉じる・つまみ・引いたときの抵抗、どれも無し。
 * iOS で覆いが出たとき人がまずやるのは「下へ払う」ことなので、
 * そこに何も起きないと、その面は**貼り付いている**ように感じる。
 *
 * ## 置き換えではなく、足す
 * vaul(導入済み)に載せ替える手もあるが、対象は 597〜1278 行の大きな部品で、
 * 外枠を差し替えると中身の寸法の前提まで動く。ここは**既存の構造を保ったまま**
 * 掴む余地だけを足す。
 *
 * ## 使っている物は全部すでにあった
 * `lib/spring.ts` には `rubberband`(端の抵抗)・`projectMomentum`(弾いた先)・
 * `velocityFrom`(離した速度)が揃っていたが、**`rubberband` は呼び出し 0 の
 * 死んだコード**で、他の2つも1箇所でしか使われていなかった。ここで全部使う。
 *
 * ## 作法(apple-design)
 * - §15 掴んだ位置からの相対で動かす。指の下へ飛ばさない
 * - §15 `setPointerCapture` で、面の外へ出ても追従を切らさない
 * - §16 走行中に掴み直せる。閉じかけを掴めば指に戻る
 * - §18 離した速度を引き継ぎ、**弾いた先**を見て閉じるか戻すか決める
 * - §19 端(上向き)は `rubberband` で、引くほど重くなる
 * - 動きを減らす設定のときは、追従そのものを止める(掴めるが動かない、では
 *   なく**掴めない**。中途半端に動くほうが分かりにくい)
 */

/** 閉じると判断する距離（面の高さに対する割合）。 */
const DISMISS_RATIO = 0.32;
/** これより速く下へ払ったら、距離が足りなくても閉じる（px/s）。 */
const FLING_VELOCITY = 550;

export function useDragDismiss({
  onDismiss,
  enabled = true,
}: {
  onDismiss: () => void;
  /** 動きを減らす設定や、閉じられない面では false。 */
  enabled?: boolean;
}) {
  const sheetRef = useRef<HTMLElement | null>(null);
  const springRef = useRef<Spring | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const drag = useRef({
    id: -1,
    /** 掴んだ瞬間の指の位置。 */
    startY: 0,
    /** 掴んだ瞬間に面がどれだけ下がっていたか(§15 掴んだ位置を尊重する)。 */
    startOffset: 0,
    axis: "" as "" | "x" | "y",
    startX: 0,
    history: [] as { t: number; x: number }[],
    dismissing: false,
  });

  const paint = useCallback((y: number) => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transform = y === 0 ? "" : `translate3d(0, ${y}px, 0)`;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const s = createSpring(0, paint, APPLE_SPRING.snappy);
    springRef.current = s;
    return () => {
      s.dispose();
      springRef.current = null;
    };
  }, [enabled, paint]);

  /**
   * 中身が一番上まで送られているときだけ、引いて閉じられる。
   * 途中まで読んでいる所で下へ引いたら、**それは読み戻しであって
   * 閉じる意思ではない**。iOS の面も同じ約束で動いている。
   */
  const canStartFrom = (target: EventTarget | null): boolean => {
    let el = target as HTMLElement | null;
    while (el && el !== sheetRef.current) {
      const style = getComputedStyle(el);
      const scrolls = /(auto|scroll)/.test(style.overflowY);
      if (scrolls && el.scrollHeight > el.clientHeight) return el.scrollTop <= 0;
      el = el.parentElement;
    }
    return true;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled || drag.current.id !== -1) return;
    if (e.pointerType === "mouse") return;
    if (!canStartFrom(e.target)) return;
    const d = drag.current;
    d.id = e.pointerId;
    d.startY = e.clientY;
    d.startX = e.clientX;
    d.axis = "";
    d.dismissing = false;
    // 走行中に掴んだら、**いまの位置から**続ける(§16)。
    const s = springRef.current;
    d.startOffset = s ? s.value() : 0;
    s?.stop();
    d.history = [{ t: performance.now(), x: d.startOffset }];
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (e.pointerId !== d.id) return;
    const dy = e.clientY - d.startY;
    const dx = e.clientX - d.startX;

    if (d.axis === "") {
      // 10px 動くまでは向きを決めない。決めた後は変えない —
      // 途中で横に流れるたびに判定が揺れると、面がぷるぷるする。
      if (Math.abs(dy) < 10 && Math.abs(dx) < 10) return;
      d.axis = Math.abs(dy) > Math.abs(dx) * 1.2 ? "y" : "x";
      if (d.axis === "x") {
        d.id = -1;
        return;
      }
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }

    let next = d.startOffset + dy;
    // 上へは行き先が無い。引くほど重くする(§19)。硬く止めると「固まった」
    // と読まれるが、これなら「反応はしているが、この先は無い」と伝わる。
    if (next < 0) {
      const h = sheetRef.current?.offsetHeight ?? window.innerHeight;
      next = -rubberband(-next, h);
    }
    d.history.push({ t: performance.now(), x: next });
    if (d.history.length > 6) d.history.shift();
    springRef.current?.set(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (e.pointerId !== d.id) return;
    d.id = -1;
    if (d.axis !== "y") return;

    const s = springRef.current;
    if (!s) return;
    const current = s.value();
    const v = velocityFrom(d.history);
    const h = sheetRef.current?.offsetHeight ?? window.innerHeight;

    // **弾いた先を見る**(§18)。いまの位置ではなく、この速度で滑った先が
    // 閾値を越えるなら閉じる。短く速く払う操作がちゃんと閉じるのはこれのため。
    const projected = current + projectMomentum(v);
    const shouldDismiss = projected > h * DISMISS_RATIO || v > FLING_VELOCITY;

    if (shouldDismiss) {
      d.dismissing = true;
      // 離した速度をそのまま引き継いで画面外へ(§18 継ぎ目を作らない)。
      s.to(h, { ...APPLE_SPRING.smooth, velocity: v });
      // 面が出きる前に呼ぶ。閉じる判断はもう済んでいるので、
      // ここで待つと「離したのに、まだ閉じない」時間が生まれる。
      window.setTimeout(() => onDismissRef.current(), 180);
    } else {
      // 戻すときも速度を引き継ぐ。上へ弾いた勢いがそのまま吸われる。
      s.to(0, { ...APPLE_SPRING.snappy, velocity: v });
    }
  };

  return {
    /** 面そのものに付ける。 */
    dragProps: enabled
      ? {
          ref: (el: HTMLElement | null) => {
            sheetRef.current = el;
          },
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel: onPointerUp,
          /**
           * **`none`。`pan-y` にしてはいけない。**
           *
           * `pan-y` は「縦に引く操作はブラウザのスクロールに使う」という
           * 宣言。この面が欲しいのは**まさにその縦の操作**なので、宣言した
           * 瞬間に取り上げられる。Chromium で測ると、`pan-y` では
           * **`pointermove` が2回来た所で `pointercancel`** が飛び、
           * **つまみを掴んだ場合でも死ぬ**（下へ引けるという見た目だけが
           * 残って、実際には引けない — いちばん質の悪い壊れ方）。
           *
           * `none` にしても**中の縦スクロールは壊れない**。スクロールする
           * 要素自身がその操作を受け取るので、その上に居るこの面の `none` は
           * 参照されない（`auto` のまま効く）。測った結果:
           *
           *   面 `pan-y`  / つまみを引く … move 2 → **CANCEL**
           *   面 `pan-y`  / 中身を引く   … move 2 → **CANCEL**
           *   面 `none`   / つまみを引く … move 8 → 完走
           *   面 `none`   / 中身を引く   … ブラウザが正しくスクロール
           *
           * なお `SwipeCard` の `pan-y` は正しい。あちらは**横**に引く物で、
           * 縦をブラウザに渡すのが目的だから。向きが逆。
           */
          style: { touchAction: "none" as const },
        }
      : {},
    /** 掴める所を目で示す横棒。無いと、掴めることが誰にも分からない。 */
    grabber: enabled,
  };
}
