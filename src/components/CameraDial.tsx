import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, ScanLine, Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import { createSpring } from "@/lib/spring";
import { motionReducedNow } from "@/hooks/use-reduced-motion";
import type { CameraMode } from "@/components/CameraChrome";
import { CAMERA_MODES } from "@/components/CameraChrome";

/**
 * 撮り方を選ぶ**ダイヤル**。シャッターの丸を3つの名前が囲む。
 *
 * ## オーナー指示 2026-09-16
 * > 「写真を撮る、検索、スキャンがシャッターボタンの丸の周りにダイヤルの
 * >  ようにボタンとして囲い、スライドしたら切り替えられるようにして。
 * >  また切り替えるとシャッターボタンのアイコンも変化するようにして」
 *
 * ## なぜ輪なのか
 * 前は3つを縦に並べていた（選んだ1つが上、残り2つが下）。読めはするが、
 * **切り替えるには狙って押すしかない**。カメラは覗いたまま片手で扱う物
 * なので、親指を横に滑らせるだけで変わる形のほうが速い。実機のカメラの
 * モードダイヤルと同じ考え方で、Apple のカメラの横並びより**指の移動が
 * 短い**（3つが常に親指の弧の上にある）。
 *
 * ## 作り
 * 名前は半径 `RADIUS` の円周に 120° おき。選ばれている物が真上に来る
 * ように輪ごと回す。回すのは**角度のばね1本**だけで、名前は自分の位置に
 * 置いたまま逆回転させて字を水平に保つ。
 *
 * 指で滑らせている間は 1:1 で追従し、離した所からいちばん近い刻みへ
 * ばねで寄る（apple-design §18 の投げ先の見積もりと同じ形）。
 */

/** 名前を置く円の半径(px)。シャッター 80px の外側に、指1本ぶん空けて置く。 */
const RADIUS = 74;
/** 刻みの間隔(度)。3つなので 120。 */
const STEP = 360 / 3;
/** 1px 滑らせるごとに輪が回る角度。半径ぶん動かすと 1 刻みぶん回る。 */
const DEG_PER_PX = STEP / 120;

/** 撮り方ごとのシャッターの絵（オーナー指示「切り替えるとアイコンも変化」）。 */
const SHUTTER_ICON: Record<CameraMode, typeof Camera> = {
  photo: Camera,
  search: Search,
  scan: ScanLine,
};

const MODE_KEY: Record<CameraMode, string> = {
  search: "capture.typeWord",
  photo: "capture.photoTitle",
  scan: "scan.button",
};

export function CameraDial({
  mode,
  onChange,
  onShutter,
  busy = false,
  shutterLabel,
  className = "",
}: {
  mode: CameraMode;
  onChange: (m: CameraMode) => void;
  /** 真ん中を押したとき。 */
  onShutter: () => void;
  /**
   * 走っている間はシャッターを止め、**真ん中で回して見せる**。
   * 止めるだけだと、押したのに何も起きていないように見える（§8）。
   */
  busy?: boolean;
  shutterLabel: string;
  className?: string;
}) {
  const t = useT();
  const ringRef = useRef<HTMLDivElement | null>(null);
  const labelRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(0, CAMERA_MODES.indexOf(mode));
  const Icon = SHUTTER_ICON[mode];

  /**
   * 輪の角度(度)。**画面に出ている値**はばねが持ち、React の状態には
   * 置かない — 1コマごとに状態を書き換えると、指の追従がその都度の
   * 再描画に律速される（§14「押した瞬間に応える」）。
   */
  const angleRef = useRef(-index * STEP);
  const springRef = useRef<ReturnType<typeof createSpring> | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const paint = (deg: number) => {
      angleRef.current = deg;
      const ring = ringRef.current;
      if (!ring) return;
      ring.style.rotate = `${deg}deg`;
      // 字は水平のまま。輪と逆に回して打ち消す。
      for (const el of labelRefs.current) if (el) el.style.rotate = `${-deg}deg`;
    };
    const sp = createSpring(angleRef.current, paint, { damping: 0.82, response: 0.34 });
    springRef.current = sp;
    paint(angleRef.current);
    return () => sp.dispose();
  }, []);

  // 外から撮り方が変わったとき（帯以外から選ばれた回）も輪を合わせる。
  useEffect(() => {
    const sp = springRef.current;
    if (!sp) return;
    const want = -index * STEP;
    // いちばん近い同じ向きへ寄せる（-240° ではなく +120° へ回る）。
    const now = sp.value();
    const wrapped = want + Math.round((now - want) / 360) * 360;
    if (motionReducedNow()) sp.set(wrapped);
    else sp.to(wrapped);
  }, [index]);

  /** 指で滑らせて回す。 */
  const drag = useRef<{ id: number; x: number; from: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    const sp = springRef.current;
    if (!sp) return;
    sp.stop();
    drag.current = { id: e.pointerId, x: e.clientX, from: sp.value() };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const sp = springRef.current;
    if (!d || !sp || d.id !== e.pointerId) return;
    sp.set(d.from + (e.clientX - d.x) * DEG_PER_PX);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    const sp = springRef.current;
    if (!d || !sp || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    // いちばん近い刻みへ。行き先の撮り方は角度から逆算する。
    const snapped = Math.round(sp.value() / STEP) * STEP;
    sp.to(snapped);
    const i = ((Math.round(-snapped / STEP) % 3) + 3) % 3;
    if (CAMERA_MODES[i] !== mode) onChange(CAMERA_MODES[i]);
  };

  return (
    <div
      className={`camera-dial ${className}`}
      role="group"
      aria-label={t("camera.modeGroup")}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* 回る輪。名前だけが載り、真ん中のシャッターは回らない。 */}
      <div className="camera-dial__ring" ref={ringRef} aria-hidden={false}>
        {CAMERA_MODES.map((m, i) => {
          // 真上を 0 とし、時計回りに 120° ずつ。
          const deg = i * STEP;
          const rad = ((deg - 90) * Math.PI) / 180;
          return (
            <button
              key={m}
              type="button"
              ref={(el) => {
                labelRefs.current[i] = el;
              }}
              className="camera-dial__label"
              data-on={m === mode || undefined}
              aria-current={m === mode ? "true" : undefined}
              style={{
                left: `calc(50% + ${Math.cos(rad) * RADIUS}px)`,
                top: `calc(50% + ${Math.sin(rad) * RADIUS}px)`,
              }}
              onClick={() => {
                if (m !== mode) onChange(m);
              }}
            >
              {/* **それぞれ囲う。** 囲いがあると「押せる物が3つ、輪の上に
                  載っている」と読める（オーナー指示 2026-09-16）。 */}
              <span className="camera-dial__chip">{t(MODE_KEY[m])}</span>
            </button>
          );
        })}
      </div>

      {/*
        真ん中のシャッター。**絵は撮り方で変わる**（オーナー指示）。
        押す物なので輪の回転からは外し、いつでも同じ場所・同じ向き。
      */}
      <button
        type="button"
        className="capture-shutter camera-dial__shutter"
        aria-label={shutterLabel}
        disabled={busy}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onShutter}
      >
        <span className="capture-shutter__core camera-dial__core">
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Icon className="h-6 w-6" strokeWidth={2.2} />
          )}
        </span>
      </button>
    </div>
  );
}
