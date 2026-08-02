/**
 * キャッチ→図鑑の着弾演出。歴代の振り付けを差し替えて見比べられるよう、
 * DOM への依存を ctx にまとめた「振り付けだけの関数」に切り出してある。
 *
 * 共通の前後処理(phase の切替・チャイム・振動・reduced motion の判定)は
 * 呼び出し側が持つ。ここに入るのは**動きそのもの**だけ。
 */
export type LandingCtx = {
  /** 飛び始める位置の要素(シート内の写真枠)。 */
  startEl: HTMLElement | null;
  /** 実際に飛ぶ画像。 */
  fly: HTMLImageElement | null;
  /** 着弾先(下タブの図鑑アイコン)。 */
  dexEl: HTMLElement | null;
  /** 決め台詞を鳴らす(対応する版だけが呼ぶ)。 */
  speakLine?: () => void;
};

export type LandingRunner = (ctx: LandingCtx) => Promise<void>;
