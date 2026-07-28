import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Volume2, Eye, EyeOff, ChevronUp, ChevronDown, ExternalLink, Flag, RefreshCw, Loader2 } from "lucide-react";
import { usePronounce } from "@/lib/use-pronounce";
import { searchImageCandidates, type ImageCandidate } from "@/lib/images.functions";
import { reportEntry } from "@/lib/reports.functions";
import { regenerateCardSection, type RegenSection } from "@/lib/ai.functions";
import { posDisplay } from "@/lib/pos";
import { Reading } from "@/lib/phonetic";
import { useT } from "@/lib/i18n";
import { ChunkPills, ChunkLegend } from "@/components/ChunkPills";
import type { WordExtrasDTO } from "@/lib/extras";

// 後方互換の別名(以前この型はここで定義されていた)。
export type WordExtras = Partial<WordExtrasDTO>;

export type WordCardData = {
  headword: string;
  reading_zhuyin?: string | null;
  pinyin?: string | null;
  meaning_ja: string;
  part_of_speech?: string | null;
  level?: string | null;
  example_sentence?: string | null;
  example_translation?: string | null;
  extras?: WordExtras | null;
};

/**
 * 2026-07-25 再構成: 似た項目を統合して「ネイティブがどう使うか」を
 * 視覚(チャンク色分け)で見せる構成に。
 *   コロケーション+語順・型      → usage_chunks(使い方チャンク)
 *   類義語・反義語+類義語との違い → related_words(にてる言葉)
 *   使う場面+頻度・どこで使う    → usage_context(頻度・使う場面)
 *   勉強のコツ                    → pronunciation_tips(発音のコツ)
 *   雑学+語法ノート              → taiwan_note(台湾メモ)
 */
type SectionId =
  | "meaning"
  | "web_images"
  | "usage_context"
  | "example"
  | "examples_extra"
  | "usage_chunks"
  | "measure_words"
  | "related_words"
  | "pronunciation_tips"
  | "etymology"
  | "mnemonic"
  | "taiwan_note"
  | "real_usage";

/** ラベルは i18n(card.<id>)から引く — 一覧は順序と存在の定義だけを持つ。 */
const ALL_SECTIONS: { id: SectionId; label: string }[] = [
  { id: "meaning", label: "意味" },
  { id: "web_images", label: "ネットの画像" },
  { id: "usage_context", label: "頻度・使う場面" },
  { id: "example", label: "例文" },
  { id: "examples_extra", label: "追加の例文" },
  { id: "usage_chunks", label: "使い方チャンク" },
  { id: "measure_words", label: "量詞" },
  { id: "related_words", label: "にてる言葉・関連語" },
  { id: "pronunciation_tips", label: "発音のコツ" },
  { id: "etymology", label: "語源・部首" },
  { id: "mnemonic", label: "覚え方" },
  { id: "taiwan_note", label: "台湾メモ" },
  { id: "real_usage", label: "実際の使われ方" },
];

/** Pro のワンタッチ再生成に対応している項目(外部リンク系は対象外)。 */
const REGEN_SECTIONS: SectionId[] = [
  "meaning",
  "measure_words",
  "usage_context",
  "example",
  "examples_extra",
  "usage_chunks",
  "measure_words",
  "related_words",
  "pronunciation_tips",
  "etymology",
  "mnemonic",
  "taiwan_note",
];

const PREF_KEY = "wordcard-prefs-v4";
const PREF_EVENT = "wordcard-prefs-changed";

type Prefs = { order: SectionId[]; hidden: SectionId[] };

function loadPrefs(): Prefs {
  if (typeof window === "undefined") return { order: ALL_SECTIONS.map((s) => s.id), hidden: [] };
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Prefs;
      const valid = (id: SectionId) => ALL_SECTIONS.some((s) => s.id === id);
      const missing = ALL_SECTIONS.map((s) => s.id).filter((id) => !p.order.includes(id));
      return {
        order: [...p.order.filter(valid), ...missing],
        hidden: (p.hidden ?? []).filter(valid),
      };
    }
  } catch { /* noop */ }
  return { order: ALL_SECTIONS.map((s) => s.id), hidden: [] };
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
    window.dispatchEvent(new CustomEvent(PREF_EVENT));
  } catch { /* noop */ }
}

