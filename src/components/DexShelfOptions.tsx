import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { SHELF_STYLES, type ShelfStyle } from "@/lib/shelf-prefs";

/**
 * 棚の見え方を選ぶシート。
 *
 * ## なぜ「掛け合わせ」をやめたか
 * もとは 素材6種 × 並べ方4種 で、選択肢が 24 通りあった。独立監査の
 * 指摘はこうだった:
 *
 * > 390px 幅では「なし / ガラス / コンクリート」の差は説明されなければ
 * > 気づかれない。24通りは**選ばなかったことの表明**であって、
 * > 「何を作らないと決めたか」に一度も答えていない。
 *
 * しかも「並べ方」の帯には *2列 / 3列 / 4列 / 背表紙* が同居していた —
 * 前3つは密度、背表紙は表示形式で、**分類の違うものが同じ帯にいた**。
 *
 * いまは**それぞれ完成した見え方**を3つだけ置く。板・列数・モノの
 * 見せ方は見え方ごとにこちらで決めてある。ユーザーが解くのは
 * 「どれが好きか」だけで、「木目 × 4列は変にならないか」ではない。
 *
 * ## 設計で決めたこと
 * **開いたまま後ろの棚が変わる。** 選ぶ → 閉じる → 確かめる、では
 * 選んでいるものが何なのか分からない。だからシートは画面の下半分だけを
 * 覆い、上半分に本物の棚を残す。押した結果がその場で見える。
 *
 * そのため、この画面には「適用」も「キャンセル」も無い。選択そのものが
 * 適用で、気に入らなければ別のものを押せばいい(apple-design §16 —
 * 元に戻せる操作に確認を挟まない)。
 *
 * 見本(小さな四角)は出さない。**本物が後ろに見えているのに、
 * 小さな偽物を並べる意味がない。**
 */
export function DexShelfOptions({
  style,
  onStyle,
  onClose,
}: {
  style: ShelfStyle;
  onStyle: (v: ShelfStyle) => void;
  onClose: () => void;
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement | null>(null);
  // 開く前に焦点を持っていた要素(= 開いたボタン)。閉じたらここへ返す。
  const openerRef = useRef<HTMLElement | null>(null);

  // Esc で閉じる。全画面ではないが、覆っている以上は出口を鍵盤にも置く。
  // `onClose` は呼び出し側でインラインの関数なので、依存に入れると
  // **素材を1つ選ぶたびに張り直される**。閉じる手段は張りっぱなしでいい。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 焦点の出し入れは**開いたときと閉じたときの1回ずつ**。
  // ここを onClose に依存させていたせいで、素材や密度を選ぶたびに
  // 効果が走り直して焦点が「✕」に飛び、鍵盤の人は2回目のEnterで
  // シートを閉じてしまっていた。
  useEffect(() => {
    openerRef.current = (document.activeElement as HTMLElement) ?? null;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      // 閉じたら開いたボタンへ返す。返さないと焦点が body に落ちて、
      // 鍵盤の人は一覧の先頭から辿り直すことになる。
      openerRef.current?.focus?.();
    };
  }, []);

  const label: Record<ShelfStyle, { name: string; note: string }> = {
    shelf: { name: t("shelf.styShelf"), note: t("shelf.styShelfNote") },
    library: { name: t("shelf.styLibrary"), note: t("shelf.styLibraryNote") },
    specimen: { name: t("shelf.stySpecimen"), note: t("shelf.stySpecimenNote") },
  };

  return (
    // 幕は敷くが**上半分は素通し**。後ろの棚が変わるのを見せるため、
    // 暗くするのは自分が載っている下側だけにする。
    <div className="fixed inset-x-0 bottom-0 z-50" role="dialog" aria-label={t("shelf.optTitle")}>
      <div
        ref={panelRef}
        className="app-sheet material-in mx-auto max-w-3xl rounded-t-3xl px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-foreground/20" aria-hidden />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t("shelf.optTitle")}</h2>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 縦に並べて、名前と一言をそれぞれに付ける。帯に押し込むと
            5つ目が右端で切れて「まだ在る」ことが伝わらない(以前そうだった)。 */}
        <div className="space-y-2">
          {SHELF_STYLES.map((v) => (
            <button
              key={v}
              onClick={() => {
                onStyle(v);
                haptic("selection");
              }}
              aria-pressed={style === v}
              className={`flex min-h-11 w-full items-baseline gap-2 rounded-2xl border px-4 py-3 text-left ${
                style === v ? "border-primary bg-primary/8" : "border-border bg-background"
              }`}
            >
              <span
                className={`text-sm font-semibold ${style === v ? "text-primary" : "text-foreground"}`}
              >
                {label[v].name}
              </span>
              <span className="text-[11px] text-muted-foreground">{label[v].note}</span>
            </button>
          ))}
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">{t("shelf.optLiveHint")}</p>
      </div>
    </div>
  );
}
