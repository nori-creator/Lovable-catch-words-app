import { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Loader2, ScanLine, Search, SwitchCamera } from "lucide-react";
import { useT } from "@/lib/i18n";
import { CachedImg } from "@/lib/image-cache";
import { SlidingIndicator } from "@/components/SlidingIndicator";

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

/**
 * **画面に出る順**。左から 検索 → 撮影 → スキャン
 * （オーナー指示 2026-09-16「真ん中に撮影、右にスキャン、左に検索にして」）。
 *
 * 既定の撮影が**真ん中**なので、どちらへ払っても1回で隣に着く。左端に
 * 置いていたときは、スキャンへ行くのに2回ぶん払う人が出ていた。
 */
export const CAMERA_MODES: CameraMode[] = ["search", "photo", "scan"];

/** i18n の鍵。文言は `capture.typeWord` / `capture.photoTitle` / `scan.button`。 */
const MODE_KEY: Record<CameraMode, string> = {
  search: "capture.typeWord",
  photo: "capture.photoTitle",
  scan: "scan.button",
};

/** 撮り方ごとのシャッターの絵（オーナー指示「モードによってアイコン変更して」）。 */
export const SHUTTER_ICON: Record<CameraMode, typeof Camera> = {
  photo: Camera,
  search: Search,
  scan: ScanLine,
};

/** 押したと見なす動きの上限(px)。これを超えたら「払った」。 */
const TAP_PX = 8;
/** 1つ隣へ移るのに要る横の動き(px)。 */
const SWIPE_PX = 44;

/**
 * 撮り方の帯。**横に3つ並べ、選ばれている物の下に点を置く**
 * （オーナー指示 2026-09-16、参考画像のとおり）。
 *
 * ## なぜ輪をやめたか
 * 直前はシャッターを囲むダイヤルだった。回せはするが、**3つの名前が
 * いつも同時に読めるわけではない**（真上に来た1つだけ）。参考画像の形は
 * iPhone のカメラと同じで、3つが常に並んで見え、いまどれに居るかが
 * 点1つで分かる。覚えることが少ない。
 *
 * ## 印は、このアプリの他の切り替えと同じ「滑って伸びるバブル」
 * （オーナー指示 2026-09-16「モード切替のスライドは青い点ではなく、
 *  設定のスライドと同じように残像感のあるバブルを採用して」）
 *
 * 下のタブでも設定の選択肢でも使っている `SlidingIndicator` をそのまま置く。
 * 左端と右端に別々のばねを持たせ、進む側を速くする — それだけで伸びも尾も
 * 着地の縮みも出る。**同じ切り替えの見え方を、画面ごとに作り分けない。**
 *
 * 置き方は他と同じで、**この箱の最初の子**にする（位置は自分以外の兄弟を
 * 実測して決めるので、仕切り線が挟まっても合う）。
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
  const index = Math.max(0, CAMERA_MODES.indexOf(mode));
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  return (
    <div
      className={`camera-modes ${className}`}
      role="tablist"
      aria-label={t("camera.modeGroup")}
      onPointerDown={(e) => {
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        drag.current = null;
        const dx = e.clientX - d.x;
        /**
         * **払ったら隣へ、押したらその場所へ。**
         *
         * 指を捕まえている（`setPointerCapture`）ので、押した時の `click` は
         * 外側の箱に届き、中の釦には来ない。だからここで両方を決める。
         */
        if (Math.abs(dx) < TAP_PX) return;
        if (Math.abs(dx) < SWIPE_PX) return;
        const next = CAMERA_MODES[index + (dx < 0 ? 1 : -1)];
        if (next && next !== mode) onChange(next);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      {/**
       * いまどれに居るかの印。**この箱の最初の子に置く**（`SlidingIndicator`
       * は自分以外の兄弟を実測して位置を決める）。
       *
       * 尾の長さは**設定の選択肢と同じ**にしてある。動く距離が近いので、
       * 下のタブの遅さを当てると短い距離の割に長く残る（`settings.tsx` の注）。
       */}
      <SlidingIndicator
        index={index}
        persistKey="camera-modes"
        radiusRatio={0.5}
        lead={0.24}
        trail={0.32}
        className="bottom-0 left-0 top-0 bg-primary/26"
      />
      {CAMERA_MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={m === mode}
          data-on={m === mode || undefined}
          className="camera-modes__item"
          onClick={() => {
            if (m !== mode) onChange(m);
          }}
        >
          {t(MODE_KEY[m])}
        </button>
      ))}
    </div>
  );
}

/**
 * シャッター。**白い丸に青い環**、中の絵は撮り方ごとに変わる
 * （オーナー指示「モードによってシャッターボタンの中のアイコン変更して」）。
 */
export function CameraShutter({
  mode,
  label,
  busy = false,
  onPress,
}: {
  mode: CameraMode;
  label: string;
  busy?: boolean;
  onPress: () => void;
}) {
  const Icon = SHUTTER_ICON[mode];
  return (
    <button
      type="button"
      className="camera-shutter"
      aria-label={label}
      disabled={busy}
      onClick={onPress}
    >
      <span className="camera-shutter__core">
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <Icon className="h-6 w-6" strokeWidth={2.2} />
        )}
      </span>
    </button>
  );
}

