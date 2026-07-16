import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Volume2, Loader2, Eye, EyeOff, ChevronUp, ChevronDown, ExternalLink, Flag } from "lucide-react";
import { synthesizeSpeech } from "@/lib/tts.functions";
import { searchImageCandidates, type ImageCandidate } from "@/lib/images.functions";
import { reportEntry } from "@/lib/reports.functions";
import { claimAudio, primeAudio, stopOtherAudio } from "@/lib/audio";

export type WordExtras = {
  collocations?: string[];
  synonyms?: string[];
  antonyms?: string[];
  etymology?: string;
  radicals?: string;
  mnemonic?: string;
  trivia?: string;
  common_situation?: string;
  usage_note?: string;
  register_note?: string;
  synonym_diff?: string;
  word_order?: string;
  study_tips?: string;
  examples_extra?: { zh: string; ja: string }[];
};

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

type SectionId =
  | "meaning"
  | "web_images"
  | "common_situation"
  | "register_note"
  | "example"
  | "examples_extra"
  | "collocations"
  | "word_order"
  | "synonyms"
  | "synonym_diff"
  | "etymology"
  | "mnemonic"
  | "study_tips"
  | "trivia"
  | "usage_note"
  | "real_usage";

const ALL_SECTIONS: { id: SectionId; label: string }[] = [
  { id: "meaning", label: "意味" },
  { id: "web_images", label: "ネットの画像" },
  { id: "common_situation", label: "使う場面" },
  { id: "register_note", label: "頻度・どこで使う" },
  { id: "example", label: "例文" },
  { id: "examples_extra", label: "追加の例文" },
  { id: "collocations", label: "コロケーション" },
  { id: "word_order", label: "語順・型" },
  { id: "synonyms", label: "類義語・反義語" },
  { id: "synonym_diff", label: "類義語との違い" },
  { id: "etymology", label: "語源・部首" },
  { id: "mnemonic", label: "覚え方" },
  { id: "study_tips", label: "勉強のコツ" },
  { id: "trivia", label: "雑学" },
  { id: "usage_note", label: "語法ノート" },
  { id: "real_usage", label: "実際の使われ方" },
];

const PREF_KEY = "wordcard-prefs-v2";
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
            <span className={visible ? "" : "text-muted-foreground line-through"}>{meta.label}</span>
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
  meaning:          { bg: "bg-sky-50",     ring: "ring-sky-200",     chip: "bg-sky-500",     icon: "📖", title: "text-sky-900" },
  common_situation: { bg: "bg-amber-50",   ring: "ring-amber-200",   chip: "bg-amber-500",   icon: "🗣️", title: "text-amber-900" },
  register_note:    { bg: "bg-cyan-50",    ring: "ring-cyan-200",    chip: "bg-cyan-600",    icon: "📊", title: "text-cyan-900" },
  word_order:       { bg: "bg-lime-50",    ring: "ring-lime-200",    chip: "bg-lime-600",    icon: "🧩", title: "text-lime-900" },
  synonym_diff:     { bg: "bg-indigo-50/70", ring: "ring-indigo-200", chip: "bg-indigo-400", icon: "⚖️", title: "text-indigo-900" },
  study_tips:       { bg: "bg-pink-50",    ring: "ring-pink-200",    chip: "bg-pink-500",    icon: "🎯", title: "text-pink-900" },
  example:          { bg: "bg-emerald-50", ring: "ring-emerald-200", chip: "bg-emerald-500", icon: "💬", title: "text-emerald-900" },
  examples_extra:   { bg: "bg-emerald-50/60", ring: "ring-emerald-200", chip: "bg-emerald-400", icon: "➕", title: "text-emerald-900" },
  collocations:     { bg: "bg-rose-50",    ring: "ring-rose-200",    chip: "bg-rose-500",    icon: "🔗", title: "text-rose-900" },
  synonyms:         { bg: "bg-indigo-50",  ring: "ring-indigo-200",  chip: "bg-indigo-500",  icon: "🪞", title: "text-indigo-900" },
  etymology:        { bg: "bg-stone-50",   ring: "ring-stone-200",   chip: "bg-stone-600",   icon: "🏛️", title: "text-stone-900" },
  mnemonic:         { bg: "bg-fuchsia-50", ring: "ring-fuchsia-200", chip: "bg-fuchsia-500", icon: "💡", title: "text-fuchsia-900" },
  trivia:           { bg: "bg-teal-50",    ring: "ring-teal-200",    chip: "bg-teal-500",    icon: "✨", title: "text-teal-900" },
  usage_note:       { bg: "bg-orange-50",  ring: "ring-orange-200",  chip: "bg-orange-500",  icon: "⚠️", title: "text-orange-900" },
  web_images:       { bg: "bg-sky-50/70",  ring: "ring-sky-200",     chip: "bg-sky-600",     icon: "🌐", title: "text-sky-900" },
  real_usage:       { bg: "bg-rose-50/70", ring: "ring-rose-200",    chip: "bg-rose-600",    icon: "🎬", title: "text-rose-900" },
};

