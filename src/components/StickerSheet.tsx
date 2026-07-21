import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, MapPin, Clock, Loader2, Settings2, ChevronUp, Sparkles, Globe, Play, ExternalLink, RefreshCw, Flag } from "lucide-react";
import { toast } from "sonner";
import { WordCard, WordCardSectionsEditor } from "@/components/WordCard";
import { getSticker, updateWordExtras, reportWordIssue } from "@/lib/stickers.functions";
import { generateCard } from "@/lib/ai.functions";
import { searchImageCandidates, type ImageCandidate } from "@/lib/images.functions";
import { CachedImg } from "@/lib/image-cache";


type Props = {
  stickerId: string | null;
  onClose: () => void;
};

export function StickerSheet({ stickerId, onClose }: Props) {
  const fetchSticker = useServerFn(getSticker);
  const enrichWord = useServerFn(generateCard);
  const saveExtras = useServerFn(updateWordExtras);
  const reportFn = useServerFn(reportWordIssue);
  const [reporting, setReporting] = useState(false);
  const qc = useQueryClient();
  const { data: s, isLoading } = useQuery({
    queryKey: ["sticker", stickerId],
    queryFn: () => fetchSticker({ data: { id: stickerId! } }),
    enabled: !!stickerId,
    staleTime: 5 * 60 * 1000,
  });
  const [flipped, setFlipped] = useState(false);
  const [editing, setEditing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const enrichedRef = useRef<Set<string>>(new Set());

  // Auto-enrich word details (collocations, synonyms, etymology, examples, etc.)
  // the first time a word without extras is opened.
  useEffect(() => {
    if (!s) return;
    const ex = s.word.extras;
    const isEmpty =
      !ex ||
      (!ex.collocations.length && !ex.synonyms.length && !ex.antonyms.length &&
       !ex.etymology && !ex.mnemonic && !ex.trivia && !ex.common_situation &&
       !ex.usage_note && !ex.examples_extra.length);
    // Cards generated before 2026-07-13 lack the corpus-style fields
    // (頻度・類義語との違い・語順・勉強のコツ) — refresh those once too.
    const missingNewFields =
      !ex || (!ex.register_note && !ex.synonym_diff && !ex.word_order && !ex.study_tips);
    if (!isEmpty && !missingNewFields) return;
    if (enrichedRef.current.has(s.word_id)) return;
    enrichedRef.current.add(s.word_id);
    setEnriching(true);
    (async () => {
      try {
        const card = await enrichWord({ data: { headword: s.word.headword, targetLanguage: "zh-TW" } });
        await saveExtras({
          data: {
            word_id: s.word_id,
            extras: card.extras,
            patch: {
              reading_zhuyin: card.reading_zhuyin,
              pinyin: card.pinyin,
              part_of_speech: card.part_of_speech,
              level: card.level,
              example_sentence: card.example_sentence,
              example_translation: card.example_translation,
            },
          },
        });
        await qc.invalidateQueries({ queryKey: ["sticker", stickerId] });
        await qc.invalidateQueries({ queryKey: ["stickers"] });
      } catch (e) {
        console.warn("Enrichment failed", e);
        // Let a later reopen retry instead of leaving the word details blank
        // forever (words filed fast from the dictionary start with no extras).
        enrichedRef.current.delete(s.word_id);
      } finally {
        setEnriching(false);
      }
    })();
  }, [s, stickerId, enrichWord, saveExtras, qc]);

  // reset flip when sticker changes
  useEffect(() => {
    setFlipped(false);
    setEditing(false);
  }, [stickerId]);

  // lock body scroll while open
  useEffect(() => {
    if (!stickerId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [stickerId]);

  // ESC to close
  useEffect(() => {
    if (!stickerId) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [stickerId, onClose]);

  if (!stickerId) return null;

  const hasSelfie = !!s?.selfie_url;

  // 間違い報告: AIが単語を作り直し(自動修正)、報告も記録する(ユーザーFB)。
  async function reportIssue() {
    if (!s || reporting) return;
    setReporting(true);
    try {
      const card = await enrichWord({ data: { headword: s.word.headword, targetLanguage: "zh-TW" } });
      await saveExtras({
        data: {
          word_id: s.word_id,
          extras: card.extras,
          patch: {
            reading_zhuyin: card.reading_zhuyin,
            pinyin: card.pinyin,
            part_of_speech: card.part_of_speech,
            level: card.level,
            example_sentence: card.example_sentence,
            example_translation: card.example_translation,
          },
        },
      });
      await reportFn({ data: { word_id: s.word_id, headword: s.word.headword } });
      await qc.invalidateQueries({ queryKey: ["sticker", stickerId] });
      await qc.invalidateQueries({ queryKey: ["stickers"] });
      toast.success("報告ありがとう。AIが作り直しました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "報告に失敗しました");
    } finally {
      setReporting(false);
    }
  }

  return (
    <div className="material-in fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={s ? s.word.headword : "カード"}>
      {/* Close bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/80 px-3 py-2 backdrop-blur">
        <span className="pl-1 text-xs font-medium text-muted-foreground">
          {s ? s.word.headword : "..."}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing((v) => !v)}
            aria-label="表示項目を編集"
            className={`lift-soft inline-flex h-11 w-11 items-center justify-center rounded-full border border-border ${editing ? "bg-primary text-primary-foreground" : "bg-card"}`}
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="lift-soft inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Settings panel — slides down from top */}
      <div
        className={`fixed left-0 right-0 top-[52px] z-20 transition-all duration-300 [transition-timing-function:var(--ease-ios)] ${
          editing ? "translate-y-0 opacity-100" : "-translate-y-4 pointer-events-none opacity-0"
        }`}
      >
        <div className="mx-3 mt-2 rounded-2xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">表示する項目と順番</p>
            <button
              onClick={() => setEditing(false)}
              className="lift-soft inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary"
              aria-label="編集を閉じる"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>
          {s && <WordCardSectionsEditor />}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-3">
        {isLoading || !s ? (
          <div className="grid h-64 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Hero — expands with pop-in. Tap to flip selfie ↔ object */}
            <div
              className="perspective-1200 mb-4"
              role={hasSelfie ? "button" : undefined}
              tabIndex={hasSelfie ? 0 : undefined}
              aria-label={hasSelfie ? (flipped ? "写真の表に戻す" : "自撮りを見る") : undefined}
              onClick={() => hasSelfie && setFlipped((f) => !f)}
              onKeyDown={(e) => {
                if (hasSelfie && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  setFlipped((f) => !f);
                }
              }}
            >
              <div
                className={`card-flip relative aspect-[4/5] w-full ${hasSelfie ? "cursor-pointer" : ""} ${flipped ? "flipped" : ""}`}
              >
                {/* Front: original photo WITH background — fills the frame, no side gutters */}
                <div className="card-face absolute inset-0 overflow-hidden rounded-3xl shadow-xl">
                  {s.object_url ? (
                    <CachedImg
                      src={s.object_url}
                      alt={`「${s.word.headword}」の写真`}
                      className="hero-pop absolute inset-0 h-full w-full object-cover"
                    />
                  ) : s.cutout_url ? (
                    <CachedImg
                      src={s.cutout_url}
                      alt={s.word.headword}
                      className="hero-pop absolute inset-0 h-full w-full object-cover"
                    />
                  ) : s.placeholder_url ? (
                    // Ghost card (§5.3): the stand-in is clearly temporary.
                    <>
                      <img
                        src={s.placeholder_url}
                        alt={`「${s.word.headword}」の仮画像`}
                        className="absolute inset-0 h-full w-full object-cover opacity-70 grayscale"
                      />
                      <span className="absolute left-3 top-3 rounded-full bg-foreground/70 px-2.5 py-1 text-[11px] font-semibold text-background">
                        👻 仮の画像 — 実物に出会って完成させよう
                      </span>
                      {s.placeholder_credit?.name && (
                        <a
                          href={s.placeholder_credit.link}
                          target="_blank"
                          rel="noreferrer"
                          className="absolute bottom-2 left-3 text-[9px] text-white/90 drop-shadow"
                        >
                          📷 {s.placeholder_credit.name}
                        </a>
                      )}
                    </>
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-secondary text-7xl">
                      {s.word.silhouette_emoji ?? "📦"}
                    </div>
                  )}
                  {hasSelfie && (
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-1 text-[10px] text-white backdrop-blur">
                      タップで自撮りへ
                    </span>
                  )}
                </div>

                {/* Back: the selfie (you + the thing) */}
                <div className="card-face card-back absolute inset-0 overflow-hidden rounded-3xl bg-secondary shadow-xl">
                  {hasSelfie ? (
                    <>
                      <img src={s.selfie_url!} alt="撮影者の自撮り" className="absolute inset-0 h-full w-full object-cover" />
                      <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-1 text-[10px] text-white backdrop-blur">
                        タップで戻る
                      </span>
                    </>
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-muted-foreground">自撮りなし</div>
                  )}
                </div>
              </div>
            </div>

            {/* When & Where chip */}
            <section className="mb-4 rounded-2xl border border-border bg-card p-3 text-sm shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(s.created_at).toLocaleString("ja-JP", {
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
                    className="lift inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    {s.location_name ?? "地図で開く"}
                  </a>
                )}
              </div>
              {s.caption && <p className="mt-2 text-sm">「{s.caption}」</p>}
            </section>

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
            />

            {enriching && (
              <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/30 bg-primary/5 py-2 text-xs text-primary">
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                詳しい解説をAIが準備中…
              </div>
            )}

            <WebImagesSection headword={s.word.headword} meaningJa={s.word.meaning_ja} />
            <RealUsageSection headword={s.word.headword} />

            {/* 間違い報告: 意味・発音が変なときAIに作り直させ、報告も記録する */}
            <div className="mt-4 text-center">
              <button
                onClick={reportIssue}
                disabled={reporting}
                className="press-in inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground disabled:opacity-60"
              >
                {reporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flag className="h-3.5 w-3.5" />}
                {reporting ? "AIが作り直し中…" : "意味や発音が変？ 報告してAIに直させる"}
              </button>
            </div>

            {s.lat != null && s.lng != null && (
              <a
                href={`https://www.google.com/maps?q=${s.lat},${s.lng}`}
                target="_blank"
                rel="noreferrer"
                className="mt-5 block overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
              >
                <iframe
                  title="撮影場所のマップ"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${s.lng - 0.005}%2C${s.lat - 0.003}%2C${s.lng + 0.005}%2C${s.lat + 0.003}&layer=mapnik&marker=${s.lat}%2C${s.lng}`}
                  className="pointer-events-none h-48 w-full"
                  loading="lazy"
                />
                <div className="flex items-center justify-between p-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {s.location_name ?? "撮影地"}
                  </span>
                  <span className="text-primary">Google マップで開く →</span>
                </div>
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * ネットの画像: その単語を最もよく表す画像をWeb検索から表示(開いた時だけ
 * 取得=コストゼロのまま)。もっと見たい人はGoogle画像検索へ。
 */
function WebImagesSection({ headword, meaningJa }: { headword: string; meaningJa: string }) {
  const searchFn = useServerFn(searchImageCandidates);
  // 「別の画像」を押すたびに検索語を変えて新しい候補を取りに行く。
  const queries = [meaningJa || headword, headword, `${headword} ${meaningJa}`.trim()].filter(Boolean);
  const [round, setRound] = useState(0);
  const query = queries[round % queries.length] || headword;
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["web-images", headword, round],
    queryFn: async () => (await searchFn({ data: { query } })).candidates,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const candidates: ImageCandidate[] = data ?? [];
  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-sky-500 text-xs text-white shadow">
          <Globe className="h-3.5 w-3.5" />
        </span>
        画像
        <button
          onClick={() => setRound((r) => r + 1)}
          disabled={isFetching}
          className="press-in ml-auto inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /> 別の画像
        </button>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-secondary" />
          ))}
        </div>
      ) : candidates.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {candidates.slice(0, 6).map((c, i) => (
            <figure key={`${round}-${i}`} className="relative aspect-square overflow-hidden rounded-xl bg-secondary">
              <img src={c.url} alt={`「${headword}」のイメージ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
              {c.credit?.name && (
                <figcaption className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1 text-[8px] text-white">
                  📷 {c.credit.name}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">画像が見つかりませんでした。</p>
      )}
      <a
        href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(headword)}`}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline"
      >
        Google画像検索で「{headword}」を見る <ExternalLink className="h-3 w-3" />
      </a>
    </section>
  );
}

/**
 * 実際の使われ方: 動画・SNS・辞書・ニュースの中で本当に使われている
 * 「生きた用例」へ直接ジャンプ。全部外部リンクなのでコストゼロ。
 */
function RealUsageSection({ headword }: { headword: string }) {
  const q = encodeURIComponent(headword);
  const links: { label: string; hint: string; href: string; emoji: string }[] = [
    { emoji: "🎬", label: "YouTubeで聞く", hint: "この単語が話されている動画", href: `https://www.youtube.com/results?search_query=${q}` },
    { emoji: "🗣️", label: "YouGlishで発音例", hint: "動画の中の実際の発音(台湾)", href: `https://youglish.com/pronounce/${q}/chinese/tw` },
    { emoji: "💬", label: "Dcardで見る", hint: "台湾の若者のSNSでの使われ方", href: `https://www.dcard.tw/search?query=${q}` },
    { emoji: "📰", label: "台湾ニュースで見る", hint: "新聞・報道での使われ方", href: `https://news.google.com/search?q=${q}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant` },
    { emoji: "📖", label: "萌典(教育部辞書)", hint: "公式辞書の定義・注音", href: `https://www.moedict.tw/${q}` },
  ];
  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-rose-500 text-xs text-white shadow"><Play className="h-3.5 w-3.5" /></span>
        実際の使われ方
      </div>
      <ul className="grid grid-cols-1 gap-1.5">
        {links.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2.5 rounded-xl bg-secondary/50 px-3 py-2 text-sm transition-colors active:bg-secondary"
            >
              <span className="text-base">{l.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{l.label}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{l.hint}</span>
              </span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