/**
 * シャッターの左。**過去に撮った写真を出す**（オーナー指示 2026-09-16
 * 「写真の部分は過去に撮った写真を表示する」）。
 *
 * 絵柄は決め打ちの記号ではなく、**いちばん新しく捕まえた1枚**。
 * iPhone のカメラと同じで、「さっき撮った物がここに溜まっている」という
 * 筋がそのまま見える。まだ1枚も無い人には記号を出す。
 */
export function CameraLibraryButton({
  photoUrl,
  onOpen,
}: {
  photoUrl: string | null;
  onOpen: () => void;
}) {
  const t = useT();
  return (
    <button type="button" className="camera-side" onClick={onOpen}>
      <span className="camera-side__box">
        {photoUrl ? (
          <CachedImg src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-5 w-5" />
        )}
      </span>
      <span className="camera-side__label">{t("camera.library")}</span>
    </button>
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

/** 見せ方。`1` は `1`、`1.4` は `1.4`（末尾の `.0` は出さない）。 */
function fmtZoom(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/**
 * 倍率。**既定は刻みの粒だけ。選んでいる粒をもう一度押すと、細かい目盛りが出る。**
 *
 * オーナー指示 2026-09-22:
 * > カメラの倍率のやつが大きすぎる。デフォルトは整数だけの倍率を並べて、
 * > そこをタップするとメーターを触れるようになる。また、そのメーター自体も
 * > 縦に小さく薄くして。
 *
 * これは iPhone のカメラそのままの作りでもある — 普段は `0.5 1 2` の粒が
 * 並ぶだけで、選んでいる粒を押すと細かいダイヤルが開く。前の版は
 * **いつでも**大きな読み上げ値・目盛りの帯・44px のつまみを出していたので、
 * 映像の下端を 100px 近く塞いでいた。
 *
 * ## 粒の押し分け
 * ・選んでいない粒 → その倍率へ飛ぶ（細かい目盛りは閉じる）
 * ・選んでいる粒 → 細かい目盛りを開く／閉じる
 *
 * ## 細かい目盛りを開いている間だけ、生の値を出す
 * 粒の文字が `1` から `1.4×` に変わる。閉じているときに小数を出すと、
 * 「刻みが4つある」ように見えてしまう。
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
  const [fine, setFine] = useState(false);
  const stops = zoomStops(min, max);
  /** 点く粒。**細かい目盛りを開いている間は、離れていても一番近い粒を点ける** —
      どの粒から動かしているのかが見えないと、数字だけが宙に浮く。 */
  const snapped = nearestStop(stops, zoom);
  const nearest = stops.length
    ? stops.reduce((a, b) => (Math.abs(b - zoom) < Math.abs(a - zoom) ? b : a))
    : null;
  const lit = fine ? nearest : snapped;
  const canFine = max > min;
  return (
    <div className={`camera-zoom ${className}`} role="group" aria-label={t("scan.zoom")}>
      <div className="camera-zoom__stops">
        {stops.map((s) => {
          const on = lit === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              data-on={on || undefined}
              className="camera-zoom__stop"
              aria-label={t("camera.zoomTo", { x: String(s) })}
              onClick={() => {
                if (on && canFine) {
                  setFine((v) => !v);
                  return;
                }
                setFine(false);
                onZoom(s);
              }}
            >
              {on && fine ? `${fmtZoom(zoom)}×` : fmtZoom(s)}
            </button>
          );
        })}
      </div>
      {/* **閉じている間は場所も取らない。** `hidden` なら高さ 0 なので、
          映像が下まで見える。 */}
      {canFine && (
        <div className="camera-zoom__fine" hidden={!fine}>
          <input
            type="range"
            min={min}
            max={max}
            step={0.1}
            value={zoom}
            aria-label={t("scan.zoom")}
            aria-valuetext={`${fmtZoom(zoom)}×`}
            onChange={(e) => onZoom(Number(e.target.value))}
          />
        </div>
      )}
    </div>
  );
}

/**
 * 前後の切り替え。**覗いている間はいつでも出す**（倍率と違って常にある）。
 *
 * シャッターの右に置くときは名前も出す（`withLabel`）— 参考画像のとおり、
 * 左の「写真」と左右で同じ形にするため。映像の隅に小さく置くときは記号だけ。
 */
export function CameraFlipButton({
  facing,
  onFlip,
  withLabel = false,
  className = "",
}: {
  facing: "environment" | "user";
  onFlip: () => void;
  withLabel?: boolean;
  className?: string;
}) {
  const t = useT();
  if (withLabel) {
    return (
      <button
        type="button"
        onClick={onFlip}
        aria-label={t("scan.flipCamera")}
        aria-pressed={facing === "user"}
        className={`camera-side ${className}`}
      >
        <span className="camera-side__box">
          <SwitchCamera className="h-5 w-5" />
        </span>
        <span className="camera-side__label">{t("camera.flipShort")}</span>
      </button>
    );
  }
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