export type WordCardHandle = { toggleEditing: () => void; isEditing: () => boolean };

export const WordCard = forwardRef<WordCardHandle, { word: WordCardData; autoplay?: boolean }>(
  function WordCard({ word, autoplay = true }, ref) {
    const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
    usePrefsSync(setPrefs);

    // Kept for API compatibility — the editor now lives outside the card.
    useImperativeHandle(ref, () => ({
      toggleEditing: () => {},
      isEditing: () => false,
    }), []);

    const ex = word.extras ?? {};
    const isVisible = (id: SectionId) => !prefs.hidden.includes(id);

    const hasContent = (id: SectionId): boolean => {
      switch (id) {
        case "meaning": return !!word.meaning_ja;
        case "common_situation": return !!ex.common_situation;
        case "register_note": return !!ex.register_note;
        case "word_order": return !!ex.word_order;
        case "synonym_diff": return !!ex.synonym_diff;
        case "study_tips": return !!ex.study_tips;
        case "example": return !!word.example_sentence;
        case "examples_extra": return (ex.examples_extra?.length ?? 0) > 0;
        case "collocations": return (ex.collocations?.length ?? 0) > 0;
        case "synonyms": return (ex.synonyms?.length ?? 0) > 0 || (ex.antonyms?.length ?? 0) > 0;
        case "etymology": return !!ex.etymology || !!ex.radicals;
        case "mnemonic": return !!ex.mnemonic;
        case "trivia": return !!ex.trivia;
        case "usage_note": return !!ex.usage_note;
        // 外部データのセクションは常に描画できる(A10)。
        case "web_images": return true;
        case "real_usage": return true;
      }
    };

    return (
      <div className="space-y-3">
        <HeaderRow word={word} autoplay={autoplay} />
        <div className="grid gap-3">
          {prefs.order.filter((id) => isVisible(id) && hasContent(id)).map((id) => (
            <SectionCard key={id} id={id} word={word} />
          ))}
        </div>
      </div>
    );
  },
);

