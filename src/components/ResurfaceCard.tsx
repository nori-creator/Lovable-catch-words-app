import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { localeOf, useT, useUiLang } from "@/lib/i18n";
import { CachedImg } from "@/lib/image-cache";
import { stickerPhotoUrl } from "@/lib/sticker-photo";
import { usePronounce } from "@/lib/use-pronounce";
import { taipeiDay } from "@/lib/taipei-day";
import type { StickerWithWord } from "@/lib/stickers.functions";
import type { HeroOrigin as FlightOrigin } from "@/components/use-hero-reveal";
import {
  dismissResurface,
  parseResurfaceState,
  pickResurface,
  RESURFACE_STORAGE_KEY,
  type ResurfacePick,
  type ResurfaceState,
} from "@/lib/resurface";

/**
 * **ホームの「〇か月前のこの言葉、まだ言える？」**（`lib/resurface.ts`）。
 *
 * 写真だけを見せて、語は**伏せておく** — 見て思い出すのがこの札の仕事。押すと語が開き、
 * 同時に発音が鳴る（答え合わせは耳で）。閉じれば今日はもう出ない。
 * 借りの言い方（「〇件たまっています」）はしない。言えそうな語だけを選んである。
 */
export function ResurfaceCard({
  items,
  recall,
  onOpen,
}: {
  items: readonly StickerWithWord[];
  /** 札の id → いま思い出せる確率（0〜100）。 */
  recall: ReadonlyMap<string, number>;
  onOpen: (id: string, from?: FlightOrigin | null) => void;
}) {
  const [pick, setPick] = useState<ResurfacePick | null>(null);
  const stateRef = useRef<ResurfaceState>({});
  const decided = useRef(false);
  const candidates = useMemo(
    () =>
      items.map((s) => ({
        id: s.id,
        caughtAt: s.taken_at || s.created_at,
        hasPhoto: s.capture_type === "photo" && !!stickerPhotoUrl(s, { thumb: true }),
      })),
    [items],
  );
  // 端末の記録（localStorage）を読むのは描いた後。記憶の数が届いてから1回だけ決める。
  useEffect(() => {
    if (decided.current || recall.size === 0 || candidates.length === 0) return;
    decided.current = true;
    let state: ResurfaceState = {};
    try {
      state = parseResurfaceState(localStorage.getItem(RESURFACE_STORAGE_KEY));
    } catch {
      /* 使えない端末では、毎回まっさらから決める */
    }
    const { pick: chosen, next } = pickResurface({
      items: candidates,
      recall,
      nowMs: Date.now(),
      today: taipeiDay(),
      state,
    });
    stateRef.current = next;
    if (next !== state) {
      try {
        localStorage.setItem(RESURFACE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* 覚えられなくても出すのは出す */
      }
    }
    setPick(chosen);
  }, [candidates, recall]);

  const sticker = pick ? items.find((s) => s.id === pick.id) : undefined;
  if (!pick || !sticker) return null;
  return (
    <ResurfaceCardView
      sticker={sticker}
      pick={pick}
      onOpen={onOpen}
      onDismiss={() => {
        const next = dismissResurface(stateRef.current, taipeiDay());
        stateRef.current = next;
        try {
          localStorage.setItem(RESURFACE_STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* 今日のうちは画面から消えれば足りる */
        }
        setPick(null);
      }}
    />
  );
}

/** 描くだけの札（見本からも使う）。 */
export function ResurfaceCardView({
  sticker,
  pick,
  onOpen,
  onDismiss,
}: {
  sticker: StickerWithWord;
  pick: ResurfacePick;
  onOpen: (id: string, from?: FlightOrigin | null) => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const ui = useUiLang();
  const pronounce = usePronounce(sticker.word.language ?? undefined);
  const photoRef = useRef<HTMLSpanElement>(null);
  const url = stickerPhotoUrl(sticker, { prefer: sticker.hero_role ?? undefined, thumb: true });
  const when = new Date(sticker.taken_at || sticker.created_at);
  const dateLabel = Number.isFinite(when.getTime())
    ? when.toLocaleDateString(localeOf(ui), { year: "numeric", month: "long", day: "numeric" })
    : "";
  const sub = [dateLabel, sticker.location_name].filter(Boolean).join(" · ");
  return (
    <div className="resurface-card relative mb-4 flex items-center gap-3 rounded-3xl border border-border bg-card p-3 shadow-sm">
      <button
        type="button"
        onClick={() => {
          // 押した指の中で鳴らす（iOS は操作の外の再生を止める）。
          void pronounce(sticker.word.headword);
          const r = photoRef.current?.getBoundingClientRect();
          onOpen(
            sticker.id,
            r && url ? { x: r.left, y: r.top, w: r.width, h: r.height, url, radius: 10 } : null,
          );
        }}
        aria-label={t("home.resurface.open", { word: sticker.word.headword })}
        className="press-in flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          ref={photoRef}
          className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white p-0.5 shadow"
          aria-hidden
        >
          {url && <CachedImg src={url} alt="" className="h-full w-full rounded-lg object-cover" />}
        </span>
        <span className="min-w-0">
          <span className="block text-headline font-bold leading-tight">
            {t(pick.unit === "years" ? "home.resurface.years" : "home.resurface.months", {
              n: pick.n,
            })}
          </span>
          {sub && (
            <span className="mt-0.5 block truncate text-caption text-muted-foreground">{sub}</span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("home.resurface.close")}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
