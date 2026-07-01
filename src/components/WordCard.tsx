import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Volume2, Loader2, Eye, EyeOff, ChevronUp, ChevronDown } from "lucide-react";
import { synthesizeSpeech } from "@/lib/tts.functions";

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
  | "common_situation"
  | "example"
  | "examples_extra"
  | "collocations"
  | "synonyms"
  | "etymology"
  | "mnemonic"
  | "trivia"
  | "usage_note";

const ALL_SECTIONS: { id: SectionId; label: string }[] = [
  { id: "meaning", label: "意味" },
  { id: "common_situation", label: "使う場面" },
  { id: "example", label: "例文" },
  { id: "examples_extra", label: "追加の例文" },
  { id: "collocations", label: "コロケーション" },
  { id: "synonyms", label: "類義語・反義語" },
  { id: "etymology", label: "語源・部首" },
  { id: "mnemonic", label: "覚え方" },
  { id: "trivia", label: "雑学" },
  { id: "usage_note", label: "語法ノート" },
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
  example:          { bg: "bg-emerald-50", ring: "ring-emerald-200", chip: "bg-emerald-500", icon: "💬", title: "text-emerald-900" },
  examples_extra:   { bg: "bg-emerald-50/60", ring: "ring-emerald-200", chip: "bg-emerald-400", icon: "➕", title: "text-emerald-900" },
  collocations:     { bg: "bg-rose-50",    ring: "ring-rose-200",    chip: "bg-rose-500",    icon: "🔗", title: "text-rose-900" },
  synonyms:         { bg: "bg-indigo-50",  ring: "ring-indigo-200",  chip: "bg-indigo-500",  icon: "🪞", title: "text-indigo-900" },
  etymology:        { bg: "bg-stone-50",   ring: "ring-stone-200",   chip: "bg-stone-600",   icon: "🏛️", title: "text-stone-900" },
  mnemonic:         { bg: "bg-fuchsia-50", ring: "ring-fuchsia-200", chip: "bg-fuchsia-500", icon: "💡", title: "text-fuchsia-900" },
  trivia:           { bg: "bg-teal-50",    ring: "ring-teal-200",    chip: "bg-teal-500",    icon: "✨", title: "text-teal-900" },
  usage_note:       { bg: "bg-orange-50",  ring: "ring-orange-200",  chip: "bg-orange-500",  icon: "⚠️", title: "text-orange-900" },
};

export type WordCardHandle = { toggleEditing: () => void; isEditing: () => boolean };

export const WordCard = forwardRef<WordCardHandle, { word: WordCardData; autoplay?: boolean }>(
  function WordCard({ word, autoplay = true }, ref) {
    const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
    const [editing, setEditing] = useState(false);

    useImperativeHandle(ref, () => ({
      toggleEditing: () => setEditing((v) => !v),
      isEditing: () => editing,
    }), [editing]);

    useEffect(() => { savePrefs(prefs); }, [prefs]);

    const ex = word.extras ?? {};
    const isVisible = (id: SectionId) => !prefs.hidden.includes(id);
    const toggle = (id: SectionId) =>
      setPrefs((p) => ({ ...p, hidden: p.hidden.includes(id) ? p.hidden.filter((x) => x !== id) : [...p.hidden, id] }));
    const move = (id: SectionId, dir: -1 | 1) =>
      setPrefs((p) => {
        const i = p.order.indexOf(id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= p.order.length) return p;
        const o = [...p.order];
        [o[i], o[j]] = [o[j], o[i]];
        return { ...p, order: o };
      });

    const hasContent = (id: SectionId): boolean => {
      switch (id) {
        case "meaning": return !!word.meaning_ja;
        case "common_situation": return !!ex.common_situation;
        case "example": return !!word.example_sentence;
        case "examples_extra": return (ex.examples_extra?.length ?? 0) > 0;
        case "collocations": return (ex.collocations?.length ?? 0) > 0;
        case "synonyms": return (ex.synonyms?.length ?? 0) > 0 || (ex.antonyms?.length ?? 0) > 0;
        case "etymology": return !!ex.etymology || !!ex.radicals;
        case "mnemonic": return !!ex.mnemonic;
        case "trivia": return !!ex.trivia;
        case "usage_note": return !!ex.usage_note;
      }
    };

    return (
      <div className="space-y-3">
        <HeaderRow word={word} autoplay={autoplay} />

        {editing && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-3 text-xs">
            <p className="mb-2 font-medium text-muted-foreground">表示する項目と順番</p>
            <ul className="space-y-1">
              {prefs.order.map((id, idx) => {
                const meta = ALL_SECTIONS.find((s) => s.id === id);
                if (!meta) return null;
                const visible = isVisible(id);
                return (
                  <li key={id} className="flex items-center justify-between rounded-lg bg-secondary/60 px-2 py-1">
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
          </div>
        )}

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
      setAudioUrl(r.audio_data_url);
      return r.audio_data_url;
    } finally {
      setLoading(false);
    }
  }

  async function play() {
    try {
      const url = await ensureAudio();
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      audioRef.current.onplay = () => setPlaying(true);
      audioRef.current.onended = () => setPlaying(false);
      audioRef.current.onpause = () => setPlaying(false);
      await audioRef.current.play();
    } catch (e) {
      console.warn("TTS playback failed", e);
      if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(word.headword);
        u.lang = "zh-TW";
        speechSynthesis.cancel();
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
            <div className="mt-2 flex flex-wrap gap-1.5">
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
            </div>
          )}
        </div>
      </div>
    </div>
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
        <div className="flex flex-wrap gap-1.5">
          {(ex.collocations ?? []).map((c, i) => (
            <Pill key={i}>{c}</Pill>
          ))}
        </div>
      );
    case "synonyms":
      return (
        <div className="space-y-2 text-sm">
          {(ex.synonyms?.length ?? 0) > 0 && (
            <div>
              <span className="mr-2 text-[11px] text-muted-foreground">類義</span>
              {ex.synonyms!.map((s, i) => <Pill key={i}>{s}</Pill>)}
            </div>
          )}
          {(ex.antonyms?.length ?? 0) > 0 && (
            <div>
              <span className="mr-2 text-[11px] text-muted-foreground">反義</span>
              {ex.antonyms!.map((s, i) => <Pill key={i} tone="rose">{s}</Pill>)}
            </div>
          )}
        </div>
      );
    case "etymology":
      return (
        <div className="space-y-1 text-sm leading-relaxed">
          {ex.etymology && <p>{ex.etymology}</p>}
          {ex.radicals && <p className="text-xs text-muted-foreground">部首: {ex.radicals}</p>}
        </div>
      );
    case "mnemonic":
      return <p className="text-sm italic leading-relaxed">「{ex.mnemonic}」</p>;
    case "trivia":
      return <p className="text-sm leading-relaxed">{ex.trivia}</p>;
    case "usage_note":
      return <p className="text-sm leading-relaxed">{ex.usage_note}</p>;
  }
}

function Pill({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "rose" }) {
  return (
    <span className={`mr-1 mb-1 inline-block rounded-full px-2.5 py-1 text-[12px] font-medium ${tone === "rose" ? "bg-rose-100 text-rose-900" : "bg-white/70 text-foreground"} shadow-sm ring-1 ring-black/5`}>
      {children}
    </span>
  );
}
