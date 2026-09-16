import { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Loader2, ScanLine, Search, SwitchCamera } from "lucide-react";
import { useT } from "@/lib/i18n";
import { CachedImg } from "@/lib/image-cache";

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
 * **画面に出る順**。左から 撮影 → スキャン → 検索
 * （オーナー指示 2026-09-16、参考画像のとおり）。
 *
 * 「押したら既定は撮影」なので、真ん中ではなく**左端が撮影**でよい。
 * 指で左へ払うと右隣（スキャン）へ進む。
 */
export const CAMERA_MODES: CameraMode[] = ["photo", "scan", "search"];

/** i18n の鍵。文言は `capture.photoTitle` / `scan.button` / `capture.typeWord`。 */
const MODE_KEY: Record<CameraMode, string> = {
  photo: "capture.photoTitle",
  scan: "scan.button",
  search: "capture.typeWord",
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
 * ## 点の動かし方
 * 3つは等分（`flex-1`）なので、中心は幅の 1/6・3/6・5/6 に**必ず**来る。
 * だから測らずに `left` を割合で置ける — 測ってから置く形にすると、
 * 最初の1コマだけ左端に出る（この作業で何度も踏んだ罠）。
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
      {/* いまどれに居るかの点。等分なので中心は 1/6・3/6・5/6 に必ず来る。 */}
      <span
        aria-hidden="true"
        className="camera-modes__dot"
        style={{ left: `${((index * 2 + 1) / (CAMERA_MODES.length * 2)) * 100}%` }}
      />
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
  const on = nearestStop(stops, zoom);
  /**
   * **倍率を1つしか持たない端末でも `1×` は出す**（オーナー指示 2026-09-16、
   * 参考画像のとおり。iPhone も単眼機では `1×` が出たまま動かない）。
   *
   * ただし**釦にはしない** — 押しても何も起きない物を置かない、という
   * この画面の決まりはそのまま。いまの倍率を読むだけの札にする。
   */
  if (stops.length < 2) {
    return (
      <p className={`camera-zoom camera-zoom--fixed ${className}`} aria-label={t("scan.zoom")}>
        <span className="camera-zoom__dot" data-on>
          {`${on ?? 1}×`}
        </span>
      </p>
    );
  }
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
