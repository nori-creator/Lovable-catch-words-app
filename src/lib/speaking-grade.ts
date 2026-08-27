import { LAPSE_SCORE } from "./srs";

/**
 * 「話す」の採点を決める唯一の場所。
 *
 * ## オーナー指示 2026-08-27 ⑦
 * > 「復習の SRS、スピーキングモードで間違えても、言い直して正解にしたら、
 * >  普通に覚えてるものとしてカウントさせる。言い直して合ってるのは
 * >  覚えてない、忘れたとしてカウントし直して。SRS や記憶の状態の
 * >  グラフのアルゴリズムを変更して。」
 *
 * ## 何が起きていたか
 * 画面は**最後の1回だけ**を見ていた（`setSaidOk(...)` / `setFeedback(...)`
 * が上書き）。だから 3 回外して 4 回目に言えた語も、1 回で言えた語と
 * まったく同じ「正解(5点)」として記録され、次に出るのが数日先へ飛ぶ。
 *
 * 言い直して当たるのは、**その語をまだ言えていない**ということ。
 * 覚えている語は最初の1回で出る。ここを同じ点にすると、
 * SRS は「覚えた語」と「たまたま4回目に当たった語」を区別できず、
 * 記憶の状態のグラフも実際より良く見える。
 *
 * ## 決め方
 * | 何が起きたか | 結果 | 点 | SRS |
 * |---|---|---|---|
 * | 1回で言えた | `success` | 5 | 間隔が伸びる |
 * | 言い直して言えた | `hint` | 2 | **失念**(連続を捨てて明日また) |
 * | 言えなかった・飛ばした | `skip` | 1 | 失念 |
 *
 * 言い直しを `skip`(1点) まで落とさないのは、**言えたこと自体は
 * 事実**だから。`hint` は元々「答えを見てから言えた」に付けていた点で、
 * 「自力では出てこなかったが、目の前にあれば言える」という同じ状態を
 * 指す。どちらも `LAPSE_SCORE` を割るので、SRS の扱いは失念で揃う。
 *
 * ここには外の世界に触れるものを入れないこと。
 */

/** 採点の結果。`gradeReview` の `result` にそのまま渡る。 */
export type SpeakingResult = "success" | "hint" | "skip";

export type SpeakingGradeInput = {
  /** 押されたボタン。「飛ばす」なら中身を見るまでもない。 */
  kind: "success" | "skip";
  /**
   * 機械の側の判定（言うだけの段なら「その語を言えたか」、
   * 文の段なら「対象語を使っていて、自然さが基準以上か」）。
   */
  objectiveOk: boolean;
  /**
   * **この問題で外した回数。** 0 なら一度も外していない。
   *
   * 最後の1回ではなくここを見るのが、この変更の全部。
   */
  failedAttempts: number;
};

/**
 * 話した結果を SRS の点へ翻訳する。
 *
 * **「飛ばす」が最優先。** 飛ばした人の記録に、その前の試行の当たりを
 * 混ぜない（本人が「言えなかった」と言っている）。
 */
export function speakingResult(input: SpeakingGradeInput): SpeakingResult {
  if (input.kind === "skip") return "skip";
  if (!input.objectiveOk) return "skip";
  return input.failedAttempts > 0 ? "hint" : "success";
}

/**
 * その結果を「覚えていた」と数えてよいか。
 *
 * 記憶の状態のグラフと `review_history.correct` が読む値。
 * **`speakingResult` と別々に書かない** — 片方だけ直すと、SRS は
 * 失念として扱うのにグラフだけが正解と数える、が起きる
 * （この app が何度もやった形）。
 */
export function countsAsRemembered(result: SpeakingResult): boolean {
  return scoreForSpeaking(result) >= LAPSE_SCORE;
}

/** 結果に対応する点。`gradeReview` の表と同じ値であること。 */
export function scoreForSpeaking(result: SpeakingResult): number {
  return result === "success" ? 5 : result === "hint" ? 2 : 1;
}
