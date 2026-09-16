/**
 * 撮り方のダイヤル。**本物の部品を描く。**
 *
 * 映像は流せないので、同じ寸法の暗い面を敷いてその上に載せる
 * （`scan-camera` の場面と同じやり方）。ここで見るのは
 *  ・選ばれている名前が真上に来るか
 *  ・残りの2つが輪の上に載り、押せる大きさがあるか
 *  ・真ん中の絵が撮り方ごとに変わるか
 */
import { useState } from "react";
import { CameraDial } from "@/components/CameraDial";
import type { CameraMode } from "@/components/CameraChrome";

export function CameraDialScene({ q }: { q: URLSearchParams }) {
  const start = (q.get("mode") as CameraMode) ?? "photo";
  const [mode, setMode] = useState<CameraMode>(start);
  const busy = q.get("busy") === "1";
  return (
    <div style={{ position: "relative", height: "100vh", background: "#14110f" }}>
      <div style={{ position: "absolute", insetInline: 0, bottom: 88 }}>
        <CameraDial
          mode={mode}
          onChange={setMode}
          onShutter={() => {}}
          busy={busy}
          shutterLabel="タップして撮影"
        />
      </div>
    </div>
  );
}
