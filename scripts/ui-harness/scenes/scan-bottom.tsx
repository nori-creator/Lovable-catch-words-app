/**
 * スキャン画面の**下半分だけ**を、実物と同じ寸法で組む。
 *
 * ここが要るのは、`scan-camera` の場面が倍率の粒を**単独で**撮っていた
 * から。単独では「画面の下端から 16px」は正しく見えるが、実物では
 * その高さに**下のタブ帯が浮いている**。部品だけを撮ると、部品どうしの
 * 重なりは一度も写らない（オーナー報告 2026-09-16「スキャンモードの時に
 * 一番下にある被ってるものを消して」）。
 *
 * 実物と同じ3つを、実物と同じ座標で置く:
 *   1) `fixed inset-0` のカメラ面（`ScanCameraControls` がこの中）
 *   2) 操作シート（撮り方の帯と下の行）
 *   3) 本物の `TabBar`（**カメラの中なので暗い**）
 */
import { useState } from "react";
import { BookOpen, Camera, Home, Settings, Sparkles } from "lucide-react";
import { TabBar } from "@/components/TabBar";
import {
  CameraFlipButton,
  CameraLibraryButton,
  CameraModeStrip,
  CameraShutter,
  type CameraMode,
} from "@/components/CameraChrome";
import { ScanCameraControls } from "@/routes/_authenticated/scan";
import { photo } from "./peel-sticker";

/** 多くの端末のカメラと同じ縦 3:4 の景色（正方形の絵を切って作る）。 */
const photo34 =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><svg viewBox="0 0 320 320" width="600" height="800" preserveAspectRatio="xMidYMid slice"><image href="${photo}" width="320" height="320"/></svg></svg>`,
  );

const ITEMS = [
  { label: "ホーム", icon: Home },
  { label: "図鑑", icon: BookOpen },
  { label: "カメラ", icon: Camera, lens: true },
  { label: "復習", icon: Sparkles },
  { label: "設定", icon: Settings },
];

export function ScanBottomScene() {
  const [mode, setMode] = useState<CameraMode>("scan");
  return (
    <div className="fixed inset-0 z-20 overflow-hidden">
      {/* 2026-09-27: 映像の箱は名前の下からシートの上まで（上下の余白を詰めた）。 */}
      <div className="capture-viewfinder__light absolute inset-0" aria-hidden="true" />
      <div
        className="scan-frame fixed z-20 overflow-hidden"
        style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px) + 150px + 0.5rem)" }}
      >
        <img
          src={photo34}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
          style={{ objectPosition: "50% 50%" }}
        />
        <ScanCameraControls
          hidden={false}
          facing="environment"
          onFlip={() => {}}
          showZoom
          zoom={2}
          zoomMin={1}
          zoomMax={6}
          onZoom={() => {}}
          zoomBottom="0.5rem"
        />
      </div>
      <div
        data-scan-sheet
        className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 space-y-2 px-4"
      >
        <CameraModeStrip mode={mode} onChange={setMode} />
        <div className="capture-actions">
          <CameraLibraryButton onOpen={() => {}} />
          <CameraShutter mode={mode} label="スキャン" onPress={() => {}} />
          <CameraFlipButton facing="environment" withLabel onFlip={() => {}} />
        </div>
      </div>
      {/* 帯は実物と同じ物。**カメラの中では暗いガラスになる。** */}
      <TabBar cursor={2} indicatorOpacity={0} onCamera>
        {ITEMS.map(({ label, icon: Icon, lens }, i) => (
          <li key={label} className="flex-1">
            <button
              className="tabbar__cell group w-full rounded-full text-caption text-muted-foreground"
              data-tab={i}
            >
              <Icon className={`h-5 w-5 ${lens ? "text-primary" : ""}`} />
              <span>{label}</span>
            </button>
          </li>
        ))}
      </TabBar>
    </div>
  );
}
