import { Loader2, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { WebImageCandidate } from "@/hooks/use-auto-hero";

/**
 * **見出しの絵の「別の画像」の列と、Pro の「AIで絵を作る」**（`useAutoHero` の候補を選ぶ所）。
 *
 * 札のシート（`StickerSheet`）にだけ在り、図鑑から開く詳細（`/dex/$stickerId`）には
 * 無かった — 同じ「単語の詳細」なのに、入口によって絵を選べたり AI で作れたりしなかった
 * （Codex 指摘 2026-10-07）。両方からこれを描く。
 *
 * - 自分で撮った写真（実物・切り抜き）がある札には出さない（#67。撮った物がその札の答え）。
 * - 見出しに絵が入らなかった時は、候補が1枚だけでも選べるように出す。
 * - Pro の人には「AIで絵を作る」も出す（候補が無くても）。
 * - **写真が1枚も残らず、見出しにも絵が無い時**は、Pro の人には「AIで絵を作る」を
 *   目立つ形で出す（オーナー指示 2026-10-09。外れの写真は出さなくなったので、絵を得る道はこれ）。
 *   押した時だけ作る。Pro でない人には何も出さない（語の札のまま）。
 */
export function HeroImageChoices({
  ownPhoto,
  hasHero,
  candidates,
  swapping,
  onSwap,
  isPro,
  onGenerateAi,
  generatingAi = false,
  noPhotoFound = false,
}: {
  /** 自分で撮った写真（実物・切り抜き）があるか。 */
  ownPhoto: boolean;
  /** 見出しにいま絵が出ているか。 */
  hasHero: boolean;
  candidates: readonly WebImageCandidate[];
  swapping: string | null;
  onSwap: (c: WebImageCandidate) => void;
  isPro: boolean;
  onGenerateAi?: () => void;
  generatingAi?: boolean;
  /** 探し終えて、出せる写真が1枚も無かった（探している間は偽 — 「見つからない」と早まらない）。 */
  noPhotoFound?: boolean;
}) {
  const t = useT();
  if (ownPhoto) return null;
  if (noPhotoFound && candidates.length === 0 && !hasHero && isPro && onGenerateAi) {
    return (
      <section className="mb-4">
        <button
          type="button"
          onClick={onGenerateAi}
          disabled={!!swapping || generatingAi}
          aria-busy={generatingAi}
          className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-body font-semibold text-primary-foreground transition active:scale-95 disabled:opacity-60"
        >
          {generatingAi ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {generatingAi ? t("card.aiImageMaking") : t("card.aiImage")}
        </button>
      </section>
    );
  }
  if (!(candidates.length > 1 || (!hasHero && candidates.length > 0) || (isPro && !!onGenerateAi)))
    return null;
  return (
    <section className="mb-4">
      <div className="mb-1.5 text-caption font-semibold text-muted-foreground">
        {t("card.pickAnotherImage")}
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {candidates.map((c) => (
          <button
            key={c.url}
            onClick={() => onSwap(c)}
            disabled={!!swapping}
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-border transition active:scale-95 disabled:opacity-50"
            aria-label={t("card.pickAnotherImage")}
          >
            <img src={c.thumb ?? c.url} alt="" className="h-full w-full object-cover" />
            {swapping === c.url && (
              <span className="absolute inset-0 grid place-items-center bg-black/40">
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              </span>
            )}
          </button>
        ))}
      </div>
      {isPro && onGenerateAi && (
        <button
          type="button"
          onClick={onGenerateAi}
          disabled={!!swapping}
          aria-busy={generatingAi}
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-secondary px-4 text-footnote font-semibold text-foreground transition active:scale-95 disabled:opacity-50"
        >
          {generatingAi ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {generatingAi ? t("card.aiImageMaking") : t("card.aiImage")}
        </button>
      )}
    </section>
  );
}
