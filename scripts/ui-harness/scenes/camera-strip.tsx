/**
 * 撮り方の帯と下の行。**本物の部品を描く。**
 *
 * 映像は流せないので、同じ寸法の暗い面を敷いてその上に載せる
 * （`scan-camera` の場面と同じやり方）。ここで見るのは
 *  ・3つの名前が同時に読めるか
 *  ・選ばれている物の下に点が来るか
 *  ・左右（写真・切替）が同じ形・同じ大きさか
 *  ・真ん中の絵が撮り方ごとに変わるか
 */
import { useState } from "react";
import {
  CameraFlipButton,
  CameraLibraryButton,
  CameraModeStrip,
  CameraShutter,
  CameraZoomMeter,
  type CameraMode,
} from "@/components/CameraChrome";

export function CameraStripScene({ q }: { q: URLSearchParams }) {
  const start = (q.get("mode") as CameraMode) ?? "photo";
  const [mode, setMode] = useState<CameraMode>(start);
  const busy = q.get("busy") === "1";
  return (
    <div style={{ position: "relative", height: "100vh", background: "#0b1220" }}>
      <div className="capture-controls">
        {/* 倍率。**1つしか持たない端末の `1×` の札**も撮る（参考画像の形）。 */}
        <div className="mb-3 flex justify-center">
          <CameraZoomMeter
            zoom={1}
            min={1}
            max={q.get("zoom") === "many" ? 6 : 1}
            onZoom={() => {}}
          />
        </div>
        <CameraModeStrip mode={mode} onChange={setMode} />
        <div className="capture-actions">
          <CameraLibraryButton photoUrl={null} onOpen={() => {}} />
          <CameraShutter mode={mode} label="タップして撮影" busy={busy} onPress={() => {}} />
          <CameraFlipButton facing="environment" withLabel onFlip={() => {}} />
        </div>
      </div>
    </div>
  );
}
