/**
 * 動きを見せるか、減らすか。**アプリ側で選べるようにするための、数だけ。**
 *
 * ## なぜ要るのか（オーナー報告 2026-09-15）
 * > 「パソコンのラブベールで開くと確かにアニメーションがあるんだけど、
 * >  アンドロイドのスマホや自分のスマホのダウンロードしたアプリだと
 * >  それらのアニメーションが**全て消える**んだけど」
 *
 * 原因はコードの不具合ではなく、**端末の設定**だった。Android は
 *   ・設定 → ユーザー補助 → **アニメーションを削除**
 *   ・**バッテリーセーバー**（省電力モード）
 *   ・開発者向けオプションの **アニメーションの倍率を off**
 * のどれかが入っていると、ブラウザに `prefers-reduced-motion: reduce` を
 * 返す。iOS も 設定 → アクセシビリティ → 動作 → **視差効果を減らす** で同じ。
 *
 * このアプリはその返事を**正直に全部の動きへ効かせていた**ので、
 * CSS 13ブロックと、捕獲演出・タブの印・面のドラッグの門が同時に止まり、
 * 「アニメーションが全て消える」という見え方になる。パソコンにはこの設定が
 * 無いので、**パソコンでだけ動いて見える**のもそのため。
 *
 * ## 既定は変えない
 * この設定は健康のために在る（前庭障害のある人には、大きく動く絵が実害に
 * なる）。だから**既定は今までどおり端末に従う**。変えられるのは、
 * 「自分で入れた覚えがないのに消えている」人が**自分の意思で**戻すときだけ。
 *
 * ここには外の世界に触れるものを入れないこと（`localStorage` も `window` も）。
 */

/** 本人の選択。`system` は「端末の設定に従う」。 */
export type MotionChoice = "system" | "full" | "reduce";

/** 解決後の姿。CSS と JS はどちらもこれだけを見る。 */
export type MotionMode = "full" | "reduce";

/** `localStorage` の鍵。描画前スクリプトと設定画面で同じ物を使う。 */
export const MOTION_STORAGE_KEY = "motion";

/** 既定。**端末に従う** — 健康のための設定なので、勝手に上書きしない。 */
export const DEFAULT_MOTION: MotionChoice = "system";

/** `<html>` に載せる属性の名前（`dataset` 側の綴り）。 */
export const MOTION_ATTR = "motion";

/**
 * 保存されている文字列を選択に直す。
 * 知らない値・空・壊れた値はすべて既定へ倒す（`localStorage` は人が触れる）。
 */
export function parseMotionChoice(value: unknown): MotionChoice {
  return value === "full" || value === "reduce" || value === "system" ? value : DEFAULT_MOTION;
}

/**
 * 本人の選択と端末の返事から、実際の姿を決める。
 *
 * **`system` のときだけ端末を見る。** 本人が選んでいれば端末より優先する —
 * 「見せて」と言った人に見せないのは、設定が仕事をしていないのと同じ。
 *
 * @param choice 本人の選択
 * @param osReduces 端末が `prefers-reduced-motion: reduce` を返しているか
 */
export function resolveMotion(choice: MotionChoice, osReduces: boolean): MotionMode {
  if (choice === "full") return "full";
  if (choice === "reduce") return "reduce";
  return osReduces ? "reduce" : "full";
}

/**
 * 設定画面に出す説明の鍵。**なぜ消えているのかが分かる言葉にする。**
 *
 * 「動きを減らす」とだけ書いても、端末の設定で消えている人には
 * 何も伝わらない（自分で入れた覚えが無いため）。端末が何を返しているかを
 * そのまま見せて、初めて原因に辿り着ける。
 */
export function motionDiagnosisKey(choice: MotionChoice, osReduces: boolean): string {
  if (choice === "system") {
    return osReduces ? "settings.motion.osReduces" : "settings.motion.osAllows";
  }
  return choice === "full" ? "settings.motion.forcedFull" : "settings.motion.forcedReduce";
}