function HeaderRow({ word, autoplay }: { word: WordCardData; autoplay: boolean }) {
  const ttsFn = useServerFn(synthesizeSpeech);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoplayedRef = useRef(false);

  async function ensureAudio() {
    if (audioUrl) return audioUrl;
    setLoading(true);
    try {
      const r = await ttsFn({ data: { text: word.headword } });
      setAudioUrl(r.audio_url);
      return r.audio_url;
    } finally {
      setLoading(false);
    }
  }

  async function play() {
    // Prime synchronously inside the gesture — see src/lib/audio.ts.
    if (!audioRef.current) audioRef.current = new Audio();
    primeAudio(audioRef.current);
    try {
      const url = await ensureAudio();
      claimAudio(audioRef.current);
      audioRef.current.src = url;
      audioRef.current.onplay = () => setPlaying(true);
      audioRef.current.onended = () => setPlaying(false);
      audioRef.current.onpause = () => setPlaying(false);
      await audioRef.current.play();
    } catch (e) {
      console.warn("TTS playback failed", e);
      if ("speechSynthesis" in window) {
        stopOtherAudio();
        const u = new SpeechSynthesisUtterance(word.headword);
        u.lang = "zh-TW";
        speechSynthesis.speak(u);
      }
    }
  }

  useEffect(() => {
    if (!autoplay || autoplayedRef.current) return;
    autoplayedRef.current = true;
    const t = setTimeout(() => { play().catch(() => {}); }, 400);
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
              className={`lift inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ${playing ? "animate-pulse" : ""}`}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-5 w-5" />}
            </button>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {word.reading_zhuyin} {word.pinyin && <span className="ml-2">{word.pinyin}</span>}
          </div>
          {(word.part_of_speech || word.level) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {word.part_of_speech && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-900 ring-1 ring-violet-200">
                  {word.part_of_speech}
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
    return <span className="text-[11px] text-muted-foreground">🙏 報告ありがとうございます</span>;
  }
  return (
    <span className="relative ml-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
        aria-label="この語の誤りを報告"
      >
        <Flag className="h-3 w-3" /> 報告
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 w-40 rounded-xl border border-border bg-card p-1.5 shadow-xl">
          <p className="px-2 py-1 text-[10px] text-muted-foreground">どこが違う?</p>
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

function SectionCard({ id, word }: { id: SectionId; word: WordCardData }) {
  const t = SECTION_THEME[id];
  const label = ALL_SECTIONS.find((s) => s.id === id)?.label ?? id;
  const ex = word.extras ?? {};

  return (
    <section className={`lift rounded-2xl ${t.bg} ring-1 ${t.ring} p-4 shadow-sm`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`grid h-6 w-6 place-items-center rounded-full ${t.chip} text-xs text-white shadow`}>
          {t.icon}
        </span>
        <h3 className={`text-xs font-semibold uppercase tracking-wider ${t.title}`}>{label}</h3>
      </div>
      <Body id={id} word={word} ex={ex} />
    </section>
  );
}

function Body({ id, word, ex }: { id: SectionId; word: WordCardData; ex: WordExtras }) {
  switch (id) {
    case "meaning":
      return <p className="text-base font-medium text-foreground">{word.meaning_ja}</p>;
    case "common_situation":
      return <p className="text-sm leading-relaxed">{ex.common_situation}</p>;
    case "example":
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
              <p className="text-sm">{e.zh}</p>
              <p className="text-[11px] text-muted-foreground">{e.ja}</p>
            </li>
          ))}
        </ul>
      );
    case "collocations":
      return (
        <div>
          <div className="flex flex-wrap gap-1.5">
            {(ex.collocations ?? []).map((c, i) => (
              <CatchPill key={i}>{c}</CatchPill>
            ))}
          </div>
          <DerivedCatchHint />
        </div>
      );
    case "synonyms":
      return (
        <div className="space-y-2 text-sm">
          {(ex.synonyms?.length ?? 0) > 0 && (
            <div>
              <span className="mr-2 text-[11px] text-muted-foreground">類義</span>
              {ex.synonyms!.map((s, i) => <CatchPill key={i}>{s}</CatchPill>)}
            </div>
          )}
          {(ex.antonyms?.length ?? 0) > 0 && (
            <div>
              <span className="mr-2 text-[11px] text-muted-foreground">反義</span>
              {ex.antonyms!.map((s, i) => <CatchPill key={i} tone="rose">{s}</CatchPill>)}
            </div>
          )}
          <DerivedCatchHint />
        </div>
      );
    case "etymology":
      return (
        <div className="space-y-1 text-sm leading-relaxed">
          {ex.etymology && <p>{ex.etymology}</p>}
          {ex.radicals && <p className="text-xs text-muted-foreground">部首: {ex.radicals}</p>}
        </div>
      );
    case "register_note":
      return <p className="text-sm leading-relaxed">{ex.register_note}</p>;
    case "word_order":
      return <p className="text-sm leading-relaxed">{ex.word_order}</p>;
    case "synonym_diff":
      return <p className="text-sm leading-relaxed">{ex.synonym_diff}</p>;
    case "study_tips":
      return <p className="text-sm leading-relaxed">{ex.study_tips}</p>;
    case "mnemonic":
      return <p className="text-sm italic leading-relaxed">「{ex.mnemonic}」</p>;
    case "trivia":
      return <p className="text-sm leading-relaxed">{ex.trivia}</p>;
    case "usage_note":
      return <p className="text-sm leading-relaxed">{ex.usage_note}</p>;
    case "web_images":
      return <WebImagesBody headword={word.headword} meaningJa={word.meaning_ja} />;
    case "real_usage":
      return <RealUsageBody headword={word.headword} />;
  }
}

/**
 * ネットの画像(A10): その単語を最もよく表すWeb画像を**開いた瞬間に**表示する
 * (以前はStickerSheetの折りたたみで、タップしないと出なかった)。
 * 結果は24hキャッシュされるので実コストは初回検索のみ。
 */
function WebImagesBody({ headword, meaningJa }: { headword: string; meaningJa: string }) {
  const searchFn = useServerFn(searchImageCandidates);
  const { data, isLoading } = useQuery({
    queryKey: ["web-images", headword],
    queryFn: async () => (await searchFn({ data: { query: meaningJa || headword } })).candidates,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const candidates: ImageCandidate[] = data ?? [];
  return (
    <div>
      {isLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => <div key={i} className="aspect-square animate-pulse rounded-xl bg-white/60" />)}
        </div>
      ) : candidates.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {candidates.slice(0, 3).map((c, i) => (
            <figure key={i} className="relative aspect-square overflow-hidden rounded-xl bg-white/60">
              <img src={c.url} alt={`「${headword}」のイメージ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
              {c.credit?.name && (
                <figcaption className="absolute bottom-0 inset-x-0 truncate bg-black/50 px-1 text-[8px] text-white">📷 {c.credit.name}</figcaption>
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
    { emoji: "📖", label: "萌典(教育部辞書)", hint: "公式辞書の定義・注音", href: `https://www.moedict.tw/${q}` },
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

/**
 * Derived catch: every related word on a card is itself catchable. Tapping a
 * pill jumps to /capture?word=◯◯ which runs the text-capture flow — this is
 * how verbs/adjectives get collected even though photos mostly yield nouns.
 */
function CatchPill({ children, tone = "default" }: { children: string; tone?: "default" | "rose" }) {
  return (
    <Link
      to="/capture"
      search={{ word: children }}
      className={`mr-1 mb-1 inline-block rounded-full px-2.5 py-1 text-[12px] font-medium ${tone === "rose" ? "bg-rose-100 text-rose-900" : "bg-white/70 text-foreground"} shadow-sm ring-1 ring-black/5 transition-transform active:scale-95`}
    >
      {children}
      <span className="ml-1 opacity-50">＋</span>
    </Link>
  );
}

function DerivedCatchHint() {
  return <p className="mt-2 text-[10px] text-muted-foreground">タップでこの言葉もゲットできます</p>;
}
