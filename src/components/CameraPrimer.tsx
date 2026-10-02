import { useEffect, useId, useRef } from "react";
import { Camera, ImagePlus, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";
import "./camera-primer.css";

/**
 * **カメラを頼む前の一枚**（オーナー指示 2026-10-02「許可の画面がダサい…スマホやアプリ、
 * ブラウザの許可のほうが洗練されてる」→ 2026-10-03「カメラ前はBにして、画像が真っ直ぐに
 * して、写したものなかからとか、緑のマークのあとの注意書きは消す。スマホのカメラで撮る
 * 機能は消して」）。
 *
 * ブラウザ自身の許可の画面はページから変えられない。だから**その前に**、見本の写真と
 * 見出しだけの1枚を出し、「カメラを使う」を押した**後で**だけブラウザに頼む（次に出る
 * 確認で何を押すかも一行添える）。カメラを使いたくない人には「写真を選ぶ」を置く。
 *
 * 押す所は案内と同じ青い光の輪（`tour-pulse`）で示し、実物確認の運転役が辿れるよう
 * `data-tour` を付ける。
 */
export function CameraPrimer({
  onAllow,
  onLibrary,
}: {
  onAllow: () => void;
  onLibrary: () => void;
}) {
  const t = useT();
  const titleId = useId();
  const allow = useRef<HTMLButtonElement>(null);
  /** 開いたら「カメラを使う」に手元を合わせる（キーボード・読み上げの人が迷わない）。 */
  useEffect(() => {
    allow.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      className="cam-primer cam-primer--screen"
      data-tour="camera-primer"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="cam-primer__panel">
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
        <div className="cam-primer__body">
          <h2 id={titleId} className="cam-primer__title ja-phrase">
            {t("campriming.title")}
          </h2>
        </div>
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
          <button
            type="button"
            data-tour="camera-library"
            className="cam-primer__second press-in"
            onClick={onLibrary}
          >
            <ImagePlus size={18} strokeWidth={2.2} aria-hidden="true" />
            {t("campriming.library")}
          </button>
        </div>
      </div>
    </div>
  );
}
