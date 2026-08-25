import { createFileRoute, Link } from "@tanstack/react-router";
import { resolvePrefer, usePhotoPref } from "@/lib/photo-pref";
import { stickerPhotoUrl } from "@/lib/sticker-photo";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { LoadFailed } from "@/components/LoadFailed";
import { WordCard } from "@/components/WordCard";
import { WordTreeView } from "@/components/WordTreeView";
import { ForgettingCurveChart } from "@/components/ForgettingCurveChart";
import { getSticker } from "@/lib/stickers.functions";
import { getEncounterEstimate, type EncounterEstimate } from "@/lib/encounter.functions";
import { getStickerMemoryHistory } from "@/lib/reviews.functions";
import { listStickerPhotos } from "@/lib/encounters.functions";
import { StickerPhotoHistory } from "@/components/StickerPhotoHistory";
import { useState } from "react";
import { ArrowLeft, MapPin, Brain, ChevronDown, Clock } from "lucide-react";
import { useAutoHero } from "@/hooks/use-auto-hero";
import { localeOf, useT } from "@/lib/i18n";
import { useUiLang } from "@/lib/i18n";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/dex/$stickerId")({
  head: ({ params }) => ({
    meta: [
      {
        title: tStatic("page.cardDetail", {
          id: String(params.stickerId)
            .replace(/[^a-zA-Z0-9-]/g, "")
            .slice(0, 8),
        }),
      },
      {
        name: "description",
        content:
          "あなたが街でキャッチした言葉のカード詳細。意味・例文・発音、撮影場所、記憶曲線をまとめて確認できます。",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StickerDetailPage,
});

function StickerDetailPage() {
  const t = useT();
  const dateLocale = localeOf(useUiLang());
  const { stickerId } = Route.useParams();
  const fetchSticker = useServerFn(getSticker);
  const fetchMemory = useServerFn(getStickerMemoryHistory);
  const fetchPhotos = useServerFn(listStickerPhotos);
  const {
    data: s,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["sticker", stickerId],
    queryFn: () => fetchSticker({ data: { id: stickerId } }),
  });
  const { data: mem } = useQuery({
    queryKey: ["memory", stickerId],
    queryFn: () => fetchMemory({ data: { sticker_id: stickerId } }),
  });
  // 同じものを撮り直した記録。**読めなくても詳細は開く** — 写真の一覧は
  // 付け足しであって、この画面の本体ではない。
  // 「今週出会う見込み」。**カードの中から勝手に走らせない** —
  // 全利用者を数える問い合わせなので、呼ぶ側が1回だけ取って渡す。
  // 読めなくてもカードは開く(節が1つ出ないだけ)。
  const fetchEncounter = useServerFn(getEncounterEstimate);
  const { data: encounter } = useQuery({
    queryKey: ["encounter", s?.word_id ?? null],
    queryFn: () => fetchEncounter({ data: { word_id: s!.word_id } }),
    enabled: !!s?.word_id,
    staleTime: 6 * 60 * 60 * 1000,
  });
  const { data: photoData } = useQuery({
    queryKey: ["sticker-photos", stickerId],
    queryFn: () => fetchPhotos({ data: { sticker_id: stickerId } }),
  });
  /**
   * 絵の無い札の見出しに、ネットの画像をあてがう(オーナー指摘 2026-08-21)。
   *
   * **札のシートと同じ物を呼ぶ。** これまではシートの中に直に書いてあり、
   * この画面には無かったので、図鑑から開いた文字キャッチの語は
   * いつまでも見出しが空(語の字だけ)のままだった。
   */
  useAutoHero(s);

  return (
    <AppShell title={t("card.title")}>
      <BackToDexLink />

      {isLoading ? (
        <div
          className="aspect-square animate-pulse rounded-3xl bg-secondary"
          role="status"
          aria-label={t("common.loading")}
        />
      ) : isError ? (
        // 通信の失敗を「見つかりません」と言ってはいけない。
        // ユーザーはそれを「消えた」と受け取り、**自分の記録が失われた**と
        // 思ってしまう。やり直せば戻るものは、やり直せると言う(§8)。
        <LoadFailed
          onRetry={() => void refetch()}
          retrying={isFetching}
          what={t("err.whatWordCard")}
        />
      ) : !s ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-body text-muted-foreground">{t("card.notFound")}</p>
          <p className="mt-1 text-footnote text-muted-foreground">{t("card.notFoundHint")}</p>
          <Link
            to="/dex"
            className="lift mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-body font-semibold text-primary-foreground"
          >
            {t("card.backToDex")}
          </Link>
        </div>
      ) : (
        <StickerDetailBody
          sticker={s}
          memory={mem}
          photos={photoData?.photos}
          dateLocale={dateLocale}
          encounter={encounter ?? null}
        />
      )}
    </AppShell>
  );
}

/** 図鑑へ戻る。**取得の成否にかかわらず必ず出る** — 失敗した面から
    抜け出せなくなるのを防ぐため、枝の外に置いてある。 */
export function BackToDexLink() {
  const t = useT();
  return (
    <Link
      to="/dex"
      className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-body text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> {t("card.backToDex")}
    </Link>
  );
}

