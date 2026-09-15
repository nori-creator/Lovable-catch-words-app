import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

/**
 * **カメラの画面を、暇なうちに取っておく。**
 *
 * ## なぜ要るか（オーナー報告 2026-09-15）
 * > 「カメラを開いた時に、実際にカメラが開くまで5秒ぐらいラグがある」
 *
 * 録画を1コマずつ見ると、押した直後に**下のタブの選択だけが変わり、中身は
 * ホームのまま5秒**続いていた。つまり待っているのはカメラではなく、
 * **撮る画面そのものの到着**。この app は Capacitor の `server.url` 方式
 * （殻の中のブラウザが公開中のサイトを見る）なので、画面のかたまりは毎回
 * ネットワークから来る。
 *
 * 撮ることはこの app の本線なので、**開いた直後の暇な時間に先に取っておく**。
 * 押した時には手元にある。
 *
 * ## `defaultPreload: "intent"` だけでは足りない
 * あれは指が触れてから取りに行く。触ってから押し切るまでは数十msしかなく、
 * 数百KBには足りない。**触る前**に済ませておく必要がある。
 *
 * ## 1回だけ。暇なときだけ。
 * 殻(`AppShell`)は画面ごとに描き直されるので、そのたびに取りに行かせない
 * （module の外に印を置く）。`requestIdleCallback` を使うのは、開いた直後の
 * いちばん忙しい時間に割り込まないため — **いま見ている画面より先に、
 * まだ見ていない画面を取りに行ってはいけない。**
 */
let warmed = false;

export function useWarmCamera(): void {
  const router = useRouter();
  useEffect(() => {
    if (warmed) return;
    warmed = true;
    const run = () => {
      void router.preloadRoute({ to: "/capture" }).catch(() => {
        // 取れなくても困らない。押した時に取りに行くだけ。
        warmed = false;
      });
    };
    const ric = (
      window as Window & {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      }
    ).requestIdleCallback;
    if (typeof ric === "function") {
      ric(run, { timeout: 3000 });
      return;
    }
    // `requestIdleCallback` の無い端末（Safari は長く持っていなかった）。
    const t = window.setTimeout(run, 1200);
    return () => window.clearTimeout(t);
  }, [router]);
}
