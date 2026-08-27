import { Camera, Loader2, Scissors } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * **無い絵は「作る」ボタンにする。**
 *
 * オーナー指示 2026-08-26:
 * > 「もし切り抜きをしていない場合は切り抜くというボタンを、自撮りして
 * >  ない場合は自撮りをするボタンを表示して。」
 *
 * ## 出す条件はここが持つ
 * 「切り抜きが無い」「自撮りが無い」の判定を呼ぶ側それぞれに書くと、
 * 画面ごとに条件がずれる（実際、図鑑の詳細には**ボタンそのものが無かった**）。
 * 渡すのは絵の在りかだけで、**出すかどうかはここで決める**。
 *
 * ## 自撮りは `<label>` で `<input>` を包む
 * `button` から `.click()` を投げると、端末によっては**その場の指の操作**と
 * 見なされず、前後どちらのカメラかの指定ごと落ちる
 * （2026-08-20 のオーナー指摘「自撮りするを押してもインカメラにならない」の
 * 原因がこれだった）。
 *
 * ## そして `display:none` にしない
 * 同じ指摘が 2026-08-26 にまた来た。`<label>` で包んでも
 * **`className="hidden"`（= `display:none`）だと `capture` が効かない端末が
 * ある** — 表示の木から外れた入力は「その場で開くカメラ」と結び付けられない。
 * `sr-only` は木に残したまま見えなくする書き方なので、`capture` が生きる。
 * 押す物は `<label>` のままなので、見た目も指の当たりも変わらない。
 *
 * 通信も状態も持たない。検査の雛形から本物の見た目をそのまま撮れる。
 */
export function PhotoAddButtons({
  objectUrl,
  cutoutUrl,
  selfieUrl,
  busy,
  onCutout,
  onSelfie,
  className = "",
}: {
  /** 元の写真。**無ければ切り抜けない**（切り抜く元が無い）。 */
  objectUrl?: string | null;
  cutoutUrl?: string | null;
  selfieUrl?: string | null;
  busy: boolean;
  onCutout: () => void;
  onSelfie: (file: File) => void;
  className?: string;
}) {
  const t = useT();
  const canCutout = !!objectUrl && !cutoutUrl;
  const canSelfie = !selfieUrl;
  if (!canCutout && !canSelfie) return null;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {canCutout && (
        <button
          onClick={onCutout}
          disabled={busy}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary/12 text-body font-semibold text-primary-ink disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
          {busy ? t("photo.cuttingOut") : t("photo.cutoutNow")}
        </button>
      )}
      {canSelfie && (
        <label
          className={`inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-primary/12 text-body font-semibold text-primary-ink ${
            busy ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <Camera className="h-4 w-4" />
          {t("photo.selfieNow")}
          <input
            type="file"
            accept="image/*"
            capture="user"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onSelfie(f);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}
