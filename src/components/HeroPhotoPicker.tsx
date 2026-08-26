import { Camera, Check, ImageUp, Scissors, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { CachedImg } from "@/lib/image-cache";
import type { PhotoSurface } from "@/lib/photo-surface";
import type { PhotoRole, PhotoSources } from "@/lib/sticker-photo";

/**
 * 「この1枚は、どの絵で見せるか」を選ぶ面(要望 #17)。
 *
 * > 「写真ごとに長押しで表示画像を変更できるようにしたい」
 *
 * ## `window.confirm` をやめる
 * 長押し(550ms)そのものは前からあったが、その先が
 * `window.confirm("写真を変えますか?")` → ファイル選択に**直行**していた。
 * つまり「表示する絵を選ぶ」ではなく「別の写真に差し替える」しか無く、
 * 要望の半分しか無かった。しかも素のネイティブの窓なので、
 * このアプリの見た目・字体・暗いテーマのどれにも従わない。
 *
 * ## 在る絵だけを出す
 * 「自撮り」の札が無い所に「自撮り」を出しても、押しても何も起きない。
 * **押せない選択肢を並べない** — 選べる物だけを、その絵と一緒に見せる。
 *
 * ## 「設定に従う」をやめた(オーナー指示 2026-08-25)
 * > 「アルバム/単語詳細の画像長押しの『設定に従う』ボタンを削除。
 * >  アルバムと単語詳細で**別々に**種類を選べる。」
 *
 * この面は**その画面のための面**になった。どの画面の見え方をいま
 * 触っているのかを見出しの下に書く — 書かないと、同じ見た目の面が
 * 2つあって片方しか効かない、という一番わかりにくい形になる。
 *
 * ## 無い絵は「作る」ボタンにする
 * 切り抜きが無ければ「いま切り抜く」、自撮りが無ければ「自撮りを撮る」。
 * **押せない選択肢を並べない**という上の決めごとの続きで、
 * 「無いから選べない」で行き止まりにせず、その場で作れるようにする。
 *
 * 通信も状態も持たない。検査の雛形から本物の見た目をそのまま撮れる。
 */

const ORDER: readonly PhotoRole[] = ["object", "cutout", "selfie", "placeholder"];

const LABEL: Record<PhotoRole, string> = {
  object: "photo.roleObject",
  cutout: "photo.roleCutout",
  selfie: "photo.roleSelfie",
  placeholder: "photo.rolePlaceholder",
};

/** その役の絵(原寸を優先。ここは選ぶための見本なので大きいほうがよい)。 */
function urlOf(s: PhotoSources, role: PhotoRole): string | null {
  if (role === "object") return s.object_url ?? s.object_thumb_url ?? null;
  if (role === "cutout") return s.cutout_url ?? s.cutout_thumb_url ?? null;
  if (role === "selfie") return s.selfie_url ?? null;
  return s.placeholder_url ?? null;
}

export function HeroPhotoPicker({
  sources,
  surface,
  current,
  onPick,
  onReplaceFile,
  onCutoutNow,
  onSelfieFile,
  onClose,
  saving,
}: {
  sources: PhotoSources;
  /** どの画面の見え方をいま触っているか。見出しの下に出す。 */
  surface: PhotoSurface;
  /** いま選ばれている役。null = まだ選んでいない。 */
  current: string | null | undefined;
  onPick: (role: PhotoRole) => void;
  /** 「別の写真に差し替える」。前からあった道はここに残す。 */
  onReplaceFile: () => void;
  /**
   * 「いま切り抜く」(要望 #18 の後半)。
   * **切り抜きがまだ無い札のときだけ**渡される。既に在る札に出しても、
   * 押しても同じ絵が出来るだけで、待たせるぶん損をする。
   */
  onCutoutNow?: () => void;
  /**
   * 「いま自撮りを撮る」。**自撮りがまだ無い札のときだけ**渡される。
   *
   * 押す物そのものを `<label>` にして、その中の
   * `<input capture="user">` を包む。`button` から `.click()` を投げると、
   * 端末によっては**その場の指の操作**と見なされず、前後どちらのカメラかの
   * 指定ごと落ちる(2026-08-20 のオーナー指摘「自撮りするを押しても
   * インカメラにならない」の原因がこれだった)。
   */
  onSelfieFile?: (file: File) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const t = useT();
  const available = ORDER.filter((r) => !!urlOf(sources, r));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="block">
          <span className="block text-headline font-semibold">{t("photo.pickTitle")}</span>
          {/* **どの画面に効くのかを書く。** アルバムと単語の詳細で
              別々に選べるようになったので、書かないと同じ面が2つ在って
              片方しか効かない、という形に見える。 */}
          <span className="block text-caption text-muted-foreground">
            {t(surface === "album" ? "photo.forAlbum" : "photo.forDetail")}
          </span>
        </span>
        <button
          onClick={onClose}
          aria-label={t("common.close")}
          className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card active:scale-95 motion-reduce:active:scale-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul className="grid grid-cols-2 gap-2">
        {available.map((role) => {
          const url = urlOf(sources, role)!;
          const on = current === role;
          return (
            <li key={role}>
              <button
                onClick={() => onPick(role)}
                disabled={saving}
                aria-pressed={on}
                className={`w-full overflow-hidden rounded-2xl border text-left ${
                  on ? "border-primary ring-2 ring-primary/40" : "border-border"
                }`}
              >
                <span className="relative block aspect-square bg-secondary">
                  <CachedImg
                    src={url}
                    alt={t(LABEL[role])}
                    className="h-full w-full object-cover"
                  />
                  {on && (
                    <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                </span>
                <span className="block px-2 py-2 text-footnote font-medium">{t(LABEL[role])}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* 速さを選んだ人はキャッチの瞬間に切り抜いていない。
          **ここから掛け直せる** — でないと「速さを選ぶ = 二度と切り抜けない」
          になり、設定が片道になってしまう。 */}
      {onCutoutNow && (
        <button
          onClick={onCutoutNow}
          disabled={saving}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary/12 text-body font-semibold text-primary-ink disabled:opacity-60"
        >
          <Scissors className="h-4 w-4" />
          {saving ? t("photo.cuttingOut") : t("photo.cutoutNow")}
        </button>
      )}

      {/* 自撮りがまだ無い札。切り抜きと同じ理屈で、**ここから撮れる**。
          `label` で `input` を包むのは上の注のとおり。 */}
      {onSelfieFile && (
        <label
          className={`inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-primary/12 text-body font-semibold text-primary-ink ${
            saving ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <Camera className="h-4 w-4" />
          {t("photo.selfieNow")}
          <input
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            disabled={saving}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onSelfieFile(f);
              e.target.value = "";
            }}
          />
        </label>
      )}

      {/* 前からあった道。**消さない** — 「そもそも別の写真にしたい」は
          「どれを主役にするか」とは別の用事。 */}
      <button
        onClick={onReplaceFile}
        disabled={saving}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card text-body font-medium"
      >
        <ImageUp className="h-4 w-4" />
        {t("photo.replaceFile")}
      </button>
    </div>
  );
}
