import { SwitchCamera } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * カメラの上に載る共通の操作。**撮る画面とスキャン画面で同じ物を使う。**
 *
 * ## なぜ共通にしたか（オーナー指示 2026-09-15
 * 「撮る画面とスキャン画面を1つにして。スキャンのデザインは無くして、
 *  撮る画面のデザインを使って」）
 *
 * 2つの画面は同じ「カメラを覗いている」状態なのに、operating の見た目が
 * 別々に育っていた — 倍率はスキャン側だけ、しかも縦のスライダー。前後の
 * 切替もスキャン側だけ。**同じ事を2箇所で別々に書いている限り、片方だけ
 * 直る**（実際そうなっていた）。
 *
 * ここに置いた物は、どちらの画面からも同じ寸法・同じ位置で出る。
 */

/** 撮り方。画面の名前ではなく、**いまカメラで何をしているか**。 */
export type CameraMode = "search" | "photo" | "scan";

export const CAMERA_MODES: CameraMode[] = ["search", "photo", "scan"];

/** i18n の鍵。文言は `capture.typeWord` / `photoTitle` / `scan.button` と同じ物を使う。 */
const MODE_KEY: Record<CameraMode, string> = {
  search: "capture.typeWord",
  photo: "capture.photoTitle",
  scan: "scan.button",
};

/**
 * 撮り方を選ぶ帯。**iPhone のカメラと同じ並べ方。**（オーナー指示 2026-09-15
 * 「検索、写真を撮る、スキャンの3つのモードをカメラのアイコンを押した時に
 *  表示するようにして。どれかを選択した場合は、残りの2つが下に現れるように」）
 *
 * ## なぜ「選んだ物が上、残りが下」なのか
 * 3つを対等に並べると、**いまどれで撮っているのかが読めない**。カメラは
 * 覗いたまま切り替える物なので、選ばれている1つを大きく・色付きで上に置き、
 * 残りの2つを小さく下に置く。押せば入れ替わる。
 *
 * Apple のカメラは選択中だけを黄色く塗り、他は白のまま小さく残す。ここも
 * 同じで、**色だけに頼らない**ように大きさと `aria-current` も変える
 * （HIG「色だけで意味を伝えない」）。
 */
export function CameraModeStrip({
  mode,
  onChange,
  className = "",
}: {
  mode: CameraMode;
  onChange: (m: CameraMode) => void;
  className?: string;
}) {
  const t = useT();
  const rest = CAMERA_MODES.filter((m) => m !== mode);
  return (
    <div className={`camera-modes ${className}`} role="group" aria-label={t("camera.modeGroup")}>
      {/* 選ばれている撮り方 — 大きく、上に。 */}
      <span className="camera-modes__current" aria-current="true">
        {t(MODE_KEY[mode])}
      </span>
      {/* 残りの2つ — 下に、小さく。押すと入れ替わる。 */}
      <div className="camera-modes__rest">
        {rest.map((m) => (
          <button key={m} type="button" onClick={() => onChange(m)} className="camera-modes__other">
            {t(MODE_KEY[m])}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 倍率の刻み。**端末が本当に出せる範囲からだけ作る。**
 *
 * 前は 0.1 刻みの縦スライダーだった。片手では狙った値に止まらないうえ、
 * **その端末に無い倍率まで動かせて**しまう。iPhone のカメラは刻みを
 * 3つ前後の丸い粒で出し、押すたびにそこへ飛ぶ — 狙いが要らない。
 */
export function zoomStops(min: number, max: number): number[] {
  const stops: number[] = [];
  if (min <= 0.6) stops.push(0.5);
  stops.push(1);
  if (max >= 2) stops.push(2);
  if (max >= 3) stops.push(3);
  if (max >= 5) stops.push(5);
  return stops.filter((s) => s >= min - 0.001 && s <= max + 0.001);
}

/** いまの倍率にいちばん近い刻み。**丸い粒のどれが点くかを決める。** */
export function nearestStop(stops: number[], zoom: number): number | null {
  if (stops.length === 0) return null;
  let best = stops[0];
  for (const s of stops) if (Math.abs(s - zoom) < Math.abs(best - zoom)) best = s;
  // 刻みから 0.15× 以上離れていたら「どれでもない」— ピンチで間の値に
  // なっているときに、嘘の粒を点けない。
  return Math.abs(best - zoom) <= 0.15 ? best : null;
}

/**
 * 倍率の目盛り。**iPhone のカメラと同じ丸い粒。**（オーナー指示 2026-09-15
 * 「カメラにはApple風のズームメーターを付けて」）
 *
 * 選ばれている粒だけが大きく・色付きで `1×` のように `×` を伴い、他は
 * `0.5` のように数字だけで小さく出る。これは Apple の見た目そのままだが、
 * **`aria-pressed` も一緒に変える**ので、色が見えなくても読み上げで分かる。
 */
export function CameraZoomMeter({
  zoom,
  min,
  max,
  onZoom,
  className = "",
}: {
  zoom: number;
  min: number;
  max: number;
  onZoom: (v: number) => void;
  className?: string;
}) {
  const t = useT();
  const stops = zoomStops(min, max);
  // 刻みが1つしか無い端末＝倍率を持たない。動かない物を置かない。
  if (stops.length < 2) return null;
  const on = nearestStop(stops, zoom);
  return (
    <div className={`camera-zoom ${className}`} role="group" aria-label={t("scan.zoom")}>
      {stops.map((s) => {
        const active = on === s;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={active}
            aria-label={t("camera.zoomTo", { x: String(s) })}
            onClick={() => onZoom(s)}
            className="camera-zoom__stop"
            data-on={active || undefined}
          >
            {/*
              押せる箱は 44px、見える丸は 34px（HIG §11 の下限は**箱**の
              話なので、丸を大きくするのではなく箱を広げる）。検査は
              要素の箱を測るので、擬似要素で広げても数えられない — 実際
              34×34 で赤が3件出た。丸を中の span に移した。
            */}
            <span className="camera-zoom__dot">{active ? `${s}×` : `${s}`}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 前後の切り替え。**覗いている間はいつでも出す**（倍率と違って常にある）。 */
export function CameraFlipButton({
  facing,
  onFlip,
  className = "",
}: {
  facing: "environment" | "user";
  onFlip: () => void;
  className?: string;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onFlip}
      aria-label={t("scan.flipCamera")}
      aria-pressed={facing === "user"}
      className={`camera-flip ${className}`}
    >
      <SwitchCamera className="h-5 w-5" />
    </button>
  );
}
