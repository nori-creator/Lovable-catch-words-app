import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { stickerPhotoUrl } from "@/lib/sticker-photo";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { StickerSheet } from "@/components/StickerSheet";
import { listMyShelves, listMyStickers, type StickerWithWord } from "@/lib/stickers.functions";
import { MemoryBadge } from "@/components/MemoryBadge";
import { useMemoryBadges } from "@/lib/use-memory-map";
import type { MemoryBadgeInfo } from "@/lib/memory-badge";
import { PronounceButton } from "@/components/PronounceButton";
import { CachedImg } from "@/lib/image-cache";
import { useMemo, useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import {
  Library,
  LayoutGrid,
  List,
  Map as MapIcon,
  CalendarDays,
  Search,
  X,
  Volume2,
  MapPin,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useT, TARGET_LANG_LABEL_KEYS } from "@/lib/i18n";
import { formatCount } from "@/lib/count";
import { normalizeTargetLanguage } from "@/lib/target-lang";
import { useUiLayout, type LayoutId } from "@/lib/ui-pack";
import { Zh } from "@/components/Zh";
import { tStatic } from "@/lib/i18n";
import { asCategoryKey, categoryEmoji } from "@/lib/category";
import {
  NO_FILTER,
  applyDexFilter,
  categoryOptions,
  dayOptions,
  isFiltering,
  pruneFilter,
  type DexFilter,
  type FilterOption,
} from "@/lib/dex-filter";
import { FilterMenu } from "@/components/FilterMenu";
import { DexCalendar } from "@/components/DexCalendar";
import { DexShelf } from "@/components/DexShelf";
import { LoadFailed } from "@/components/LoadFailed";
import { EmptyState } from "@/components/EmptyState";
import { Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";
import { DEX_SHELF_ENABLED } from "@/lib/features";
import { motionReducedNow } from "@/hooks/use-reduced-motion";

/**
 * 落ちてきたモノが棚板に触れる瞬間(演出の開始から何ミリ秒か)。
 *
 * 下の `slamIn` が `880ms linear 120ms both`、その 52% が接地(潰れ)。
 * ここを直すときは**両方**直すこと — ずれると音だけ先に鳴る。
 */
const SLAM_IMPACT_MS = 520;

export const Route = createFileRoute("/_authenticated/dex")({
  validateSearch: (search: Record<string, unknown>): { justCaught?: string } => {
    // キャッチ演出v2: /dex?justCaught=<stickerId> で該当セルがバンと着弾する
    return typeof search.justCaught === "string" && search.justCaught
      ? { justCaught: search.justCaught }
      : {};
  },
  head: () => ({
    meta: [
      { title: tStatic("page.dex") },
      {
        name: "description",
        content: "あなたがキャッチした言葉だけの図鑑。撮ったものから自動でカテゴリーが生まれます。",
      },
    ],
  }),
  component: DexPage,
});

type ViewMode = "shelf" | "gallery" | "list" | "map" | "calendar";

declare global {
  interface Window {
    initDexMap?: () => void;
    google?: unknown;
  }
}

function DexPage() {
  const t = useT();
  const fetchStickers = useServerFn(listMyStickers);
  const fetchShelves = useServerFn(listMyShelves);
  const navigate = useNavigate();
  const { justCaught } = Route.useSearch();
  const {
    data: stickers,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["stickers"],
    queryFn: () => fetchStickers(),
    // Keep the signed URLs stable across tab switches so the browser cache
    // can serve the images instead of re-downloading them (roadmap B1).
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  /**
   * その人だけの棚(AI が語を分析して作ったもの)。
   *
   * **これが読めなくても図鑑は出す。** 棚が無ければ既定の54棚だけで並ぶので、
   * ここの失敗を画面に出す理由が無い(`listMyShelves` 側も空配列に畳む)。
   */
  const { data: shelfData } = useQuery({
    queryKey: ["user-shelves"],
    queryFn: () => fetchShelves(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const shelves = useMemo(() => shelfData?.shelves ?? [], [shelfData]);
  // Memoize so the reference is stable across renders — otherwise `filtered`
  // and `groups` below recompute on every render (a new `[]`/array identity
  // invalidates their useMemo deps), re-filtering the whole gallery each time.
  const captured = useMemo(() => stickers?.items ?? [], [stickers]);
  /** 上限に達していて、この先が出せていない状態か。 */
  const truncated = stickers?.truncated ?? false;
  /** 本当の総数(サーバーが数えたもの)。取れなければ null。 */
  const totalCount = stickers?.total ?? null;

  const [view, setView] = useState<ViewMode>("gallery");
  const landingStartedRef = useRef<string | null>(null);

  // キャッチ演出v2の着弾。**キャッチ1回につき1度だけ**走らせる。
  //
  // 以前はここの依存配列に `view` が入っていた。この効果自身が
  // `setView("shelf")` を呼ぶので、演出中(1.6秒)にユーザーが一覧や地図へ
  // 切り替えると効果が再実行され、**棚へ引き戻して振動をもう一度鳴らす**。
  // 押したのに戻される画面は、壊れているのと区別がつかない。
  useEffect(() => {
    if (!justCaught) return;
    setView(DEX_SHELF_ENABLED ? "shelf" : "gallery");
    setSearch("");
    if (!captured.some((item) => item.id === justCaught)) return;
    if (landingStartedRef.current === justCaught) return;
    landingStartedRef.current = justCaught;
    if (document.documentElement.dataset.rewardFlight) {
      const t = setTimeout(() => {
        void navigate({ to: "/dex", search: {}, replace: true, resetScroll: false });
      }, 6000);
      return () => clearTimeout(t);
    }

    // 「ドン」は**モノが棚板に触れた瞬間**に鳴らす。以前は演出の開始と同時に
    // 振動していて、絵はまだ画面の上にあるのに手だけ先に着地していた。
    // 音と振動が絵とずれると、着地したという実感がまるごと消える。
    //
    // slamIn は `880ms linear 120ms` で、52% が接地(潰れ)。
    //   120 + 880 * 0.52 ≒ 578ms
    // 動きを減らす設定のときは落下自体が無いので、待たずに鳴らす。
    const reduced = motionReducedNow();
    const impact = setTimeout(
      () => {
        Sound.shelfLand(); // 木の棚に載る「コッ」
        // 生の navigator.vibrate は**振動オフの設定を無視する**。
        haptic("heavy");
      },
      reduced ? 0 : SLAM_IMPACT_MS,
    );

    const t = setTimeout(() => {
      void navigate({ to: "/dex", search: {}, replace: true, resetScroll: false });
    }, 1600);
    return () => {
      clearTimeout(impact);
      clearTimeout(t);
    };
  }, [justCaught, navigate, captured]);

  // 全カテゴリーを表示したまま、着地先のセルへ移動する。
  useEffect(() => {
    if (!justCaught) return;
    setFilter(NO_FILTER);
  }, [justCaught]);

  // 該当セルへスクロール。表示の切替が描かれた**後**に探す(同じ tick で
  // getElementById すると、一覧表示を保存していた人はまだ棚が無い)。
  // 図鑑の再取得が後から届くこともあるので件数も見る。
  useEffect(() => {
    if (!justCaught) return;
    let stopped = false;
    let attempts = 0;
    const locate = () => {
      if (stopped) return;
      const el = document.getElementById(`dex-cell-${justCaught}`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
        return;
      }
      attempts += 1;
      if (attempts < 12) requestAnimationFrame(locate);
    };
    const raf = requestAnimationFrame(locate);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [justCaught, captured.length]);

  // 見た目パックのレイアウト。"album" のときは既存の描画をそのまま通す。
  const layout = useUiLayout();
  /**
   * 絞り込み(カテゴリー・日付)。どちらも `null` は「すべて」。
   *
   * **日付をここへ上げた**(オーナー指摘 2026-08-21)。前は地図の中だけに
   * 在り、一覧・棚・カレンダーには手段が無く、地図を離れると黙って消えた。
   */
  const [filter, setFilter] = useState<DexFilter>(NO_FILTER);
  const activeCategory = filter.category;
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (justCaught) return; // Arrival must not restore a previous category/view filter.
    const saved = typeof window !== "undefined" ? localStorage.getItem("dex-view") : null;
    if (saved === "list" || saved === "gallery" || saved === "map" || saved === "calendar")
      setView(saved);
    else if (saved === "shelf") setView("gallery");
    const savedCat = typeof window !== "undefined" ? localStorage.getItem("dex-category") : null;
    // **日付は覚えない。** 「その日だけ」は今この場の見方で、次に開いた
    // ときまで続くと「図鑑が減った」ようにしか見えない。
    if (savedCat) setFilter((f) => ({ ...f, category: savedCat }));
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("dex-view", view);
    // 棚から離れたらシートも閉じる(開いたままにすると、後ろが棚でない
    // のに「後ろの棚がすぐ変わります」と言い続けることになる)。
  }, [view]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeCategory) localStorage.setItem("dex-category", activeCategory);
    else localStorage.removeItem("dex-category");
  }, [activeCategory]);

  /** ボタンに並べる選択肢。数え方は `dex-filter.ts` が1つだけ持つ。 */
  const catOptions = useMemo(() => categoryOptions(captured), [captured]);
  const dOptions = useMemo(() => dayOptions(captured), [captured]);

  // 選んだ物が1件も無くなったら「すべて」に戻す(空画面で詰まらせない)。
  useEffect(() => {
    setFilter((f) => pruneFilter(f, { categories: catOptions, days: dOptions }));
  }, [catOptions, dOptions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byFilter = applyDexFilter(captured, filter);
    if (!q) return byFilter;
    return byFilter.filter((s) => {
      const w = s.word;
      // カテゴリーは**表示名でも**引けるようにする(NORI指定)。
      // category_key は "kitchenware" のような英語キーなので、それだけでは
      // 「調理器具」と打っても引っかからなかった。
      const catKey = (w.category_key ?? "").toString();
      const catLabel = t(categoryLabelKey(catKey));
      return (
        w.headword?.toLowerCase().includes(q) ||
        w.reading_zhuyin?.toLowerCase().includes(q) ||
        w.pinyin?.toLowerCase().includes(q) ||
        w.meaning_ja?.toLowerCase().includes(q) ||
        catKey.toLowerCase().includes(q) ||
        catLabel.toLowerCase().includes(q)
      );
    });
  }, [captured, search, filter, t]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const s of filtered) {
      const k = asCategoryKey(s.word.category_key);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  return (
    <AppShell title={t("title.dex")}>
      <DexHeader
        found={captured.length}
        caught={
          captured.filter((s) => s.capture_type === "photo" || !!s.cutout_url || !!s.object_url)
            .length
        }
        view={view}
        onView={setView}
        filter={filter}
        onFilter={setFilter}
        categories={catOptions}
        days={dOptions}
      />

      {/* 検索とカテゴリーは地図でも効く(地図のピンも絞り込まれる)ので、
          地図表示のときも出す。 */}
      {
        <div className="relative mb-4">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("dex.search")}
            aria-label={t("dex.searchAria")}
            className="rounded-full pl-9 pr-11"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label={t("dex.clearSearch")}
              className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      }

      {/* カテゴリーの実名で絞り込む(NORI指定: 「カテゴリー/品詞」の切替ボタンは
          廃止し、家・体の部位…といった名前のボタンを並べる)。タップでその
          カテゴリーの画像グループだけを表示する。
          §2: 選択状態は色だけでなく aria-pressed と件数でも伝える。 */}
      {/* 上限に達しているときは**そう言う**。
          図鑑は「集めたものが全部ある」ことが値打ちの画面なので、黙って
          途中で止まるのがいちばん悪い。持っているのに出せていないなら、
          出せていないと書く(ページ送りはまだ作れていない)。 */}
      {truncated && (
        <p
          role="status"
          className="mb-3 rounded-xl bg-secondary px-3 py-2 text-caption text-muted-foreground"
        >
          {t("dex.truncated", {
            n: formatCount(captured.length),
            total: formatCount(totalCount ?? captured.length),
          })}
        </p>
      )}

      {/* 絞り込みの丸を横に並べる列は**やめた**(オーナー指摘 2026-08-21)。
          上の「あなたの図鑑」の欄にボタンが2つあり、押すと選択肢が出る。
          棚だけ別の解除口を持たせていたのも、そこへ一本化した。 */}

      {/* 読み込み中と失敗は**表示形式より先**に判定する。以前この2つは
          map / calendar の下に置かれていたので、地図とカレンダーだけは
          取得に失敗しても「ピンが1本も無い地図」「予定の無いカレンダー」を
          描き、再試行の手段も出ないままだった(§8)。 */}
      {isError && captured.length === 0 ? (
        // 失敗を「まだ何も無い」と描くと、集めたものが消えたように見える。
        <LoadFailed onRetry={() => void refetch()} retrying={isFetching} what={t("err.whatDex")} />
      ) : isLoading && captured.length === 0 ? (
        // §8: show the shape of the content while it loads — never flash the
        // "empty" state before the first fetch resolves.
        <div className="grid grid-cols-3 gap-2.5" aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-2xl bg-secondary" />
          ))}
        </div>
      ) : view === "map" ? (
        // 地図もカテゴリー(と検索)の絞り込みに従う。ギャラリーだけ絞られて
        // 地図には全部出ていると、同じ「図鑑」なのに見えるものが食い違う。
        <DexMap stickers={filtered} onOpen={setOpenId} />
      ) : view === "calendar" ? (
        <DexCalendar stickers={filtered} onOpen={setOpenId} />
      ) : captured.length === 0 ? (
        <DexEmptyState
          otherLanguages={stickers?.otherLanguages ?? 0}
          targetLanguage={stickers?.targetLanguage}
        />
      ) : filtered.length === 0 ? (
        <DexNoMatch search={search} onClear={() => setSearch("")} />
      ) : DEX_SHELF_ENABLED && view === "shelf" ? (
        <DexShelf
          stickers={filtered}
          activeCategory={activeCategory}
          onOpen={setOpenId}
          justCaught={justCaught}
          userShelves={shelves}
        />
      ) : (
        groups.map(([key, items]) => (
          <section key={key} className="mb-6">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-body font-semibold tracking-tight">
                {/* カテゴリーは既知なら翻訳、未知のキーはそのまま見せる
                  (訳が無いより分かる)。 */}
                {categoryEmoji(key)} {t(categoryLabelKey(key))}
              </h3>
              <span className="text-footnote text-muted-foreground">{items.length}</span>
            </div>

            {view === "gallery" && layout !== "album" ? (
              // 見た目パックが選ばれているときだけ、別の並べ方で描く。
              // 中身(実際に撮った写真)は同じで、見せ方だけが変わる。
              <PackGallery
                items={items}
                justCaught={justCaught}
                onOpen={setOpenId}
                layout={layout}
              />
            ) : view === "gallery" ? (
              // 試作品(Capture&Converse)のアルバム: 写真がタイルいっぱいに
              // 表示される3列グリッド+下端のグラデーションに単語名。
              <DexAlbumGrid items={items} justCaught={justCaught} onOpen={setOpenId} />
            ) : (
              <ul className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
                {items.map((s, i) => (
                  <li
                    key={s.id}
                    className={`flex items-center gap-1 pr-2 transition-colors hover:bg-accent/40 ${i > 0 ? "border-t border-border" : ""}`}
                  >
                    <button
                      onClick={() => setOpenId(s.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left active:bg-accent/50"
                    >
                      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary">
                        {/* 撮った写真 → 切り抜き → ネット画像 の順に、そのまま見せる */}
                        {(s.object_thumb_url ?? s.object_url) ? (
                          <CachedImg
                            src={(s.object_thumb_url ?? s.object_url)!}
                            alt={t("common.photoOf", { word: s.word.headword })}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : s.cutout_url ? (
                          <CachedImg
                            src={s.cutout_thumb_url ?? s.cutout_url}
                            alt={t("common.stickerOf", { word: s.word.headword })}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-contain p-1"
                          />
                        ) : s.placeholder_url ? (
                          <CachedImg
                            src={s.placeholder_url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span
                            lang="zh-Hant"
                            className="px-1 text-center text-caption font-semibold text-muted-foreground"
                          >
                            {s.word.headword}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span lang="zh-Hant" className="text-body font-semibold">
                            {s.word.headword}
                          </span>
                          {s.word.reading_zhuyin && (
                            <span
                              lang="zh-Hant"
                              className="truncate text-footnote text-muted-foreground"
                            >
                              {s.word.reading_zhuyin}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-body text-muted-foreground">
                          {s.word.meaning_ja}
                        </div>
                      </div>
                    </button>
                    {/* 発音ボタンは右側に (縦並びリスト) */}
                    <PronounceButton
                      text={s.word.headword}
                      language={s.word.language ?? undefined}
                      tone="hero"
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
      <StickerSheet stickerId={openId} onClose={() => setOpenId(null)} />
      <style>{`
        /* 上から落ちてきて空欄にドンと着地する。以前は拡大が縮むだけで、
           「突然そこに現れた」ようにしか見えなかった(NORI指摘)。
           落下 → 着地の潰れ → 跳ね返り → 収まる、の順。 */
        @keyframes slamIn {
          0%   { transform: translateY(-115vh) scaleX(0.92) scaleY(1.12); opacity: 0; animation-timing-function: cubic-bezier(0.6, 0, 0.95, 0.4); }
          8%   { opacity: 1; animation-timing-function: cubic-bezier(0.6, 0, 0.95, 0.4); }
          52%  { transform: translateY(0) scaleX(1.16) scaleY(0.82); animation-timing-function: cubic-bezier(0.2, 0.9, 0.3, 1); }
          68%  { transform: translateY(-22%) scaleX(0.95) scaleY(1.07); }
          84%  { transform: translateY(0) scaleX(1.05) scaleY(0.96); }
          100% { transform: translateY(0) scale(1); }
        }
        .slam-in { animation: slamIn 880ms linear 120ms both; position: relative; z-index: 10; transform-origin: 50% 100%; }
        /* 着地の衝撃。セルの足元から輪が広がる。 */
        @keyframes slamShock {
          0%   { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
          52%  { transform: translate(-50%, -50%) scale(0.4); opacity: 0.85; }
          100% { transform: translate(-50%, -50%) scale(3.2); opacity: 0; }
        }
        .slam-shock { animation: slamShock 900ms cubic-bezier(0.15, 0.6, 0.3, 1) 120ms both; }
        @keyframes slamFlash {
          0%   { opacity: 0; }
          40%  { opacity: 1; }
          100% { opacity: 0; }
        }
        .slam-flash { background: radial-gradient(circle, rgba(253,230,138,0.75), rgba(253,230,138,0) 70%); animation: slamFlash 760ms ease-out 520ms both; }
        html[data-motion="reduce"] {
          .slam-in { animation: none; }
          .slam-shock { animation: none; }
          .slam-flash { animation: slamFlash 600ms ease-out both; } /* keep a gentle glow, drop the scale slam */
        }
      `}</style>
    </AppShell>
  );
}

/**
 * 図鑑に1枚も無いとき。**始めたばかりの人が最初に見る面**。
 *
 * ホームの空の面と同じ型(理由・次の一手・その場の導線)。ルートに
 * 直書きのままだと `ui-audit` から描けず、機械の目に一度も映らない。
 */
export function DexEmptyState({
  otherLanguages = 0,
  targetLanguage,
}: {
  /**
   * **ほかの学習言語に何枚あるか。** 0 より大きいなら、この人は
   * 「まだ何もキャッチしていない」のではなく**学習言語を切り替えた**。
   * そこに「まだ何もキャッチしていません」と出すのは嘘で、
   * 集めた物が消えたようにしか見えない。
   */
  otherLanguages?: number;
  targetLanguage?: string;
} = {}) {
  const t = useT();
  if (otherLanguages > 0) {
    const lang = t(TARGET_LANG_LABEL_KEYS[normalizeTargetLanguage(targetLanguage)]);
    return (
      <EmptyState
        icon={Library}
        title={t("dex.emptyOtherLangTitle", { lang })}
        hint={t("dex.emptyOtherLangHint", { n: formatCount(otherLanguages) })}
        action={
          <Link
            to="/settings"
            className="lift inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-body font-semibold text-primary-foreground"
          >
            {t("dex.emptyOtherLangCta")}
          </Link>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={Library}
      title={t("dex.emptyTitle")}
      hint={t("dex.emptyHint")}
      action={
        <Link
          to="/capture"
          className="lift inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-body font-semibold text-primary-foreground"
        >
          {t("dex.emptyCta")}
        </Link>
      }
    />
  );
}

/**
 * 検索に一致しないとき。**行き止まりにしない** — 検索欄の×は
 * 画面の上端にあり、絞り込んだ結果を見ている人の目線から遠い。
 * 「無かった」と言うなら、その場に戻り道を置く。
 */
export function DexNoMatch({ search, onClear }: { search: string; onClear: () => void }) {
  const t = useT();
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
      <p className="text-balance text-body text-muted-foreground">
        「{search}」{t("dex.noMatch")}
      </p>
      <button
        type="button"
        onClick={onClear}
        className="lift mt-4 inline-flex min-h-11 items-center rounded-full bg-secondary px-5 py-2.5 text-body font-semibold text-foreground"
      >
        {t("dex.clearSearch")}
      </button>
    </div>
  );
}

/**
 * Draw a map pin whose head is the sticker's own photo clipped in a circle
 * (roadmap B4: every pin shows what was caught there, not a generic marker).
 * Returns null when the image can't be drawn (CORS/load failure) so the
 * caller keeps the emoji fallback pin.
 */
async function photoPinIcon(url: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("pin image load failed"));
      img.src = url;
    });
    const W = 104,
      H = 120,
      cx = 52,
      cy = 46,
      R = 42; // 2x for retina
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    // tail
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy + R - 6);
    ctx.lineTo(cx, H - 4);
    ctx.lineTo(cx + 14, cy + R - 6);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fill();
    // white ring
    ctx.beginPath();
    ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    // photo clipped in circle (cover fit)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    const scale = Math.max((R * 2) / img.width, (R * 2) / img.height);
    const dw = img.width * scale,
      dh = img.height * scale;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.restore();
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

/**
 * 見た目パックが選ばれているときの図鑑の並べ方。
 *
 * **現行(album)ではこの関数は呼ばれない。** 上の分岐で既存のJSXを
 * そのまま通しているので、現行デザインは一切通らない経路になっている。
 *
 * 中身は実際に撮った写真のまま。見せ方(並べ方・枠・文字の置き方)だけを
 * pack-styles.css 側の .pk-* が塗り替える。
 */
/**
 * 写真のアルバム(3列)。**図鑑を開いた人がまず見るのはこれ。**
 *
 * 既定のパックは `origin` で、その `layout` は `album`。上の分岐は
 * `layout !== "album"` のときだけ `PackGallery` を使うので、**既定では
 * こちらが描かれる**。`export` は雛形の検査(`scripts/ui-harness`)から
 * 本物を描くため — ルートに直書きのままでは、この画面だけ一度も
 * 絵に映らない(実際、性能の道具も絵の検査も、無効にした棚の方を
 * 見ていた: `src/lib/features.ts` の `DEX_SHELF_ENABLED` は false)。
 */
export function DexAlbumGrid({
  items,
  justCaught,
  onOpen,
  memory,
}: {
  items: StickerWithWord[];
  justCaught?: string;
  onOpen: (id: string) => void;
  /**
   * 札の id → 記憶の印。渡さなければ復習と同じ問い合わせから読む
   * （`useMemoryBadges`）。雛形は通信できないので、こちらで渡す。
   */
  memory?: Map<string, MemoryBadgeInfo>;
}) {
  const t = useT();
  const fetched = useMemoryBadges();
  const memoryById = memory ?? fetched;
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {items.map((s) => {
        const photo = s.object_thumb_url ?? s.object_url;
        // 下端の帯を出すかの判定。絵が1枚も無いときだけ false。
        const hasImage = Boolean(photo || s.cutout_url || s.placeholder_url);
        const sharedFlightActive =
          typeof document !== "undefined" && Boolean(document.documentElement.dataset.rewardFlight);
        const slam = s.id === justCaught && !sharedFlightActive;
        return (
          <button
            key={s.id}
            onClick={() => onOpen(s.id)}
            className="group relative block text-left"
          >
            {/* 着地の衝撃。セルは overflow-hidden なので、輪はその外側に置く */}
            {slam && (
              <span className="slam-shock pointer-events-none absolute left-1/2 top-full z-0 block h-10 w-10 rounded-full ring-4 ring-amber-400/70" />
            )}
            <div
              id={`dex-cell-${s.id}`}
              className={`relative aspect-square overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-black/5 transition-transform group-active:scale-95 motion-reduce:transition-none motion-reduce:group-active:scale-100 ${slam ? "slam-in ring-2 ring-amber-400" : ""}`}
            >
              {photo ? (
                <CachedImg
                  src={photo}
                  alt={t("common.photoOf", { word: s.word.headword })}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : s.cutout_url ? (
                <CachedImg
                  src={s.cutout_thumb_url ?? s.cutout_url}
                  alt={t("common.stickerOf", { word: s.word.headword })}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-contain p-2"
                />
              ) : s.placeholder_url ? (
                // ネット画像も普通の絵として見せる(段ボール/ゴースト廃止)
                <CachedImg
                  src={s.placeholder_url}
                  alt={t("common.imageOf", { word: s.word.headword })}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                // 画像がまだ無いときは静かなプレースホルダ。
                // 詳細を開くとネット画像が自動で入る。
                // **`text-muted-foreground` をやめた。** 暗いテーマで
                // 字 #99a6b8 / 地 #4e5865 = 2.92:1 しか無く、この文字は
                // 札の中で**唯一その語を名指しているもの**なので、薄いと
                // 何の札か分からない。
                <div className="grid h-full place-items-center bg-gradient-to-br from-secondary to-secondary/50 px-2 text-center">
                  <span lang="zh-Hant" className="text-body font-semibold text-foreground">
                    {s.word.headword}
                  </span>
                </div>
              )}
              {/* **右上は記憶の印**（オーナー指示 2026-09-22「図鑑や復習の単語の
                  画像の右上にその単語の記憶の状態と記憶数値を書きたして」）。
                  再会の回数（×N）は下の名前の帯へ移した — 上の隅に2つ並べると、
                  幅の狭い札では印どうしが重なり、段の名前の頭が隠れた
                  （実測: 「忘れかけ」が「れかけ」になった）。 */}
              {memoryById.get(s.id) && (
                <MemoryBadge
                  info={memoryById.get(s.id)!}
                  className="absolute right-1 top-1 max-w-[calc(100%-0.5rem)]"
                />
              )}
              {!hasImage && s.encounter_count > 0 && (
                <span className="absolute bottom-1.5 right-1.5 rounded-full bg-amber-400/95 px-1.5 py-0.5 text-caption font-bold text-amber-950 shadow">
                  ×{s.encounter_count}
                </span>
              )}
              {/* 下端の帯。**絵がある札だけ。** 絵が無い札は上のプレース
                  ホルダが既に語を大きく出しているので、ここにも出すと
                  **同じ語が1枚の札に2回**並ぶ(実際そうなっていた)。

                  ## 濃さを一定にした理由
                  前は `from-black/65 to-transparent` の**裾**に文字を置いて
                  いた。裾の濃さは文字の位置で決まるので、実測では白文字の
                  地が #949494 まで薄まり 3.03:1 しか無かった(基準 4.5)。
                  明るい写真ほど読めなくなる —
                  **いい写真を撮った人ほど名前が読めない**。

                  白文字で 4.5:1 を満たすには地が #767676 以下、黒なら
                  不透明度 0.535 以上。0.6 なら白い写真の上で #666666 =
                  5.7:1 で少し余裕が出る。ぼかしは文字の**上**にだけ置く。 */}
              {hasImage && (
                <div className="absolute inset-x-0 bottom-0">
                  <div className="h-5 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="flex items-center gap-1 bg-black/60 px-2 pb-1.5">
                    <div
                      lang="zh-Hant"
                      className="min-w-0 flex-1 truncate text-footnote font-semibold text-white"
                    >
                      {s.word.headword}
                    </div>
                    {s.encounter_count > 0 && (
                      <span className="shrink-0 rounded-full bg-amber-400/95 px-1.5 text-caption font-bold text-amber-950">
                        ×{s.encounter_count}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {slam && (
                <span className="pointer-events-none absolute inset-0 slam-flash rounded-2xl" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 写真の一覧(パック別の見え方)。**既定では描かれない** —
 * 既定のパック `origin` は `layout: "album"` なので、上の分岐は
 * `DexAlbumGrid` の方へ行く。ここが出るのは設定でパックを変えた人だけ。
 * `export` は雛形の検査から本物を描くため。
 */
export function PackGallery({
  items,
  justCaught,
  onOpen,
  layout,
}: {
  items: StickerWithWord[];
  justCaught?: string;
  onOpen: (id: string) => void;
  layout: LayoutId;
}) {
  const t = useT();
  return (
    <div className="pk-collection" data-layout={layout}>
      {items.map((s) => {
        // 小さく並ぶ所なので縮小版を先に使う。
        const photo = stickerPhotoUrl(s, { prefer: s.hero_role, thumb: true });
        return (
          <button
            key={s.id}
            id={`dex-cell-${s.id}`}
            onClick={() => onOpen(s.id)}
            className={`pk-tile text-left ${s.id === justCaught ? "ring-2 ring-amber-400" : ""}`}
          >
            <span className="pk-tile-media">
              {photo ? (
                <CachedImg
                  src={photo}
                  alt={t("common.photoOf", { word: s.word.headword })}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                // 写真がまだ無いときは単語そのものを見せる(段ボール絵は使わない)。
                <span lang="zh-Hant" className="pk-tile-emoji">
                  {s.word.headword.slice(0, 2)}
                </span>
              )}
              {s.encounter_count > 0 && <span className="pk-tile-badge">×{s.encounter_count}</span>}
            </span>
            <span className="pk-tile-body">
              <span lang="zh-Hant" className="pk-tile-word">
                {s.word.headword}
              </span>
              <span className="pk-tile-sub">
                {s.word.meaning_ja || <Zh>{s.word.reading_zhuyin}</Zh>}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DexMap({
  stickers,
  onOpen,
}: {
  stickers: StickerWithWord[];
  onOpen: (id: string) => void;
}) {
  // 撮った日の絞り込みは**この中に持たない**(オーナー指摘 2026-08-21)。
  // 前はここだけが日付の列を持っていて、一覧・棚・カレンダーには手段が
  // 無く、地図を離れると選んだ日が黙って消えた。いまは上の
  // 「あなたの図鑑」の欄で絞られた物が `stickers` として降りてくる。
  const shown = stickers;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const mapRef = useRef<HTMLDivElement>(null);
  // renderMarkers はマウント時のクロージャを使い回すので、最新の onOpen を
  // ref 経由で参照する(古い関数を掴んだままにしない)。
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const t = useT();
  const [mapFailed, setMapFailed] = useState(false);
  /** 「もう一度」で読み込みからやり直すための番号。 */
  const [mapAttempt, setMapAttempt] = useState(0);
  const mapInstance = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);
  const pinIconCache = useRef<Map<string, string | null>>(new Map());
  // Lovable-free first: prefer a plain VITE_ key, fall back to Lovable's
  // connector-injected name so it keeps working during the migration.
  const browserKey =
    import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ??
    import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel =
    import.meta.env.VITE_GOOGLE_MAPS_TRACKING_ID ??
    import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;

  useEffect(() => {
    if (!browserKey) return;
    if (window.google) {
      initMap();
      return;
    }
    window.initDexMap = initMap;
    const existing = document.querySelector("script[data-dex-map]");
    if (existing) return;
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${browserKey}&loading=async&callback=initDexMap${channel ? `&channel=${channel}` : ""}`;
    s.async = true;
    s.dataset.dexMap = "1";
    // **読み込めなかったことを画面に出す。**
    //
    // キーが無いときは「地図は使えません」と言う配慮があるのに、
    // キーはあるが読み込めない(圏外・ブロック・キー無効・課金停止)ときは
    // `initMap` が呼ばれず、**灰色の角丸だけが残っていた**。その下には
    // 日付チップと「位置情報あり N件」が普通に並ぶので、「ピンが1本も
    // 無い地図」に見える — 集めた場所の記録が無いように見える
    // (独立監査の指摘)。
    s.onerror = () => {
      s.remove(); // 消しておかないと `existing` で二度と再試行できない
      setMapFailed(true);
    };
    document.head.appendChild(s);

    function initMap() {
      if (!mapRef.current) return;
      const g = (window.google as { maps: { Map: new (el: HTMLElement, opts: object) => unknown } })
        .maps;
      mapInstance.current = new g.Map(mapRef.current, {
        center: { lat: 25.033, lng: 121.5654 },
        zoom: 12,
        disableDefaultUI: true,
        zoomControl: true,
      });
      renderMarkers();
      setMapFailed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapAttempt]);

  function renderMarkers() {
    if (!mapInstance.current || !window.google) return;
    const g = (
      window.google as {
        maps: {
          Marker: new (opts: object) => unknown;
          LatLngBounds: new () => { extend: (l: object) => void; isEmpty: () => boolean };
          Size: new (a: number, b: number) => unknown;
          Point: new (a: number, b: number) => unknown;
        };
      }
    ).maps;
    for (const m of markersRef.current) {
      (m as { setMap: (x: null) => void }).setMap(null);
    }
    markersRef.current = [];
    const bounds = new g.LatLngBounds();
    // 同じ場所で撮った写真はピンが完全に重なってタップできない。
    // 座標を約11m格子に丸めてグループ化し、2枚目以降を円形に散らす
    // (spiderfy)。散らす半径はズームに依らない実距離で決める。
    const groups = new Map<string, number>();
    const keyOf = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;
    // **絞り込み後の `shown` を回すこと。**
    //
    // ここだけ絞り込み前の `stickers` を見ていた。日付チップを押すと
    // 「位置情報あり N件」の数字も下の写真も減るのに、**地図のピンだけ
    // 全部出たまま**になる。押した結果が半分だけ反映される画面は、
    // どちらが本当なのか分からない。`shownRef` は用意してあったのに
    // どこからも読まれていなかった(独立監査の指摘)。
    for (const s of shownRef.current) {
      if (s.lat == null || s.lng == null) continue;
      const emoji = s.word.silhouette_emoji ?? "📍";
      const svg = `data:image/svg+xml;utf-8,${encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='52' height='60' viewBox='0 0 52 60'><path d='M26 2c11 0 20 8.8 20 20 0 14-20 36-20 36S6 36 6 22C6 10.8 15 2 26 2z' fill='white' stroke='#0ea5e9' stroke-width='2'/><text x='26' y='30' text-anchor='middle' font-size='22' dominant-baseline='middle'>${emoji}</text></svg>`,
      )}`;
      // このグループで何枚目か → 角度をずらして配置
      const gk = keyOf(s.lat, s.lng);
      const idx = groups.get(gk) ?? 0;
      groups.set(gk, idx + 1);
      let posLat = s.lat;
      let posLng = s.lng;
      if (idx > 0) {
        const ring = Math.ceil(idx / 8); // 8個ごとに外側の輪へ
        const slot = (idx - 1) % 8;
        const angle = (slot / 8) * Math.PI * 2 + ring * 0.4;
        const meters = 14 * ring; // 14m, 28m, …
        const dLat = (meters * Math.cos(angle)) / 111_320;
        const dLng =
          (meters * Math.sin(angle)) / (111_320 * Math.max(0.2, Math.cos((s.lat * Math.PI) / 180)));
        posLat += dLat;
        posLng += dLng;
      }
      const marker = new g.Marker({
        position: { lat: posLat, lng: posLng },
        map: mapInstance.current,
        title: s.word.headword,
        icon: { url: svg, scaledSize: new g.Size(40, 46), anchor: new g.Point(20, 44) },
      });
      // Swap in the photo pin as soon as it's drawn (emoji pin stays as fallback).
      // Thumbs first: a pin head is 52px, a 400px thumb is already 8x overkill.
      const photoUrl = stickerPhotoUrl(s, { thumb: true });
      if (photoUrl) {
        const cached = pinIconCache.current.get(s.id);
        const iconPromise = cached !== undefined ? Promise.resolve(cached) : photoPinIcon(photoUrl);
        void iconPromise.then((icon) => {
          pinIconCache.current.set(s.id, icon);
          if (!icon || !markersRef.current.includes(marker)) return;
          (marker as { setIcon: (i: object) => void }).setIcon({
            url: icon,
            scaledSize: new g.Size(52, 60),
            anchor: new g.Point(26, 58),
          });
        });
      }
      // マーカー(丸い写真)のタップで単語の詳細を開く。
      // 以前はルート遷移(/dex/$stickerId)にしていたが、地図の再マウントで
      // 画面が戻ってしまい「タップしても飛ばない」状態になっていた。
      // 同じ画面の上にシートを重ねる方式に変更して確実に開くようにする。
      (marker as { addListener: (ev: string, cb: () => void) => void }).addListener("click", () => {
        onOpenRef.current(s.id);
      });
      bounds.extend({ lat: posLat, lng: posLng });
      markersRef.current.push(marker);
    }
    if (!bounds.isEmpty()) {
      (mapInstance.current as { fitBounds: (b: object, p: number) => void }).fitBounds(bounds, 64);
    }
  }

  useEffect(() => {
    if (mapInstance.current) renderMarkers();
  }, [shown]);

  // Tapping a photo below pans+zooms the map to where it was caught.
  function focusOnMap(s: (typeof stickers)[number]) {
    if (s.lat == null || s.lng == null) return;
    const map = mapInstance.current as {
      panTo: (l: object) => void;
      setZoom: (z: number) => void;
    } | null;
    if (map) {
      map.panTo({ lat: s.lat, lng: s.lng });
      map.setZoom(17);
    }
    mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const withLoc = shown.filter((s) => s.lat != null && s.lng != null);
  const recent = withLoc.slice(0, 12);

  if (!browserKey) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-body text-muted-foreground">
        {t("dex.mapUnavailable")}
      </div>
    );
  }

  if (mapFailed) {
    // **`mapFailed` を戻すのは「もう一度」を押した側の役目。**
    // 番号を増やすだけにしていたら、地図の div は外れたままなので
    // `initMap` が `if (!mapRef.current) return;` で抜け、
    // `setMapFailed(false)` に永久に届かなかった —
    // 「もう一度」が二度と効かない再試行ボタンを作っていた。
    return (
      <LoadFailed
        what={t("err.whatMap")}
        onRetry={() => {
          setMapFailed(false);
          setMapAttempt((n) => n + 1);
        }}
      />
    );
  }

  return (
    <>
      <div
        ref={mapRef}
        className="h-[55vh] w-full overflow-hidden rounded-3xl border border-border bg-secondary shadow-sm"
      />

      <div className="mt-3 flex items-center justify-between text-footnote text-muted-foreground">
        <span>{t("dex.withLocation")}</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary-ink">
          {withLoc.length} {t("dex.items")}
        </span>
      </div>

      {recent.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-1 text-body font-semibold tracking-tight">{t("dex.placesTitle")}</h3>
          <p className="mb-2 text-caption text-muted-foreground">{t("dex.placesHint")}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {recent.map((s) => {
              const thumb = stickerPhotoUrl(s, { thumb: true });
              return (
                <button
                  key={s.id}
                  onClick={() => focusOnMap(s)}
                  className="press-in overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm"
                  aria-label={t("dex.seeOnMap", { word: s.word.headword })}
                >
                  <div className="aspect-square w-full overflow-hidden bg-secondary">
                    {thumb ? (
                      <CachedImg
                        src={thumb}
                        alt={t("common.photoOf", { word: s.word.headword })}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-title">
                        {s.word.silhouette_emoji ?? "📍"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <MapPin className="h-3 w-3 shrink-0 text-primary" />
                    <span lang="zh-Hant" className="truncate text-footnote font-medium">
                      {s.word.headword}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

/**
 * 「あなたの図鑑」の欄。見出し・数・表示の切替と、**絞り込みのボタン2つ**。
 *
 * オーナー指摘 2026-08-21:
 * > 「図鑑のカテゴリーや日付の選択は、**選択肢をすべて表示するのではなく、
 * >  ボタンを押したら選択肢が出てきて選べる**ようにして。またカテゴリーと
 * >  日付のボタンは**あなたの図鑑の欄に収めて**。」
 *
 * 前はカテゴリーの丸が持っている数だけ横に伸び(60語で十数個)、日付の列は
 * **地図の中にだけ**在った。集めた物を見る画面なのに、道具のほうが場所を
 * 取っていた。ボタン2つに畳んで、この欄の中へ入れる。
 *
 * **ルートから切り出してある**のは検査のため。ここは図鑑を開くたび必ず
 * 見る所なのに、ルートに直書きだと一度も写真に撮れない。
 */
export function DexHeader({
  found,
  caught,
  view,
  onView,
  filter,
  onFilter,
  categories,
  days,
}: {
  found: number;
  caught: number;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  filter: DexFilter;
  onFilter: (f: DexFilter) => void;
  categories: readonly FilterOption[];
  days: readonly FilterOption[];
}) {
  const t = useT();
  return (
    <section className="mb-3 rounded-2xl border border-border bg-card p-3">
      {/* 見出しと数は**1行を丸ごと使う**。表示の切替(丸5つ=228px)を
          同じ行の右に置いていたら、390px の画面で「あなたの図/鑑」と
          2行に割れていた。数の検査は割れを見ないので、絵で見つけた。 */}
      <div className="flex items-baseline justify-between gap-2">
        <div className="pl-1">
          {/* この画面の見出し。以前は h2 で、図鑑には h1 が1つも無かった。 */}
          <h1 className="text-body font-semibold tracking-tight">{t("dex.yours")}</h1>
        </div>
      </div>

      {/* **1行に収める**(オーナー指示 2026-09-13「図鑑のカテゴリーと日付も
          図鑑の種類のアイコンも含めて一列にして」)。折り返しをやめた代わりに、
          入りきらない分は横に流す — 縦に増えると、その分だけ札が減る。
          `overflow-x-auto` は画面のスワイプ移動から除かれる目印にもなる。 */}
      {/* 外側の余白と安全領域は main 側（Lovable）の直しを採る。 */}
      <div className="-ml-1 mt-2 flex w-[calc(100%+0.25rem)] flex-nowrap items-center gap-2 overflow-x-auto border-t border-border pb-1 pl-1 pr-[max(1.5rem,env(safe-area-inset-right))] pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* 中の隙間は 8px。**36px の丸に 44px の当たり判定を持たせるため。**
            4px のままだと隣の当たり判定と 2px ずつ重なり、端を押したときに
            隣のボタンが反応する(当たり判定は後ろの兄弟が勝つ)。
            36 + 8 = 44 でちょうど隣り合い、重ならない。 */}
        <div className="flex shrink-0 gap-2 rounded-full bg-secondary p-1">
          {[
            ...(DEX_SHELF_ENABLED ? [["shelf", Library, t("dex.shelf")] as const] : []),
            ["gallery", LayoutGrid, t("dex.gallery")] as const,
            ["list", List, t("dex.list")] as const,
            ["map", MapIcon, t("dex.map")] as const,
            ["calendar", CalendarDays, t("dex.calendar")] as const,
          ].map(([v, Icon, label]) => (
            <button
              key={v}
              onClick={() => onView(v)}
              aria-label={label}
              aria-pressed={view === v}
              // 見た目は 36px のまま、**指が当たる範囲だけ 44px** に広げる
              // (`-inset-1` = 上下左右 4px → 44px 四方)。絵の検査は
              // `getBoundingClientRect()` ではなく `elementFromPoint` で
              // 実際の当たり判定を見るので、これが正しいやり方
              // (`scripts/ui-audit.mjs` の注)。
              className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition before:absolute before:-inset-1 before:content-[''] ${
                view === v ? "bg-background text-foreground shadow" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
            </button>
          ))}
        </div>

        {/* 絞り込みは**この欄の中**に収める(オーナー指摘)。表示の切替と
            同じ行に並べ、入りきらない分は横に流す。 */}
        {(categories.length > 0 || days.length > 0) && (
          <>
            <FilterMenu
              name={t("dex.filterCategory")}
              value={filter.category}
              options={categories}
              allLabel={t("dex.allCategories")}
              labelOf={(k) => `${categoryEmoji(k)} ${t(categoryLabelKey(k))}`}
              onChange={(category) => onFilter({ ...filter, category })}
            />
            <FilterMenu
              name={t("dex.filterDay")}
              value={filter.day}
              options={days}
              allLabel={t("dex.allDays")}
              labelOf={(k) => k.slice(5).replace("-", "/")}
              onChange={(day) => onFilter({ ...filter, day })}
            />
            {/* 絞り込んでいるときだけ解除口を出す。**棚にだけ別の解除口**を
                持たせていたのも、ここへ一本化した。
                **字ではなく×だけ**にする — 文字で置くと2つのボタンと
                並びきらず、欄の中で4行目に折り返していた(絵で見つけた)。
                読み上げには `aria-label` で同じことを言う。 */}
            {isFiltering(filter) && (
              <button
                onClick={() => onFilter(NO_FILTER)}
                aria-label={t("dex.filterClearAll")}
                title={t("dex.filterClearAll")}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * カテゴリーの表示。定義は lib/category.ts の CATEGORY_META が唯一の正。
 * 以前はここに56キーの Set が別途あり、CATEGORY_KEYS(54)と食い違っていた
 * (place / object がここにだけ存在した)。DBに残っている古いキーは
 * asCategoryKey が「その他」に寄せる。
 */
function categoryLabelKey(key: string | null | undefined): string {
  return `cat.${asCategoryKey(key)}`;
}
