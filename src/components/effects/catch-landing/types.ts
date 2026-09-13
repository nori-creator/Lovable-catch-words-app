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
  /**
   * その語の段(TOCFL / CEFR の 1〜6)。**珍しい語ほど演出を大きくする**ため。
   *
   * 確率は動かさない。当たり外れを作ると、覚えた実感の代わりに偶然が
   * 報酬になってしまう(`lib/catch-choreography.ts` の `rewardScale` の注)。
   * 渡さなければ等倍。
   */
  level?: number | null;
  /**
   * 保存の通信。**「静止」の1秒はこれを待つ関所も兼ねる。**
   *
   * 演出を押した瞬間に始めるので、通信はまだ終わっていない。1秒の静止が
   * 明けても届いていなければ、息をしたまま待つ。ここを待たないと、
   * 演出が終わってから改めて無言の待ち時間が現れる —
   * **見せ場の後に空白が来るのが、いちばん間の抜けた形。**
   */
  gate?: Promise<unknown>;
  /** 保存済みの札。図鑑側の実セルを探すために使う。 */
  destinationId?: string;
  /** 最大表示のまま図鑑を背後に開く。 */
  openDex?: () => void | Promise<void>;
};

export type LandingRunner = (ctx: LandingCtx) => Promise<void>;
