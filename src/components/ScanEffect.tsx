import { useEffect, useState, type ReactElement } from "react";
import { EFFECT_LAB_EVENT, getVariant, type EffectSlot } from "@/lib/effect-lab";
import { ScanAnalyzing_v0cutout } from "./effects/scan-analyzing/v0_cutout";
import { ScanAnalyzing_v1probe } from "./effects/scan-analyzing/v1_probe";
import { ScanAnalyzing_v2liquid } from "./effects/scan-analyzing/v2_liquid";
import { ScanAnalyzing_v3crystal } from "./effects/scan-analyzing/v3_crystal";
import { ScanAnalyzing_v4calm } from "./effects/scan-analyzing/v4_calm";
import { ScanAnalyzing_v5optionb } from "./effects/scan-analyzing/v5_optionb";
import { ScanAnalyzing_v6minimal } from "./effects/scan-analyzing/v6_minimal";
import { ScanAnalyzing_v7fullscreen } from "./effects/scan-analyzing/v7_fullscreen";
import { ScanAnalyzing_v8current } from "./effects/scan-analyzing/v8_current";

/**
 * スキャン中(AI分析中)の演出。
 *
 * 中身は歴代の演出をそのまま variant として残してあり、開発者は設定の
 * 「エフェクト・ラボ」で見比べて選べる(src/lib/effect-lab.ts)。
 * 既定はカメラ期(v0cutout)。新しい版も残してあるのでラボで戻せる。
 */
type Stage = "sensing" | "reading" | "matching";

const SLOT: EffectSlot = "scanAnalyzing";

const VARIANTS: Record<string, (p: { stage: Stage; cutout?: boolean }) => ReactElement> = {
  v0cutout: ScanAnalyzing_v0cutout,
  v1probe: ScanAnalyzing_v1probe,
  v2liquid: ScanAnalyzing_v2liquid,
  v3crystal: ScanAnalyzing_v3crystal,
  v4calm: ScanAnalyzing_v4calm,
  v5optionb: ScanAnalyzing_v5optionb,
  v6minimal: ScanAnalyzing_v6minimal,
  v7fullscreen: ScanAnalyzing_v7fullscreen,
  v8current: ScanAnalyzing_v8current,
};

/** ラボでの選択に追従する(選んだ瞬間に反映される)。 */
export function useEffectVariant(slot: EffectSlot): string {
  const [id, setId] = useState(() => getVariant(slot));
  useEffect(() => {
    const sync = () => setId(getVariant(slot));
    sync();
    window.addEventListener(EFFECT_LAB_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EFFECT_LAB_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [slot]);
  return id;
}

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
  const id = useEffectVariant(SLOT);
  const Chosen = VARIANTS[id] ?? ScanAnalyzing_v0cutout;
  return <Chosen stage={stage} cutout={cutout} />;
}

/** ラボのプレビュー用: variant を直接指定して描画する。 */
export function ScanEffectVariant({ id, stage }: { id: string; stage: Stage }) {
  const Chosen = VARIANTS[id] ?? ScanAnalyzing_v0cutout;
  return <Chosen stage={stage} />;
}
