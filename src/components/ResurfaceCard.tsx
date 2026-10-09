import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { localeOf, useT, useUiLang } from "@/lib/i18n";
import { CachedImg } from "@/lib/image-cache";
import { stickerPhotoUrl } from "@/lib/sticker-photo";
import { taipeiDay } from "@/lib/taipei-day";
import type { StickerWithWord } from "@/lib/stickers.functions";
import { getDueReviews } from "@/lib/reviews.functions";
import { prepareTargetedReview } from "@/lib/review-prepare";
import {
  CAUGHT_AGO_KEY,
  dismissResurface,
  parseResurfaceState,
  pickResurface,
  RESURFACE_STORAGE_KEY,
  type ResurfacePick,
  type ResurfaceState,
} from "@/lib/resurface";

/** このアプリの起動中に、もう出した札（同じ札をホームへ戻るたびに動かさない）。 */
let resurfaceShownId: string | null = null;

/** 押した時に、用意の途中の束を待つ上限（これより遅ければ用意を待たずに開く）。 */
const TAP_WAIT_MS = 1500;

/**
 * **ホームの「〇か月前に撮ったこの単語、覚えてる？」**（`lib/resurface.ts`）。
 *
 * 写真だけを見せて、語は**伏せておく** — 見て思い出すのがこの札の仕事。閉じれば今日は
 * もう出ない。借りの言い方（「〇件たまっています」）はしない。言えそうな語だけを選んである。
 *
 * **押すとその語から復習が始まる**（オーナー指示 2026-10-07「その通知をタップしたら復習の
 * 問題が始まるようにして」。前は語の詳細が開き、発音が鳴っていた）。`/review?sticker=…`
 * でその語が1問目、続けて今日の復習。発音は鳴らさない — 鳴らすと4択の答えが先に分かる。
 * 札を出した時に裏でその束を用意しておく（`review-prepare.ts`）ので、押すとすぐ問題が出る。
 */
export function ResurfaceCard({
  items,
  recall,
}: {
  items: readonly StickerWithWord[];
  /** 札の id → いま思い出せる確率（0〜100）。 */
  recall: ReadonlyMap<string, number>;
}) {
  const navigate = useNavigate();
  const fetchReview = useServerFn(getDueReviews);
  const stateRef = useRef<ResurfaceState>({});
  /** 決めた結果（決めていなければ undefined）。何度呼んでも同じ答え（開発時の2度描きでも）。 */
  const decided = useRef<ResurfacePick | null | undefined>(undefined);
  const candidates = useMemo(
    () =>
      items.map((s) => ({
        id: s.id,
        caughtAt: s.taken_at || s.created_at,
        hasPhoto: s.capture_type === "photo" && !!stickerPhotoUrl(s, { thumb: true }),
      })),
    [items],
  );
  /** 記憶の数が届いていれば、端末の記録を読んで今日の1枚を決める（届いていなければ null）。 */
  const decide = (): ResurfacePick | null => {
    if (decided.current !== undefined) return decided.current;
    if (recall.size === 0 || candidates.length === 0) return null;
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
    decided.current = chosen;
    return chosen;
  };
  /**
   * **最初の描画で決める**（オーナー報告 2026-10-09「ホームのアイコン押すとカクカクする」）。
   * 前は描いた後の effect で決めていたので、タブで戻るたびに札の無いホームが 1 コマ描かれ、
   * 次のコマで札が差し込まれて日付と誌面が下へずれていた。記憶の数（`["memory-overview"]`）は
   * 2 回目からは手元にあるので、ここで決まる。今日の分は端末に覚えてあるので、同じ1枚になる。
   */
  const [pick, setPick] = useState<ResurfacePick | null>(() =>
    typeof window === "undefined" ? null : decide(),
  );
  // 初めて開いた時など、記憶の数が後から届いた時だけ、届いてから1回決める。
  useEffect(() => {
    if (decided.current !== undefined) return;
    const chosen = decide();
    if (chosen) setPick(chosen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, recall]);

  /**
   * 札を出したら**すぐ**、その語から始まる復習を裏で用意する（押した瞬間に問題を出すため）。
   * 前は描画と取り合わないよう 2.5 秒待っていたが、その間に押すと用意の無いまま開いて
   * 「準備中…」になっていた（Codex 指摘 2026-10-07）。1時間以内に用意した物があれば
   * 読み直さない（`PREPARED_REUSE_MS`）ので、開くたびに重い問い合わせは走らない。
   */
  const pickedId = pick?.id ?? null;
  const preparing = useRef<{ id: string; done: Promise<unknown> } | null>(null);
  useEffect(() => {
    if (!pickedId) return;
    preparing.current = {
      id: pickedId,
      done: prepareTargetedReview(fetchReview, pickedId).catch(() => false),
    };
  }, [pickedId, fetchReview]);

  /** 押した時。用意の途中なら**少しだけ**（`TAP_WAIT_MS` まで）待ってから開く。 */
  const start = async (id: string) => {
    const p = preparing.current;
    if (p?.id === id) {
      await Promise.race([p.done, new Promise((r) => window.setTimeout(r, TAP_WAIT_MS))]);
    }
    void navigate({ to: "/review", search: { sticker: id } });
  };

  const sticker = pick ? items.find((s) => s.id === pick.id) : undefined;
  /**
   * 札がふわっと出る動きは、その札を**初めて**出す時だけ（下のバーでホームへ戻るたびに
   * 出直すと、戻るたびに誌面の上がちらついて見えた。2026-10-09）。
   */
  const [enter] = useState(() => !pick || resurfaceShownId !== pick.id);
  useEffect(() => {
    if (pick) resurfaceShownId = pick.id;
  }, [pick]);
  if (!pick || !sticker) return null;
  return (
    <ResurfaceCardView
      sticker={sticker}
      pick={pick}
      enter={enter}
      onStart={(id) => void start(id)}
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
  onStart,
  onDismiss,
  enter = true,
}: {
  sticker: StickerWithWord;
  pick: ResurfacePick;
  /** 出る時の動き（初めて出す時だけ。戻ってきたホームでは動かさない）。 */
  enter?: boolean;
  /** 押した時。その語から復習を始める。 */
  onStart: (id: string) => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const ui = useUiLang();
  const url = stickerPhotoUrl(sticker, { prefer: sticker.hero_role ?? undefined, thumb: true });
  const when = new Date(sticker.taken_at || sticker.created_at);
  const dateLabel = Number.isFinite(when.getTime())
    ? when.toLocaleDateString(localeOf(ui), { year: "numeric", month: "long", day: "numeric" })
    : "";
  const sub = [dateLabel, sticker.location_name].filter(Boolean).join(" · ");
  return (
    <div
      data-settled={enter ? undefined : ""}
      className="resurface-card relative mb-4 flex items-center gap-3 rounded-3xl border border-border bg-card p-3 shadow-sm"
    >
      <button
        type="button"
        onClick={() => onStart(sticker.id)}
        aria-label={t("home.resurface.open")}
        className="press-in flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white p-0.5 shadow"
          aria-hidden
        >
          {url && <CachedImg src={url} alt="" className="h-full w-full rounded-lg object-cover" />}
        </span>
        <span className="min-w-0">
          <span className="block text-headline font-bold leading-tight">
            {t(CAUGHT_AGO_KEY[pick.unit], { n: pick.n })}
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
