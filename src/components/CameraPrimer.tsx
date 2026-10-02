import { useEffect, useId, useRef } from "react";
import { Camera, ImagePlus, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { CameraPrimerVariant } from "@/lib/camera-access";
import "./camera-primer.css";

/**
 * **カメラを頼む前の一枚**（オーナー指示 2026-10-02「許可の画面がダサい…スマホやアプリ、
 * ブラウザの許可のほうが洗練されてる」）。
 *
 * ブラウザ自身の許可の画面はページから変えられない。だから**その前に**、アプリの言葉で
 * 「なぜカメラか」「写真はどこへ行くか」「次に出る確認で何を押すか」を1枚で伝え、
 * 「カメラを使う」を押した**後で**だけブラウザに頼む。押さずに続けたい人には、端末の
 * カメラアプリ（`<input capture>`）と写真を選ぶ道を同じ面に置く — 行き止まりにしない。
 *
 * 見せ方は3つ（`CameraPrimerVariant`）。本番は `CAMERA_PRIMER_VARIANT` の1つだけ。
 * 押す所は案内と同じ青い光の輪（`tour-pulse`）で示し、実物確認の運転役が辿れるよう
 * `data-tour` を付ける。
 */
export function CameraPrimer({
  variant,
  kind,
  onAllow,
  onOsCamera,
  onLibrary,
}: {
  variant: CameraPrimerVariant;
  /** 端末のカメラアプリが開くか（スマホ）、ファイルを選ぶ画面になるか（パソコン）。 */
  kind: "camera" | "file";
  onAllow: () => void;
  onOsCamera: () => void;
  onLibrary: () => void;
}) {
  const t = useT();
  const titleId = useId();
  const allow = useRef<HTMLButtonElement>(null);
  /** 開いたら「カメラを使う」に手元を合わせる（キーボード・読み上げの人が迷わない）。 */
  useEffect(() => {
    allow.current?.focus({ preventScroll: true });
  }, []);

  const head = (
    <>
      {variant !== "full" && (
        <span className="cam-primer__badge" aria-hidden="true">
          <Camera size={26} strokeWidth={2.2} />
          <Sparkles className="cam-primer__spark" size={14} strokeWidth={2.4} />
        </span>
      )}
      <h2 id={titleId} className="cam-primer__title ja-phrase">
        {t("campriming.title")}
      </h2>
      <p className="cam-primer__reason ja-phrase">{t("campriming.reason")}</p>
      <p className="cam-primer__privacy ja-phrase">
        <ShieldCheck size={16} strokeWidth={2.2} aria-hidden="true" />
        <span>{t("campriming.privacy")}</span>
      </p>
    </>
  );

  const actions = (
    <div className="cam-primer__actions">
      <button
        ref={allow}
        type="button"
        data-tour="camera-allow"
        className="cam-primer__allow press-in tour-pulse"
        onClick={onAllow}
      >
        <Camera size={20} strokeWidth={2.2} aria-hidden="true" />
        {t("campriming.allow")}
      </button>
      <p className="cam-primer__next ja-phrase">{t("campriming.next")}</p>
      <div className="cam-primer__alt">
        <button
          type="button"
          data-tour="camera-file"
          className="cam-primer__file press-in"
          onClick={kind === "camera" ? onOsCamera : onLibrary}
        >
          {kind === "camera" ? (
            <Smartphone size={18} strokeWidth={2.2} aria-hidden="true" />
          ) : (
            <ImagePlus size={18} strokeWidth={2.2} aria-hidden="true" />
          )}
          {t(kind === "camera" ? "campriming.osCamera" : "campriming.library")}
        </button>
        {kind === "camera" && (
          <button type="button" className="cam-primer__file press-in" onClick={onLibrary}>
            <ImagePlus size={18} strokeWidth={2.2} aria-hidden="true" />
            {t("campriming.library")}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={`cam-primer cam-primer--${variant}`}
      data-tour="camera-primer"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {variant === "sheet" && <div className="cam-primer__scrim" aria-hidden="true" />}
      <div className="cam-primer__panel">
        {variant === "full" && (
          <div className="cam-primer__art" aria-hidden="true">
            <div className="cam-primer__shot">
              <img src="/first-catch-cafe.webp" alt="" className="cam-primer__photo" />
              <span className="cam-primer__corners">
                <i />
                <i />
                <i />
                <i />
              </span>
              <span className="cam-primer__chip">
                <Sparkles size={14} strokeWidth={2.4} />
                AI
              </span>
            </div>
          </div>
        )}
        <div className="cam-primer__body">{head}</div>
        {actions}
      </div>
    </div>
  );
}
