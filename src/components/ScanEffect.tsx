import { useEffect } from "react";
import { loopSfx } from "@/lib/sfx-files";
import { ScanAnalyzing_v13depth } from "./effects/scan-analyzing/v13_depth";

/**
 * スキャン中(AI分析中)の演出。
 *
 * 3D で測る版（v13depth、2026-09-28）。WebGL が無い端末・動きを減らす設定では
 * カメラ期の版（v0cutout）に落ちる（v13_depth.tsx の中で切り替える）。
 * 歴代の版を見比べる「エフェクト・ラボ」は設定から外れて選べなくなっていたので、
 * 古い版ごと 2026-10-01 に消した。
 */
type Stage = "sensing" | "reading" | "matching";

export function ScanEffect({
  stage,
  cutout = false,
}: {
  stage: Stage;
  /**
   * 本当に写真を切り抜いているときだけ `true`（撮影モードで語を選んだ後）。
   * スキャンは語を探しているだけなので「切り抜き中」と出さない（オーナー
   * 報告 2026-09-24「スキャンの時に AI が切り抜き中とでる」）。
   */
  cutout?: boolean;
}) {
  // 待っている間ずっと、静かなきらめきの音を敷く（`public/sfx/el-analyze-loop.mp3`、
  // オーナー指示 2026-09-28「AIの分析中のアニメーション…本物の映画の効果音の
  // クオリティ」）。画面が消えたら 0.25 秒で消える。音の設定がオフなら鳴らない。
  useEffect(() => loopSfx("analyze-loop"), []);
  return <ScanAnalyzing_v13depth stage={stage} cutout={cutout} />;
}