function usePrefsSync(setPrefs: (p: Prefs) => void) {
  useEffect(() => {
    const h = () => setPrefs(loadPrefs());
    window.addEventListener(PREF_EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(PREF_EVENT, h);
      window.removeEventListener("storage", h);
    };
  }, [setPrefs]);
}

export function WordCardSectionsEditor() {
  const t = useT();
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  usePrefsSync(setPrefs);
  const isVisible = (id: SectionId) => !prefs.hidden.includes(id);
  const toggle = (id: SectionId) => {
    const next = { ...prefs, hidden: prefs.hidden.includes(id) ? prefs.hidden.filter((x) => x !== id) : [...prefs.hidden, id] };
    setPrefs(next); savePrefs(next);
  };
  const move = (id: SectionId, dir: -1 | 1) => {
    const i = prefs.order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= prefs.order.length) return;
    const o = [...prefs.order];
    [o[i], o[j]] = [o[j], o[i]];
    const next = { ...prefs, order: o };
    setPrefs(next); savePrefs(next);
  };
  return (
    <ul className="space-y-1">
      {prefs.order.map((id, idx) => {
        const meta = ALL_SECTIONS.find((s) => s.id === id);
        if (!meta) return null;
        const visible = isVisible(id);
        return (
          <li key={id} className="flex items-center justify-between rounded-lg bg-secondary/60 px-2 py-1 text-xs">
            <span className={visible ? "" : "text-muted-foreground line-through"}>{t(`card.${meta.id}`)}</span>
            <span className="flex gap-1">
              <button className="lift-soft rounded-md p-1" onClick={() => move(id, -1)} disabled={idx === 0} aria-label="上へ">
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button className="lift-soft rounded-md p-1" onClick={() => move(id, 1)} disabled={idx === prefs.order.length - 1} aria-label="下へ">
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button className="lift-soft rounded-md p-1" onClick={() => toggle(id)} aria-label="表示切替">
                {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const SECTION_THEME: Record<SectionId, { bg: string; ring: string; chip: string; icon: string; title: string }> = {
  meaning:            { bg: "bg-sky-50",       ring: "ring-sky-200",     chip: "bg-sky-500",     icon: "📖", title: "text-sky-900" },
  web_images:         { bg: "bg-sky-50/70",    ring: "ring-sky-200",     chip: "bg-sky-600",     icon: "🌐", title: "text-sky-900" },
  usage_context:      { bg: "bg-cyan-50",      ring: "ring-cyan-200",    chip: "bg-cyan-600",    icon: "📊", title: "text-cyan-900" },
  example:            { bg: "bg-emerald-50",   ring: "ring-emerald-200", chip: "bg-emerald-500", icon: "💬", title: "text-emerald-900" },
  examples_extra:     { bg: "bg-emerald-50/60", ring: "ring-emerald-200", chip: "bg-emerald-400", icon: "➕", title: "text-emerald-900" },
  usage_chunks:       { bg: "bg-lime-50",      ring: "ring-lime-200",    chip: "bg-lime-600",    icon: "🧩", title: "text-lime-900" },
  measure_words:      { bg: "bg-violet-50",    ring: "ring-violet-200",  chip: "bg-violet-500",  icon: "🔢", title: "text-violet-900" },
  related_words:      { bg: "bg-indigo-50",    ring: "ring-indigo-200",  chip: "bg-indigo-500",  icon: "🪞", title: "text-indigo-900" },
  pronunciation_tips: { bg: "bg-pink-50",      ring: "ring-pink-200",    chip: "bg-pink-500",    icon: "🗣️", title: "text-pink-900" },
  etymology:          { bg: "bg-stone-50",     ring: "ring-stone-200",   chip: "bg-stone-600",   icon: "🏛️", title: "text-stone-900" },
  mnemonic:           { bg: "bg-fuchsia-50",   ring: "ring-fuchsia-200", chip: "bg-fuchsia-500", icon: "💡", title: "text-fuchsia-900" },
  taiwan_note:        { bg: "bg-teal-50",      ring: "ring-teal-200",    chip: "bg-teal-500",    icon: "🇹🇼", title: "text-teal-900" },
  real_usage:         { bg: "bg-rose-50/70",   ring: "ring-rose-200",    chip: "bg-rose-600",    icon: "🎬", title: "text-rose-900" },
};

export type WordCardHandle = { toggleEditing: () => void; isEditing: () => boolean };

export const WordCard = forwardRef<
  WordCardHandle,
  {
    word: WordCardData;
    autoplay?: boolean;
    /** 指定すると Pro の項目別ワンタッチ再生成が有効になる。 */
    wordId?: string;
    isPro?: boolean;
    /** ネット画像を「この画像にする」で選んだとき(カードの写真に採用)。 */
    onPickImage?: (url: string) => void | Promise<void>;
  }
>(function WordCard({ word, autoplay = true, wordId, isPro = false, onPickImage }, ref) {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  usePrefsSync(setPrefs);

  // Kept for API compatibility — the editor now lives outside the card.
  useImperativeHandle(ref, () => ({
    toggleEditing: () => {},
    isEditing: () => false,
  }), []);

  const ex = word.extras ?? {};
  const isVisible = (id: SectionId) => !prefs.hidden.includes(id);

  /**
   * 中身があるか。**表示するかどうかの判定には使わない** —
   * 項目は常に全部並べ、空のときは「未生成」の枠と生成ボタンを出す
   * (以前は空項目を丸ごと隠していたため「項目が消えた」ように見えていた)。
   */
  const hasContent = (id: SectionId): boolean => {
    switch (id) {
      case "meaning": return !!word.meaning_ja;
      case "usage_context":
        return !!(ex.usage_context || ex.register_note || ex.common_situation || ex.frequency_level);
      case "example": return !!word.example_sentence;
      case "examples_extra": return (ex.examples_extra?.length ?? 0) > 0;
      case "usage_chunks":
        return (ex.usage_chunks?.length ?? 0) > 0 || (ex.collocations?.length ?? 0) > 0 || !!ex.word_order;
      case "measure_words": return (ex.measure_words?.length ?? 0) > 0;
      case "related_words":
        return (
          (ex.related_words?.length ?? 0) > 0 ||
          (ex.synonyms?.length ?? 0) > 0 ||
          (ex.antonyms?.length ?? 0) > 0 ||
          !!ex.synonym_diff
        );
      case "pronunciation_tips": return !!(ex.pronunciation_tips || ex.study_tips);
      case "etymology": return !!ex.etymology || !!ex.radicals;
      case "mnemonic": return !!ex.mnemonic;
      case "taiwan_note": return !!(ex.taiwan_note || ex.trivia || ex.usage_note);
      // 外部データのセクションは常に描画できる(A10)。
      case "web_images": return true;
      case "real_usage": return true;
    }
  };

  return (
    <div className="space-y-3">
      <HeaderRow word={word} autoplay={autoplay} />
      <div className="grid gap-3">
        {prefs.order.filter(isVisible).map((id) => (
          <SectionCard
            key={id}
            id={id}
            word={word}
            wordId={wordId}
            isPro={isPro}
            empty={!hasContent(id)}
            onPickImage={onPickImage}
          />
        ))}
      </div>
    </div>
  );
});

function HeaderRow({ word, autoplay }: { word: WordCardData; autoplay: boolean }) {
  const autoplayedRef = useRef(false);
  const pronounce = usePronounce();

  // Accurate native Taiwan voice (server cmn-TW) with a device-voice fallback.
  function play() {
    void pronounce(word.headword);
  }

  useEffect(() => {
    if (!autoplay || autoplayedRef.current) return;
    autoplayedRef.current = true;
    const t = setTimeout(play, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.headword]);

  return (
    <div className="rounded-3xl border border-border bg-gradient-to-br from-white to-sky-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <h1 className="text-4xl font-bold tracking-tight">{word.headword}</h1>
            <button
              onClick={play}
              aria-label="発音を再生"
              className="lift inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30"
            >
              <Volume2 className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            <Reading zhuyin={word.reading_zhuyin} pinyin={word.pinyin} />
          </div>
          {(word.part_of_speech || word.level) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {word.part_of_speech && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-900 ring-1 ring-violet-200">
                  {posDisplay(word.part_of_speech)}
                </span>
              )}
              {word.level && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200">
                  {word.level}
                </span>
              )}
              <ReportButton headword={word.headword} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 辞書エラー報告(A8): 発音・意味・品詞の誤りをその場で通報。監査の
 * ランダム抜き打ちだけでは拾えない実利用者の指摘を集める恒久ルート。
 */
function ReportButton({ headword }: { headword: string }) {
  const t = useT();
  const reportFn = useServerFn(reportEntry);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const kinds: { kind: "pronunciation" | "meaning" | "pos" | "other"; label: string }[] = [
    { kind: "pronunciation", label: "発音・注音" },
    { kind: "meaning", label: "意味" },
    { kind: "pos", label: "品詞" },
    { kind: "other", label: "その他" },
  ];
  async function send(kind: "pronunciation" | "meaning" | "pos" | "other") {
    setOpen(false);
    try {
      await reportFn({ data: { headword, kind, note: "" } });
      setSent(true);
    } catch { /* 報告失敗は致命的でない */ }
  }
  if (sent) {
    return <span className="text-[11px] text-muted-foreground">{t("card.reportThanks")}</span>;
  }
  return (
    <span className="relative ml-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
        aria-label="この語の誤りを報告"
      >
        <Flag className="h-3 w-3" /> {t("card.report")}
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 w-40 rounded-xl border border-border bg-card p-1.5 shadow-xl">
          <p className="px-2 py-1 text-[10px] text-muted-foreground">{t("card.reportWhat")}</p>
          {kinds.map((k) => (
            <button
              key={k.kind}
              onClick={() => send(k.kind)}
              className="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-secondary"
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function SectionCard({
  id,
  word,
  wordId,
  isPro,
  empty,
  onPickImage,
}: {
  id: SectionId;
  word: WordCardData;
  wordId?: string;
  isPro?: boolean;
  /** 中身がまだ無い(AIが未生成)。枠は出し、生成ボタンを見せる。 */
  empty?: boolean;
  onPickImage?: (url: string) => void | Promise<void>;
}) {
  const theme = SECTION_THEME[id];
  const t = useT();
  const label = t(`card.${id}`);
  const ex = word.extras ?? {};
  const regenFn = useServerFn(regenerateCardSection);
  const qc = useQueryClient();
  const [regenerating, setRegenerating] = useState(false);
  const canRegen = !!wordId && !!isPro && REGEN_SECTIONS.includes(id);
  // 未生成の項目は誰でも1回は作れる(Proでなくても「作る」ボタンは出す)。
  const canGenerate = !!wordId && REGEN_SECTIONS.includes(id);

  // Pro: この項目だけをワンタッチで作り直す。
  async function regen() {
    if (!wordId || regenerating) return;
    setRegenerating(true);
    try {
      await regenFn({ data: { word_id: wordId!, section: id as RegenSection } });
      await qc.invalidateQueries({ queryKey: ["sticker"] });
      await qc.invalidateQueries({ queryKey: ["stickers"] });
    } catch (e) {
      console.warn("Section regen failed", e);
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <section className={`lift rounded-2xl ${theme.bg} ring-1 ${theme.ring} p-4 shadow-sm`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`grid h-6 w-6 place-items-center rounded-full ${theme.chip} text-xs text-white shadow`}>
          {theme.icon}
        </span>
        <h3 className={`text-xs font-semibold uppercase tracking-wider ${theme.title}`}>{label}</h3>
        {canRegen && (
          <button
            onClick={regen}
            disabled={regenerating}
            aria-label={`${label}: ${t("card.regen")}`}
            title={t("card.regen")}
            className="ml-auto grid h-8 w-8 place-items-center rounded-full text-muted-foreground/60 transition-colors hover:bg-white/60 hover:text-foreground disabled:opacity-60"
          >
            {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {empty ? (
        <EmptySection
          label={label}
          canGenerate={canGenerate}
          generating={regenerating}
          onGenerate={regen}
          t={t}
        />
      ) : (
        <Body id={id} word={word} ex={ex} t={t} onPickImage={onPickImage} />
      )}
    </section>
  );
}

/**
 * まだ生成されていない項目。空でも枠は必ず見せ、
 * 「何が入る場所なのか」と「作る手段」をその場に置く。
 */
function EmptySection({
  label,
  canGenerate,
  generating,
  onGenerate,
  t,
}: {
  label: string;
  canGenerate: boolean;
  generating: boolean;
  onGenerate: () => void;
  t: (k: string) => string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-black/10 bg-white/40 px-3 py-2.5">
      <span className="text-[11px] text-muted-foreground">{t("card.notYet")}</span>
      {canGenerate && (
        <button
          onClick={onGenerate}
          disabled={generating}
          aria-label={`${label}: ${t("card.generate")}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium shadow-sm ring-1 ring-black/5 active:scale-95 disabled:opacity-60"
        >
          {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {t("card.generate")}
        </button>
      )}
    </div>
  );
}

/** 頻度メーター(1〜5)。 */
function FrequencyMeter({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`頻度 ${level}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`h-2 w-3.5 rounded-sm ${i <= level ? "bg-cyan-500" : "bg-cyan-200/60"}`}
        />
      ))}
    </span>
  );
}

function Body({
  id,
  word,
  ex,
  t,
  onPickImage,
}: {
  id: SectionId;
  word: WordCardData;
  ex: WordExtras;
  t: (k: string) => string;
  onPickImage?: (url: string) => void | Promise<void>;
}) {
  switch (id) {
    case "meaning":
      return <p className="text-base font-medium text-foreground">{word.meaning_ja}</p>;

    case "usage_context": {
      // 統合表示: 頻度メーター+口語/書面タグ+どこで見て使うかの説明。
      const text = ex.usage_context || [ex.register_note, ex.common_situation].filter(Boolean).join(" ");
      return (
        <div className="space-y-2">
          {(ex.frequency_level || ex.register_tag) && (
            <div className="flex flex-wrap items-center gap-2">
              {ex.frequency_level != null && ex.frequency_level > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2 py-1 text-[11px] font-medium text-cyan-900 ring-1 ring-cyan-200">
                  {t("card.frequency")} <FrequencyMeter level={ex.frequency_level} />
                </span>
              )}
              {ex.register_tag && (
                <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-medium text-cyan-900 ring-1 ring-cyan-200">
                  {ex.register_tag}
                </span>
              )}
            </div>
          )}
          {text && <p className="text-sm leading-relaxed">{text}</p>}
        </div>
      );
    }

    case "example":
      // 品詞ごとの色分けは外し、元のプレーンな例文表示に戻す
      // (色分けは「使い方チャンク」だけに残す)。
      return (
        <div className="space-y-1">
          <p className="text-base">{word.example_sentence}</p>
          <p className="text-xs text-muted-foreground">{word.example_translation}</p>
        </div>
      );

    case "examples_extra":
      return (
        <ul className="space-y-2">
          {(ex.examples_extra ?? []).map((e, i) => (
            <li key={i} className="rounded-xl bg-white/60 p-2">
              {e.scene && (
                <p className="mb-1 text-[10px] font-medium text-emerald-800/80">🎬 {e.scene}</p>
              )}
              <p className="text-sm">{e.zh}</p>
              <p className="text-[11px] text-muted-foreground">{e.ja}</p>
            </li>
          ))}
        </ul>
      );

    case "usage_chunks": {
      // ネイティブがこの単語をどう組み合わせるか — 型をパーツ色分けで。
      const chunks = ex.usage_chunks ?? [];
      if (chunks.length > 0) {
        return (
          <div className="space-y-2">
            {chunks.map((c, i) => (
              <div key={i} className="rounded-xl bg-white/60 p-2.5">
                <ChunkPills parts={c.parts} size="sm" />
                {c.ja && <p className="mt-1 text-[11px] text-muted-foreground">{c.ja}</p>}
              </div>
            ))}
            <ChunkLegend />
          </div>
        );
      }
      // 旧データ: コロケーション+語順テキストのフォールバック。
      return (
        <div className="space-y-2">
          {(ex.collocations?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {ex.collocations!.map((c, i) => (
                <span key={i} className="rounded-full bg-white/70 px-2.5 py-1 text-[12px] font-medium shadow-sm ring-1 ring-black/5">
                  {c}
                </span>
              ))}
            </div>
          )}
          {ex.word_order && <p className="text-sm leading-relaxed">{ex.word_order}</p>}
        </div>
      );
    }

    case "measure_words":
      // 名詞の量詞。複数あるときは使い分けを添え、読み+発音ボタンをつける。
      return (
        <ul className="space-y-1.5">
          {(ex.measure_words ?? []).map((m, i) => (
            <li key={i} className="flex items-start gap-2 rounded-xl bg-white/60 px-3 py-2">
              <MeasureWordRow word={m.word} zhuyin={m.zhuyin} pinyin={m.pinyin} note={m.note} />
            </li>
          ))}
        </ul>
      );

    case "related_words": {
      const rel = ex.related_words ?? [];
      const groups: Array<{ kind: "syn" | "ant" | "rel"; label: string; tone: string }> = [
        { kind: "syn", label: t("card.synonym"), tone: "bg-white/70 text-foreground" },
        { kind: "ant", label: t("card.antonym"), tone: "bg-rose-100 text-rose-900" },
        { kind: "rel", label: t("card.relatedTag"), tone: "bg-indigo-100 text-indigo-900" },
      ];
      const legacySyn = (ex.synonyms ?? []).map((w) => ({ word: w, kind: "syn" as const, note: "" }));
      const legacyAnt = (ex.antonyms ?? []).map((w) => ({ word: w, kind: "ant" as const, note: "" }));
      const all = rel.length > 0 ? rel : [...legacySyn, ...legacyAnt];
      return (
        <div className="space-y-2.5 text-sm">
          {groups.map(({ kind, label, tone }) => {
            const items = all.filter((r) => r.kind === kind);
            if (items.length === 0) return null;
            return (
              <div key={kind}>
                <span className="mr-2 text-[11px] text-muted-foreground">{label}</span>
                <div className="mt-1 space-y-1">
                  {items.map((r, i) => (
                    <div key={i} className="flex flex-wrap items-baseline gap-x-2">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[13px] font-medium shadow-sm ring-1 ring-black/5 ${tone}`}>
                        {r.word}
                      </span>
                      {r.note && <span className="text-[11px] text-muted-foreground">{r.note}</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {ex.synonym_diff && rel.length === 0 && (
            <p className="rounded-xl bg-white/60 p-2 text-xs leading-relaxed">{ex.synonym_diff}</p>
          )}
        </div>
      );
    }

    case "pronunciation_tips":
      return <p className="text-sm leading-relaxed">{ex.pronunciation_tips || ex.study_tips}</p>;

    case "etymology":
      return (
        <div className="space-y-1 text-sm leading-relaxed">
          {ex.etymology && <p>{ex.etymology}</p>}
          {ex.radicals && <p className="text-xs text-muted-foreground">{t("card.radicals")}: {ex.radicals}</p>}
        </div>
      );

    case "mnemonic":
      return <p className="text-sm italic leading-relaxed">「{ex.mnemonic}」</p>;

    case "taiwan_note":
      return (
        <div className="space-y-1.5 text-sm leading-relaxed">
          {ex.taiwan_note ? (
            <p>{ex.taiwan_note}</p>
          ) : (
            <>
              {ex.trivia && <p>{ex.trivia}</p>}
              {ex.usage_note && <p className="text-xs text-muted-foreground">⚠️ {ex.usage_note}</p>}
            </>
          )}
        </div>
      );

    case "web_images":
      return (
        <WebImagesBody headword={word.headword} meaningJa={word.meaning_ja} onPickImage={onPickImage} />
      );
    case "real_usage":
      return <RealUsageBody headword={word.headword} />;
  }
}

/** 量詞1件: 「一張」+読み+発音ボタン+使い分けノート。 */
function MeasureWordRow({
  word,
  zhuyin,
  pinyin,
  note,
}: {
  word: string;
  zhuyin?: string;
  pinyin?: string;
  note?: string;
}) {
  const pronounce = usePronounce();
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[15px] font-semibold">{word}</span>
          <Reading zhuyin={zhuyin} pinyin={pinyin} className="text-[11px] text-muted-foreground" />
        </span>
        {note && <span className="mt-0.5 block text-[11px] text-muted-foreground">{note}</span>}
      </span>
      <button
        onClick={() => void pronounce(word)}
        aria-label={`「${word}」の発音`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/80 text-violet-700 shadow-sm ring-1 ring-black/5 active:scale-95"
      >
        <Volume2 className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

/**
 * ネットの画像(A10): その単語を最もよく表すWeb画像を**開いた瞬間に**表示する
 * (以前はStickerSheetの折りたたみで、タップしないと出なかった)。
 * 結果は24hキャッシュされるので実コストは初回検索のみ。
 */
function WebImagesBody({
  headword,
  meaningJa,
  onPickImage,
}: {
  headword: string;
  meaningJa: string;
  onPickImage?: (url: string) => void | Promise<void>;
}) {
  const t = useT();
  const searchFn = useServerFn(searchImageCandidates);
  // 「別の画像」を押すたびに検索し直す(seed をキーに入れてキャッシュを外す)。
  const [seed, setSeed] = useState(0);
  const [picking, setPicking] = useState<string | null>(null);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["web-images", headword, seed],
    queryFn: async () =>
      (await searchFn({ data: { query: seed === 0 ? meaningJa || headword : `${meaningJa || headword} ${headword}` } }))
        .candidates,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const all: ImageCandidate[] = data ?? [];
  // 再検索のたびに違う3枚を見せる(候補は最大6件返る)。
  const offset = seed % Math.max(1, Math.ceil(all.length / 3));
  const candidates = all.slice(offset * 3, offset * 3 + 3);
  const shown = candidates.length > 0 ? candidates : all.slice(0, 3);

  async function pick(url: string) {
    if (!onPickImage || picking) return;
    setPicking(url);
    try {
      await onPickImage(url);
    } finally {
      setPicking(null);
    }
  }

  return (
    <div>
      {isLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => <div key={i} className="aspect-square animate-pulse rounded-xl bg-white/60" />)}
        </div>
      ) : shown.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {shown.map((c, i) => (
            <figure key={`${c.url}-${i}`} className="relative aspect-square overflow-hidden rounded-xl bg-white/60">
              <img src={c.url} alt={`${headword} ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
              {onPickImage && (
                <button
                  onClick={() => void pick(c.url)}
                  disabled={picking !== null}
                  className="absolute inset-0 grid place-items-center bg-black/0 text-[10px] font-semibold text-white opacity-0 transition-opacity active:bg-black/45 active:opacity-100"
                  aria-label={t("card.useThisImage")}
                >
                  {picking === c.url ? <Loader2 className="h-4 w-4 animate-spin" /> : t("card.useThisImage")}
                </button>
              )}
              {c.credit?.name && (
                <figcaption className="pointer-events-none absolute bottom-0 inset-x-0 truncate bg-black/50 px-1 text-[8px] text-white">
                  📷 {c.credit.name}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("card.noImages")}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          onClick={() => setSeed((v) => v + 1)}
          disabled={isFetching}
          className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-medium shadow-sm ring-1 ring-black/5 active:scale-95 disabled:opacity-60"
        >
          {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {t("card.otherImages")}
        </button>
        <a
          href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(headword)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary underline"
        >
          {t("card.searchGoogle")} <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      {onPickImage && (
        <p className="mt-1 text-[10px] text-muted-foreground">{t("card.useThisImage")} — {t("card.changePhoto")}</p>
      )}
    </div>
  );
}

/**
 * 実際の使われ方(A10): 動画・SNS・辞書・ニュースの中で本当に使われている
 * 「生きた用例」へ直接ジャンプ。全部外部リンクなのでコストゼロ。
 */
function RealUsageBody({ headword }: { headword: string }) {
  const q = encodeURIComponent(headword);
  const links: { label: string; hint: string; href: string; emoji: string }[] = [
    { emoji: "🎬", label: "YouTubeで聞く", hint: "この単語が話されている動画", href: `https://www.youtube.com/results?search_query=${q}` },
    { emoji: "🗣️", label: "YouGlishで発音例", hint: "動画の中の実際の発音(台湾)", href: `https://youglish.com/pronounce/${q}/chinese/tw` },
    { emoji: "💬", label: "Dcardで見る", hint: "台湾の若者のSNSでの使われ方", href: `https://www.dcard.tw/search?query=${q}` },
    { emoji: "📰", label: "台湾ニュースで見る", hint: "新聞・報道での使われ方", href: `https://news.google.com/search?q=${q}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant` },
    { emoji: "📖", label: "教育部國語辭典簡編本", hint: "台湾教育部の公式辞書(定義・注音)", href: `https://dict.concised.moe.edu.tw/search.jsp?word=${q}` },
  ];
  return (
    <ul className="grid grid-cols-1 gap-1.5">
      {links.map((l) => (
        <li key={l.label}>
          <a
            href={l.href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2.5 rounded-xl bg-white/60 px-3 py-2 text-sm shadow-sm ring-1 ring-black/5 transition-colors active:bg-white"
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
  );
}