/**
 * 語の詳細の**既定の見え方そのもの**。
 *
 * ## なぜ切り出したか
 * 検査の場面は `WordCard` を裸で描いていた。だが実物ではそれは
 * `<details>`「すべて見る」の中で、**既定では閉じている**。
 * つまり独立監査3体は「一番長く見られる画面」として
 * **既定では見えない面**を採点し、私もそれを確かめずに繰り返した。
 *
 * 実物の既定の並びはこう:
 *   戻る → 写真(表裏) → 見出し語・意味・品詞 → 語の木 →
 *   出会った記録 → 「すべて見る」(閉じ) → 記憶の曲線 → 地図
 *
 * ルートが3つの問い合わせを持っているので、**描く所だけ**をここへ出す。
 * 引数はどれも「取れたら渡す」— 記憶も写真も地図も、無ければ出ないのが
 * 実物の振る舞いなので、そのまま任意にしてある。
 */
export function StickerDetailBody({
  sticker: s,
  memory,
  photos,
  dateLocale,
  encounter,
}: {
  sticker: NonNullable<Awaited<ReturnType<typeof getSticker>>>;
  memory?: Awaited<ReturnType<typeof getStickerMemoryHistory>>;
  photos?: Awaited<ReturnType<typeof listStickerPhotos>>["photos"];
  dateLocale: string;
  /** 「今週出会う見込み」。届いていなければ節そのものが出ない。 */
  encounter?: EncounterEstimate | null;
}) {
  const t = useT();
  const photoPref = usePhotoPref();
  const mem = memory;
  const photoData = photos ? { photos } : undefined;
  return (
    <>
      <StickerDetailHero sticker={s} dateLocale={dateLocale} />

      {/* §6 word tree: photo at the center, branches unlock per review */}
      <div className="mb-4">
        <WordTreeView
          headword={s.word.headword}
          photoUrl={stickerPhotoUrl(s, {
            prefer: s.hero_role ?? resolvePrefer(photoPref, "cutout"),
          })}
          emoji={s.word.silhouette_emoji}
          branchPlanRaw={s.branch_plan}
          extras={s.word.extras}
          reviewCount={s.review_count ?? 0}
        />
      </div>

      {/* 同じものに何度も出会った記録。再会が無ければ何も出ない。 */}
      <StickerPhotoHistory photos={photoData?.photos ?? []} dateLocale={dateLocale} />

      {/* Full flat card kept for reference (B3) — collapsed by default */}
      <details className="group rounded-3xl border border-border bg-card shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-body font-semibold [&::-webkit-details-marker]:hidden">
          {t("card.seeAll")}
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-2 pb-2">
          <WordCard
            word={{
              headword: s.word.headword,
              reading_zhuyin: s.word.reading_zhuyin,
              pinyin: s.word.pinyin,
              meaning_ja: s.word.meaning_ja,
              part_of_speech: s.word.part_of_speech,
              level: s.word.level,
              example_sentence: s.word.example_sentence,
              example_translation: s.word.example_translation,
              extras: s.word.extras,
            }}
            encounter={encounter ?? null}
          />
        </div>
      </details>

      <section className="mt-5 rounded-3xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <h2 className="text-body font-semibold">{t("card.memoryCurve")}</h2>
          </div>
          {mem?.current?.due_at && (
            <div className="flex items-center gap-1 text-caption text-muted-foreground">
              <Clock className="h-3 w-3" />
              {t("card.nextDue", {
                date: new Date(mem.current.due_at).toLocaleDateString(dateLocale),
              })}
            </div>
          )}
        </div>
        <ForgettingCurveChart
          history={mem?.history ?? []}
          currentEase={mem?.current?.ease ?? 2.5}
          currentIntervalDays={mem?.current?.interval_days ?? 1}
          lastReviewedAt={mem?.current?.last_reviewed_at ?? null}
        />
      </section>

      {s.lat != null && s.lng != null && (
        <section className="mt-5 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <a
            href={`https://www.google.com/maps?q=${s.lat},${s.lng}`}
            target="_blank"
            rel="noreferrer"
            className="block"
          >
            <iframe
              title={t("common.mapTitle")}
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${s.lng - 0.005}%2C${s.lat - 0.003}%2C${s.lng + 0.005}%2C${s.lat + 0.003}&layer=mapnik&marker=${s.lat}%2C${s.lng}`}
              // 押せない飾りなので**タブ順から外す**。既定では iframe に
              // 焦点が入るが、中身は `pointer-events-none` で触れないうえ
              // 焦点の輪も出ないので、鍵盤で辿ると「どこに居るか分からない
              // 止まり木」が1つできていた。押す先は外側の `<a>`。
              tabIndex={-1}
              className="pointer-events-none h-48 w-full"
              loading="lazy"
            />
            <div className="flex items-center justify-between p-3 text-footnote text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {s.location_name ?? t("common.shotHere")}
              </span>
              {/* 地の上の主色の**文字**は `text-primary-ink`。塗りの色を
                      そのまま文字にすると 3.69:1 まで落ちる(実測)。 */}
              <span className="text-primary-ink">{t("card.openGoogleMaps")}</span>
            </div>
          </a>
        </section>
      )}
    </>
  );
}

/**
 * 語の詳細の上半分 — 写真(表裏)・いつどこで・見出し語と意味。
 *
 * ## なぜ切り出したか
 * この画面は**一度も機械の目に映っていなかった**。検査の場面は
 * `WordCard` を裸で描いていたが、実物ではそれは `<details>`
 * 「すべて見る」の中で、既定では閉じている。つまり独立監査3体は
 * **既定では見えない面**を「一番長く見られる画面」として採点していた。
 *
 * ルートが問い合わせを持っているので、描く所だけをここへ出す。
 * (復習・ホーム・設定で同じことを何度もやっている。)
 */
export function StickerDetailHero({
  sticker: s,
  dateLocale,
}: {
  sticker: NonNullable<Awaited<ReturnType<typeof getSticker>>>;
  dateLocale: string;
}) {
  const t = useT();
  const [flipped, setFlipped] = useState(false);
  return (
    <>
      {/* Hero image: expands with a soft pop-in. Tap to flip to selfie. */}
      <div
        className="perspective-[1200px] mb-4"
        role="button"
        tabIndex={0}
        aria-label={flipped ? t("card.flipBack") : t("card.flipSelfie")}
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setFlipped((f) => !f);
          }
        }}
      >
        <div
          className={`card-flip relative aspect-square w-full overflow-hidden rounded-3xl shadow-xl cursor-pointer ${flipped ? "flipped" : ""}`}
        >
          <div className="card-face absolute inset-0 grid place-items-center bg-secondary overflow-hidden">
            {s.object_url ? (
              <img
                src={s.object_url}
                alt={t("common.photoOf", { word: s.word.headword })}
                className="hero-pop h-full w-full object-cover"
              />
            ) : s.cutout_url ? (
              <img
                src={s.cutout_url}
                alt={s.word.headword}
                className="hero-pop max-h-[92%] max-w-[92%] object-contain"
              />
            ) : s.placeholder_url ? (
              // ネット画像。仮扱いせず普通の絵として見せる(#67)。
              <>
                <img
                  src={s.placeholder_url}
                  alt={t("common.imageOf", { word: s.word.headword })}
                  className="hero-pop absolute inset-0 h-full w-full object-cover"
                />
                {s.placeholder_credit?.name && (
                  <a
                    href={s.placeholder_credit.link}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="absolute bottom-2 left-3 text-caption text-white/90 drop-shadow"
                  >
                    📷 {s.placeholder_credit.name}
                  </a>
                )}
              </>
            ) : (
              <span
                lang="zh-Hant"
                className="px-4 text-center text-hero font-semibold text-muted-foreground"
              >
                {s.word.headword}
              </span>
            )}
            {s.selfie_url && (
              <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-1 text-caption text-white backdrop-blur">
                {t("card.tapForSelfie")}
              </span>
            )}
          </div>
          <div className="card-face card-back absolute inset-0 overflow-hidden bg-secondary">
            {s.selfie_url ? (
              <img
                src={s.selfie_url}
                alt={t("common.selfieOf")}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center text-body text-muted-foreground">
                {t("card.noSelfie")}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* When & Where — shown right under the photo, inside the word area */}
      <section className="mb-4 rounded-2xl border border-border bg-card p-3 text-body shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-footnote text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {new Date(s.created_at).toLocaleString(dateLocale, {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          {(s.location_name || (s.lat != null && s.lng != null)) && (
            <a
              href={
                s.lat != null && s.lng != null
                  ? `https://www.google.com/maps?q=${s.lat},${s.lng}`
                  : `https://www.google.com/maps?q=${encodeURIComponent(s.location_name ?? "")}`
              }
              target="_blank"
              rel="noreferrer"
              className="lift relative inline-flex min-h-11 items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-footnote font-medium text-primary-ink"
            >
              <MapPin className="h-3.5 w-3.5" />
              {s.location_name ?? t("card.openMap")}
            </a>
          )}
        </div>
        {s.caption && <p className="mt-2 text-body">「{s.caption}」</p>}
      </section>

      {/* Core word info — always visible (§6: 単語+発音+意味+写真) */}
      <section className="mb-4 rounded-3xl border border-border bg-card p-4 text-center shadow-sm">
        <div lang="zh-Hant" className="text-hero font-bold tracking-tight">
          {s.word.headword}
        </div>
        <div lang="zh-Hant" className="mt-1 text-body text-muted-foreground">
          {s.word.reading_zhuyin} {s.word.pinyin && `· ${s.word.pinyin}`}
        </div>
        <div className="mt-2 text-headline font-medium">{s.word.meaning_ja}</div>
        {s.word.part_of_speech && (
          <span className="mt-1 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-caption font-medium text-violet-900 ring-1 ring-violet-200 dark:bg-violet-500/20 dark:text-violet-200 dark:ring-violet-400/30">
            {s.word.part_of_speech}
          </span>
        )}
      </section>
    </>
  );
}
