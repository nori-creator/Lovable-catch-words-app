import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { StickerSheet } from "@/components/StickerSheet";
import { listMyStickers, type StickerWithWord } from "@/lib/stickers.functions";
import { usePronounce } from "@/lib/use-pronounce";
import { CachedImg } from "@/lib/image-cache";
import { useMemo, useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import {
  Library,
  LayoutGrid,
  List,
  Map as MapIcon,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Volume2,
  MapPin,
  SlidersHorizontal,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import { useUiLayout, type LayoutId } from "@/lib/ui-pack";
import { Zh } from "@/components/Zh";
import { tStatic } from "@/lib/i18n";
import { asCategoryKey, categoryEmoji } from "@/lib/category";
import { DexShelf } from "@/components/DexShelf";
import { DexShelfOptions } from "@/components/DexShelfOptions";
import {
  STYLE_SPEC,
  clearLegacyShelfPrefs,
  getShelfStyle,
  setShelfStyle,
  type ShelfStyle,
} from "@/lib/shelf-prefs";
import { LoadFailed } from "@/components/LoadFailed";
import { Sound } from "@/lib/sound-engine";
import { haptic } from "@/lib/haptics";

/**
 * 落ちてきたモノが棚板に触れる瞬間(演出の開始から何ミリ秒か)。
 *
 * 下の `slamIn` が `880ms linear 120ms both`、その 52% が接地(潰れ)。
 * ここを直すときは**両方**直すこと — ずれると音だけ先に鳴る。
 */
const SLAM_IMPACT_MS = 120 + Math.round(880 * 0.52);

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
  // Memoize so the reference is stable across renders — otherwise `filtered`
  // and `groups` below recompute on every render (a new `[]`/array identity
  // invalidates their useMemo deps), re-filtering the whole gallery each time.
  const captured = useMemo(() => stickers?.items ?? [], [stickers]);
  /** 上限に達していて、この先が出せていない状態か。 */
  const truncated = stickers?.truncated ?? false;
  /** 本当の総数(サーバーが数えたもの)。取れなければ null。 */
  const totalCount = stickers?.total ?? null;

  const [view, setView] = useState<ViewMode>("shelf");

  // キャッチ演出v2の着弾。**キャッチ1回につき1度だけ**走らせる。
  //
  // 以前はここの依存配列に `view` が入っていた。この効果自身が
  // `setView("shelf")` を呼ぶので、演出中(1.6秒)にユーザーが一覧や地図へ
  // 切り替えると効果が再実行され、**棚へ引き戻して振動をもう一度鳴らす**。
  // 押したのに戻される画面は、壊れているのと区別がつかない。
  useEffect(() => {
    if (!justCaught) return;
    setView("shelf"); // 着弾は棚のスロットで見せる

    // 「ドン」は**モノが棚板に触れた瞬間**に鳴らす。以前は演出の開始と同時に
    // 振動していて、絵はまだ画面の上にあるのに手だけ先に着地していた。
    // 音と振動が絵とずれると、着地したという実感がまるごと消える。
    //
    // slamIn は `880ms linear 120ms` で、52% が接地(潰れ)。
    //   120 + 880 * 0.52 ≒ 578ms
    // 動きを減らす設定のときは落下自体が無いので、待たずに鳴らす。
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const impact = setTimeout(
      () => {
        Sound.shelfLand(); // 木の棚に載る「コッ」
        // 生の navigator.vibrate は**振動オフの設定を無視する**。
        haptic("heavy");
      },
      reduced ? 0 : SLAM_IMPACT_MS,
    );

    const t = setTimeout(() => {
      void navigate({ to: "/dex", search: {}, replace: true });
    }, 1600);
    return () => {
      clearTimeout(impact);
      clearTimeout(t);
    };
  }, [justCaught, navigate]);

  // 該当セルへスクロール。表示の切替が描かれた**後**に探す(同じ tick で
  // getElementById すると、一覧表示を保存していた人はまだ棚が無い)。
  // 図鑑の再取得が後から届くこともあるので件数も見る。
  useEffect(() => {
    if (!justCaught) return;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`dex-cell-${justCaught}`);
      el?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    });
    return () => cancelAnimationFrame(raf);
  }, [justCaught, captured.length]);

  // 見た目パックのレイアウト。"album" のときは既存の描画をそのまま通す。
  const layout = useUiLayout();
  /** null = すべて。カテゴリー名のボタンで絞り込む。 */
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // 棚の見え方。localStorage から読むので、初期値は既定のまま置いて
  // マウント後に差し替える(サーバー描画と食い違わせない)。
  const [style, setStyle] = useState<ShelfStyle>("shelf");
  const [shelfOptions, setShelfOptions] = useState(false);
  useEffect(() => {
    setStyle(getShelfStyle());
    clearLegacyShelfPrefs();
  }, []);
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("dex-view") : null;
    if (
      saved === "shelf" ||
      saved === "list" ||
      saved === "gallery" ||
      saved === "map" ||
      saved === "calendar"
    )
      setView(saved);
    const savedCat = typeof window !== "undefined" ? localStorage.getItem("dex-category") : null;
    if (savedCat) setActiveCategory(savedCat);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("dex-view", view);
    // 棚から離れたらシートも閉じる(開いたままにすると、後ろが棚でない
    // のに「後ろの棚がすぐ変わります」と言い続けることになる)。
    if (view !== "shelf") setShelfOptions(false);
  }, [view]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeCategory) localStorage.setItem("dex-category", activeCategory);
    else localStorage.removeItem("dex-category");
  }, [activeCategory]);

  /** ボタンに並べるカテゴリー: 持っている物だけを多い順に。 */
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of captured) {
      // 正規化してから数える。生のキーで数えると、DBに残る古いキー
      // (place / object)が「その他」と同じラベルの別チップになり、
      // 同じ名前のチップが2つ並んで押すたび違う結果が出ていた。
      const k = asCategoryKey(s.word.category_key);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [captured]);

  // 選んだカテゴリーが1件も無くなったら「すべて」に戻す(空画面で詰まらせない)。
  useEffect(() => {
    if (activeCategory && !categoryCounts.some(([k]) => k === activeCategory)) {
      setActiveCategory(null);
    }
  }, [activeCategory, categoryCounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byCategory = activeCategory
      ? captured.filter((s) => asCategoryKey(s.word.category_key) === activeCategory)
      : captured;
    if (!q) return byCategory;
    return byCategory.filter((s) => {
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
  }, [captured, search, activeCategory, t]);

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
      <section className="mb-3 flex items-center justify-between rounded-2xl border border-border bg-card p-3">
        <div className="pl-1">
          {/* この画面の見出し。以前は h2 で、図鑑には h1 が1つも無かった。 */}
          <h1 className="text-base font-semibold tracking-tight">{t("dex.yours")}</h1>
          {/* §5.3: found (incl. ghosts) vs captured (has a real photo) */}
          <p className="text-xs text-muted-foreground">
            {t("dex.found")}{" "}
            <span className="font-semibold text-foreground">{captured.length}</span>
            <span className="mx-1.5">·</span>
            {t("dex.caught")}{" "}
            <span className="font-semibold text-foreground">
              {
                captured.filter(
                  (s) => s.capture_type === "photo" || !!s.cutout_url || !!s.object_url,
                ).length
              }
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1">
          {/* 棚の見え方を変える入口。**棚を見ているときだけ**出す —
              地図やカレンダーを見ている人に「棚の素材」を出しても、
              押した結果がその場に無い。 */}
          {view === "shelf" && (
            <button
              onClick={() => setShelfOptions(true)}
              aria-label={t("shelf.optTitle")}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary"
            >
              <SlidersHorizontal className="h-[18px] w-[18px]" />
            </button>
          )}
          <div className="flex gap-1 rounded-full bg-secondary p-1">
            {(
              [
                ["shelf", Library, t("dex.shelf")],
                ["gallery", LayoutGrid, t("dex.gallery")],
                ["list", List, t("dex.list")],
                ["map", MapIcon, t("dex.map")],
                ["calendar", CalendarDays, t("dex.calendar")],
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-label={label}
                aria-pressed={view === v}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition ${
                  view === v ? "bg-background text-foreground shadow" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
              </button>
            ))}
          </div>
        </div>
      </section>

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
          className="mb-3 rounded-xl bg-secondary px-3 py-2 text-[11px] text-muted-foreground"
        >
          {t("dex.truncated", {
            n: String(captured.length),
            total: String(totalCount ?? captured.length),
          })}
        </p>
      )}

      {/* 棚表示で絞り込みが残っているときの**解除口**。
          チップ列を隠しただけにしたら、ギャラリーでカテゴリーを選んでから
          棚へ切り替えた人は、54棚のうち53棚が消えた状態から抜け出せなく
          なっていた(絞り込みは効いたままなのに、それを示すものも解く
          手段も画面に無い)。しかも表示もカテゴリーも保存されるので、
          次に開いてもその状態で始まる。 */}
      {view === "shelf" && activeCategory && (
        <button
          onClick={() => setActiveCategory(null)}
          aria-label={t("dex.clearFilter")}
          className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground"
        >
          {categoryEmoji(activeCategory)} {t(categoryLabelKey(activeCategory))}
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}

      {/* カテゴリーの絞り込みチップ。
          **棚を見ているときは出さない。** 棚そのものが部屋→棚の階層で
          同じ分類を持っているので、同じ絵文字・同じ件数のものが上下に
          2回並ぶ。しかも一方は平坦・一方は階層なので「どちらが図鑑の
          本体か」が決まらない(独立監査の指摘)。
          一覧・ギャラリー・地図・カレンダーには階層が無いので、そちらでは
          この行が絞り込みの手段として要る。 */}
      {captured.length > 0 && view !== "shelf" && (
        <div className="-mx-4 mb-3 overflow-x-auto px-4">
          <div className="flex w-max gap-1.5">
            <button
              onClick={() => setActiveCategory(null)}
              aria-pressed={activeCategory === null}
              className={`min-h-9 shrink-0 rounded-full px-3.5 text-xs font-medium transition ${
                activeCategory === null
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {t("dex.allCategories")} {captured.length}
            </button>
            {categoryCounts.map(([key, count]) => (
              <button
                key={key}
                onClick={() => setActiveCategory(key)}
                aria-pressed={activeCategory === key}
                className={`min-h-9 shrink-0 rounded-full px-3.5 text-xs font-medium transition ${
                  activeCategory === key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {categoryEmoji(key)} {t(categoryLabelKey(key))} {count}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 読み込み中と失敗は**表示形式より先**に判定する。以前この2つは
          map / calendar の下に置かれていたので、地図とカレンダーだけは
          取得に失敗しても「ピンが1本も無い地図」「予定の無いカレンダー」を
          描き、再試行の手段も出ないままだった(§8)。 */}
      {isError && captured.length === 0 ? (
        // 失敗を「まだ何も無い」と描くと、集めたものが消えたように見える。
        <LoadFailed onRetry={() => void refetch()} retrying={isFetching} />
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
        <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("dex.emptyTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("dex.emptyHint")}</p>
          <Link
            to="/capture"
            className="lift mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            {t("dex.emptyCta")}
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            「{search}」{t("dex.noMatch")}
          </p>
        </div>
      ) : view === "shelf" ? (
        <DexShelf
          stickers={filtered}
          activeCategory={activeCategory}
          onOpen={setOpenId}
          justCaught={justCaught}
          style={style}
        />
      ) : (
        groups.map(([key, items]) => (
          <section key={key} className="mb-6">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-base font-semibold tracking-tight">
                {/* カテゴリーは既知なら翻訳、未知のキーはそのまま見せる
                  (訳が無いより分かる)。 */}
                {categoryEmoji(key)} {t(categoryLabelKey(key))}
              </h3>
              <span className="text-xs text-muted-foreground">{items.length}</span>
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
              <div className="grid grid-cols-3 gap-2.5">
                {items.map((s) => {
                  const photo = s.object_thumb_url ?? s.object_url;
                  const slam = s.id === justCaught;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setOpenId(s.id)}
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
                          <div className="grid h-full place-items-center bg-gradient-to-br from-secondary to-secondary/50 px-2 text-center">
                            <span
                              lang="zh-Hant"
                              className="text-base font-semibold text-muted-foreground"
                            >
                              {s.word.headword}
                            </span>
                          </div>
                        )}
                        {s.encounter_count > 0 && (
                          <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-400/95 px-1.5 py-0.5 text-[11px] font-bold text-amber-950 shadow">
                            ×{s.encounter_count}
                          </span>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/65 to-transparent px-2 pb-1.5 pt-5">
                          <div
                            lang="zh-Hant"
                            className="truncate text-[12px] font-semibold text-white"
                          >
                            {s.word.headword}
                          </div>
                        </div>
                        {slam && (
                          <span className="pointer-events-none absolute inset-0 slam-flash rounded-2xl" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
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
                            className="px-1 text-center text-[11px] font-semibold text-muted-foreground"
                          >
                            {s.word.headword}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span lang="zh-Hant" className="text-base font-semibold">
                            {s.word.headword}
                          </span>
                          {s.word.reading_zhuyin && (
                            <span lang="zh-Hant" className="truncate text-xs text-muted-foreground">
                              {s.word.reading_zhuyin}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-sm text-muted-foreground">
                          {s.word.meaning_ja}
                        </div>
                      </div>
                    </button>
                    {/* 発音ボタンは右側に (縦並びリスト) */}
                    <PronounceButton text={s.word.headword} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
      <StickerSheet stickerId={openId} onClose={() => setOpenId(null)} />
      {/* 棚を見ていないときは開いたままにしない。「選ぶと後ろの棚が
          すぐ変わります」と書いてあるのに、後ろが地図やカレンダーでは
          その約束が嘘になる(表示を切り替えられるのは着弾の演出中など)。 */}
      {shelfOptions && view === "shelf" && (
        <DexShelfOptions
          style={style}
          onStyle={(v) => {
            setStyle(v);
            setShelfStyle(v);
          }}
          onClose={() => setShelfOptions(false)}
        />
      )}
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
        @media (prefers-reduced-motion: reduce) {
          .slam-in { animation: none; }
          .slam-shock { animation: none; }
          .slam-flash { animation: slamFlash 600ms ease-out both; } /* keep a gentle glow, drop the scale slam */
        }
      `}</style>
    </AppShell>
  );
}

/** Small pronunciation button — accurate server voice, device-voice fallback. */
function PronounceButton({ text }: { text: string }) {
  const t = useT();
  const pronounce = usePronounce();
  function play(e: ReactMouseEvent) {
    e.stopPropagation();
    void pronounce(text);
  }
  return (
    <button
      onClick={play}
      aria-label={t("dex.playPron", { word: text })}
      className="press-in grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
    >
      <Volume2 className="h-[18px] w-[18px]" />
    </button>
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
function PackGallery({
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
        const photo =
          s.object_thumb_url ??
          s.object_url ??
          s.cutout_thumb_url ??
          s.cutout_url ??
          s.placeholder_url;
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

/** ローカル日付キー(YYYY-MM-DD)。UTC変換で日付がずれないよう自前で組む。 */
function dayKeyOf(iso: string): string {
  const d = new Date(iso);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * カレンダー表示: その日に撮った写真が、その日のマスに入る。
 * 「いつ何を集めたか」が一目で分かる — 日記としての図鑑。
 */
function DexCalendar({
  stickers,
  onOpen,
}: {
  stickers: StickerWithWord[];
  onOpen: (id: string) => void;
}) {
  const t = useT();
  // 写真がある日だけをまとめる。
  const byDay = useMemo(() => {
    const m = new Map<string, typeof stickers>();
    for (const s of stickers) {
      const k = dayKeyOf(s.created_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return m;
  }, [stickers]);

  // 最初に開く月は「一番新しい写真の月」。空の今月を見せても意味がない。
  const newest = useMemo(() => {
    let best: string | null = null;
    for (const k of byDay.keys()) if (!best || k > best) best = k;
    return best;
  }, [byDay]);
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    const d = newest ? new Date(`${newest}T00:00:00`) : new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  useEffect(() => {
    if (!newest) return;
    const d = new Date(`${newest}T00:00:00`);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  }, [newest]);

  const first = new Date(cursor.y, cursor.m, 1);
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const leading = first.getDay(); // 0=日
  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const [openDay, setOpenDay] = useState<string | null>(null);
  const dayItems = openDay ? (byDay.get(openDay) ?? []) : [];

  const monthLabel = first.toLocaleDateString(undefined, { year: "numeric", month: "long" });

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() =>
            setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { ...c, m: c.m - 1 }))
          }
          aria-label={t("dex.prevMonth")}
          className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold">{monthLabel}</p>
        <button
          onClick={() =>
            setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { ...c, m: c.m + 1 }))
          }
          aria-label={t("dex.nextMonth")}
          className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day == null) return <div key={`x${i}`} />;
          const key = `${cursor.y}-${`${cursor.m + 1}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`;
          const items = byDay.get(key) ?? [];
          const thumb = items[0]
            ? (items[0].object_thumb_url ??
              items[0].object_url ??
              items[0].cutout_thumb_url ??
              items[0].cutout_url)
            : null;
          const has = items.length > 0;
          return (
            <button
              key={key}
              onClick={() => has && setOpenDay(openDay === key ? null : key)}
              disabled={!has}
              aria-pressed={openDay === key}
              aria-label={`${day}${t("dex.dayUnit")}${has ? ` — ${items.length}` : ""}`}
              className={`relative aspect-square overflow-hidden rounded-lg border text-left ${
                openDay === key ? "border-primary ring-2 ring-primary/40" : "border-border"
              } ${has ? "bg-secondary" : "bg-card opacity-50"}`}
            >
              {thumb && (
                <CachedImg
                  src={thumb}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              <span
                className={`absolute left-0.5 top-0.5 rounded px-1 text-[11px] font-semibold ${
                  thumb ? "bg-black/55 text-white" : "text-muted-foreground"
                }`}
              >
                {day}
              </span>
              {items.length > 1 && (
                <span className="absolute bottom-0.5 right-0.5 rounded-full bg-black/60 px-1 text-[11px] font-bold text-white">
                  {items.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {openDay && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold">{openDay}</p>
          <div className="grid grid-cols-3 gap-2.5">
            {dayItems.map((s) => {
              const photo = s.object_thumb_url ?? s.object_url ?? s.cutout_url;
              return (
                <button key={s.id} onClick={() => onOpen(s.id)} className="block text-left">
                  <div className="relative aspect-square overflow-hidden rounded-2xl bg-secondary shadow-md ring-1 ring-black/5">
                    {photo ? (
                      <CachedImg
                        src={photo}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center px-1 text-center">
                        <Zh className="text-sm font-semibold">{s.word.headword}</Zh>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-2 pb-1.5 pt-5">
                      <Zh className="block truncate text-[12px] font-semibold text-white">
                        {s.word.headword}
                      </Zh>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {byDay.size === 0 && (
        <p className="mt-6 text-center text-sm text-muted-foreground">{t("dex.calendarEmpty")}</p>
      )}
    </section>
  );
}

function DexMap({
  stickers,
  onOpen,
}: {
  stickers: StickerWithWord[];
  onOpen: (id: string) => void;
}) {
  // 撮った日で地図を絞る(NORI指定)。選べるのは**実際に写真がある日だけ**なので、
  // 押しても何も出ない日付は最初から並ばない。
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const availableDays = useMemo(() => {
    const set = new Set<string>();
    for (const s of stickers) if (s.lat != null && s.lng != null) set.add(dayKeyOf(s.created_at));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [stickers]);
  useEffect(() => {
    if (dayFilter && !availableDays.includes(dayFilter)) setDayFilter(null);
  }, [dayFilter, availableDays]);
  const shown = useMemo(
    () => (dayFilter ? stickers.filter((s) => dayKeyOf(s.created_at) === dayFilter) : stickers),
    [stickers, dayFilter],
  );
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
      const photoUrl = s.object_thumb_url ?? s.cutout_thumb_url ?? s.object_url ?? s.cutout_url;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
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

      {/* 撮った日で絞る。並ぶのは**写真がある日だけ**(新しい順)なので、
          押しても何も出ない日付は存在しない。 */}
      {availableDays.length > 1 && (
        <div className="-mx-4 mt-3 overflow-x-auto px-4">
          <div className="flex w-max gap-1.5">
            <button
              onClick={() => setDayFilter(null)}
              aria-pressed={dayFilter === null}
              className={`min-h-9 shrink-0 rounded-full px-3.5 text-xs font-medium transition ${
                dayFilter === null
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {t("dex.allDays")}
            </button>
            {availableDays.map((d) => (
              <button
                key={d}
                onClick={() => setDayFilter(d)}
                aria-pressed={dayFilter === d}
                className={`min-h-9 shrink-0 rounded-full px-3.5 text-xs font-medium transition ${
                  dayFilter === d
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {d.slice(5).replace("-", "/")}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("dex.withLocation")}</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
          {withLoc.length} {t("dex.items")}
        </span>
      </div>

      {recent.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-1 text-sm font-semibold tracking-tight">{t("dex.placesTitle")}</h3>
          <p className="mb-2 text-[11px] text-muted-foreground">{t("dex.placesHint")}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {recent.map((s) => {
              const thumb =
                s.object_thumb_url ?? s.cutout_thumb_url ?? s.object_url ?? s.cutout_url;
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
                      <span className="grid h-full w-full place-items-center text-2xl">
                        {s.word.silhouette_emoji ?? "📍"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <MapPin className="h-3 w-3 shrink-0 text-primary" />
                    <span lang="zh-Hant" className="truncate text-xs font-medium">
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
 * カテゴリーの表示。定義は lib/category.ts の CATEGORY_META が唯一の正。
 * 以前はここに56キーの Set が別途あり、CATEGORY_KEYS(54)と食い違っていた
 * (place / object がここにだけ存在した)。DBに残っている古いキーは
 * asCategoryKey が「その他」に寄せる。
 */
function categoryLabelKey(key: string | null | undefined): string {
  return `cat.${asCategoryKey(key)}`;
}
