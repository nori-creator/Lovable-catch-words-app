import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ghost, Keyboard, Loader2, Mic, Search, Square, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateCard, generatePhraseCard, type GeneratedCard, type GeneratedPhraseCard } from "@/lib/ai.functions";
import { lookupHeadwords, type DictionaryEntry } from "@/lib/scan.functions";
import { searchImageCandidates, fetchImageAsDataUrl, type ImageCandidate } from "@/lib/images.functions";
import { saveGhostSticker } from "@/lib/ghost.functions";
import { downscaleDataUrl } from "@/lib/cutout";

/**
 * Input catch (§5.2): the entrance for words you can't photograph — heard in
 * class, said by a clerk, seen in a video. Type it, or repeat it back with
 * your own voice (the repetition doubles as pronunciation practice).
 * Saves a GHOST card (§5.3) with an auto-fetched placeholder image; meeting
 * the word in the real world later turns the dot gold and completes the card.
 */

type Props = {
  initialMode: "text" | "voice";
  onClose: () => void;
};

type Step = "input" | "loading" | "preview" | "saving";

type SR = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: (e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};

function srAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

/** Heuristic default: long input or sentence punctuation reads as a phrase. */
function guessIsPhrase(text: string): boolean {
  const t = text.trim();
  return t.length >= 5 || /[、。！？!?,]/.test(t);
}

export function InputCatchSheet({ initialMode, onClose }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cardFn = useServerFn(generateCard);
  const phraseFn = useServerFn(generatePhraseCard);
  const lookupFn = useServerFn(lookupHeadwords);
  const searchImagesFn = useServerFn(searchImageCandidates);
  const fetchImageFn = useServerFn(fetchImageAsDataUrl);
  const saveGhostFn = useServerFn(saveGhostSticker);

  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState("");
  const [isPhrase, setIsPhrase] = useState(false);
  const [phraseTouched, setPhraseTouched] = useState(false);
  const [scene, setScene] = useState("");
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [card, setCard] = useState<GeneratedCard | null>(null);
  const [phraseCard, setPhraseCard] = useState<GeneratedPhraseCard | null>(null);
  const [dict, setDict] = useState<DictionaryEntry | null>(null);
  const [candidates, setCandidates] = useState<ImageCandidate[]>([]);
  const [picked, setPicked] = useState(0);
  const recogRef = useRef<SR | null>(null);
  const canSpeak = srAvailable();

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Voice mode: open the mic immediately (耳キャッチ = repeat what you heard).
  useEffect(() => {
    if (initialMode === "voice" && canSpeak) {
      const t = setTimeout(() => toggleRecord(), 350);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleRecord() {
    if (listening) { recogRef.current?.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor() as SR;
    rec.lang = "cmn-Hant-TW";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      const trimmed = t.trim();
      setText(trimmed);
      if (!phraseTouched) setIsPhrase(guessIsPhrase(trimmed));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recogRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function lookupAndGenerate() {
    const headword = text.trim();
    if (!headword) return;
    setErr(null);
    setStep("loading");
    try {
      if (isPhrase) {
        const [pc] = await Promise.all([
          phraseFn({ data: { phrase: headword, scene } }),
        ]);
        setPhraseCard(pc);
        setDict(null);
        void loadImages(pc.meaning_ja || headword);
      } else {
        // 母語(日本語)入力OK: generateCard が台湾華語の見出し語に解決して
        // headword_zh で返すので、辞書照合はその解決後の語で行う。
        const c = await cardFn({ data: { headword, targetLanguage: "zh-TW" } });
        const resolved = c.headword_zh || headword;
        const lk = await lookupFn({ data: { headwords: [resolved] } }).catch(() => ({ entries: {} as Record<string, DictionaryEntry> }));
        setDict(lk.entries[resolved] ?? null);
        setCard(c);
        if (resolved !== headword) setText(resolved);
        void loadImages(c.meaning_ja || resolved);
      }
      setStep("preview");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "生成に失敗しました");
      setStep("input");
    }
  }

  async function loadImages(query: string) {
    try {
      const { candidates: cands } = await searchImagesFn({ data: { query } });
      setCandidates(cands);
      setPicked(0);
    } catch { /* placeholder is optional */ }
  }

  async function save() {
    const headword = text.trim();
    if (!headword || step === "saving") return;
    setStep("saving");
    setErr(null);
    try {
      // Upload the placeholder (auto-picked, changeable) to Storage.
      let placeholder_path: string | null = null;
      let placeholder_credit: { name?: string; link?: string; source: string } | null = null;
      const cand = candidates[picked];
      if (cand) {
        try {
          const dataUrl = cand.url.startsWith("data:")
            ? cand.url
            : (await fetchImageFn({ data: { url: cand.url } })).dataUrl;
          const small = await downscaleDataUrl(dataUrl, 800, 0.82);
          const blob = await (await fetch(small)).blob();
          const { data: userData } = await supabase.auth.getUser();
          const userId = userData.user?.id;
          if (userId) {
            const path = `${userId}/${Date.now()}-placeholder.jpg`;
            const { error } = await supabase.storage.from("stickers").upload(path, blob, {
              contentType: blob.type,
              upsert: false,
            });
            if (!error) {
              placeholder_path = path;
              placeholder_credit = cand.credit
                ? { ...cand.credit, source: cand.source }
                : { source: cand.source };
            }
          }
        } catch { /* ghost without image is still fine */ }
      }

      const word = isPhrase
        ? {
            headword,
            reading_zhuyin: phraseCard?.reading_zhuyin ?? "",
            pinyin: phraseCard?.pinyin ?? "",
            meaning_ja: phraseCard?.meaning_ja ?? headword,
            part_of_speech: "フレーズ",
            level: "TOCFL-2",
            category_key: "other",
            example_sentence: phraseCard?.replies[0]?.zh ?? "",
            example_translation: phraseCard?.replies[0]?.ja ?? "",
            extras: {
              collocations: [],
              synonyms: [],
              antonyms: [],
              etymology: "",
              radicals: "",
              mnemonic: "",
              trivia: "",
              common_situation: phraseCard?.common_situation ?? "",
              usage_note: phraseCard?.usage_note ?? "",
              // 返し方の例をそのまま追加例文スロットに載せる(表=シーン/裏=返し)
              examples_extra: phraseCard?.replies ?? [],
            },
            entry_type: "phrase" as const,
          }
        : {
            headword,
            reading_zhuyin: dict?.zhuyin || card?.reading_zhuyin || "",
            pinyin: dict?.pinyin || card?.pinyin || "",
            meaning_ja: dict?.meaning_ja || card?.meaning_ja || headword,
            part_of_speech: dict?.pos || card?.part_of_speech || "名詞",
            level: card?.level ?? "TOCFL-2",
            category_key: card?.category_key ?? "other",
            example_sentence: card?.example_sentence ?? "",
            example_translation: card?.example_translation ?? "",
            extras: card?.extras,
            entry_type: "word" as const,
          };

      const res = await saveGhostFn({
        data: {
          word,
          language: "zh-TW",
          capture_type: initialMode === "voice" && canSpeak ? "voice" : "text",
          caption: isPhrase && scene ? scene : null,
          placeholder_path,
          placeholder_credit,
        },
      });

      await qc.invalidateQueries({ queryKey: ["stickers"] });
      void qc.invalidateQueries({ queryKey: ["scan-context"] });
      if (res.first_catch) {
        toast.success("はじめてのキャッチ! 明日、この単語を覚えてるか聞くね", { duration: 5000 });
      } else {
        toast.success("図鑑にゴーストカードが入りました。実物に出会ったら金色に光ります!");
      }
      onClose();
      navigate({ to: "/dex/$stickerId", params: { stickerId: res.id } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗しました");
      setStep("preview");
    }
  }

  const verified = !!dict && dict.source === "verified";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/97 backdrop-blur-md animate-in fade-in duration-200" role="dialog">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 pl-1 text-xs font-medium text-muted-foreground">
          <Ghost className="h-3.5 w-3.5" /> 入力キャッチ
        </span>
        <button
          onClick={onClose}
          aria-label="閉じる"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card active:scale-95"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {(step === "input" || step === "loading") && (
          <div className="mx-auto max-w-sm space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              授業で習った・聞こえた・動画で見た言葉を、写真がなくても図鑑に。
            </p>

            {canSpeak && (
              <button
                onClick={toggleRecord}
                disabled={step === "loading"}
                className={`lift mx-auto flex h-16 w-16 items-center justify-center rounded-full shadow-xl transition-colors ${
                  listening ? "bg-red-500 text-white shadow-red-500/30" : "bg-primary text-primary-foreground shadow-primary/30"
                }`}
                aria-label={listening ? "停止" : "聞こえたまま復唱する"}
              >
                {listening ? <Square className="h-6 w-6" /> : <Mic className="h-7 w-7" />}
              </button>
            )}
            <p className="text-center text-[11px] text-muted-foreground">
              {canSpeak
                ? listening
                  ? "聞き取り中… 聞こえたフレーズを自分の声で復唱しよう"
                  : "マイクで復唱するか、下に入力(日本語でもOK — 台湾華語に自動変換)"
                : "台湾華語でも日本語でもOK(日本語は自動で台湾華語に変換されます)"}
            </p>

            <div className="relative">
              <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (!phraseTouched) setIsPhrase(guessIsPhrase(e.target.value));
                }}
                placeholder="例: 芒果 / 請稍等"
                className="w-full rounded-full border border-border bg-card py-3 pl-9 pr-4 text-base outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div className="flex justify-center gap-2">
              {([false, true] as const).map((v) => (
                <button
                  key={String(v)}
                  onClick={() => { setIsPhrase(v); setPhraseTouched(true); }}
                  className={`rounded-full border px-4 py-1.5 text-sm ${
                    isPhrase === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                  }`}
                >
                  {v ? "フレーズ" : "単語"}
                </button>
              ))}
            </div>

            {isPhrase && (
              <input
                value={scene}
                onChange={(e) => setScene(e.target.value)}
                placeholder="シーン: どこで・誰が・何と言った?(任意)"
                className="w-full rounded-xl border border-border bg-secondary/50 p-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
            )}

            {err && <p className="rounded-xl bg-destructive/10 p-2 text-xs text-destructive">{err}</p>}

            <button
              onClick={lookupAndGenerate}
              disabled={!text.trim() || step === "loading"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 active:scale-95 disabled:opacity-50"
            >
              {step === "loading" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
              {step === "loading" ? "辞書とAIが調べています…" : "調べてカードにする"}
            </button>
          </div>
        )}

        {(step === "preview" || step === "saving") && (
          <div className="mx-auto max-w-sm space-y-4">
            {/* Placeholder image — clearly temporary (§5.3) */}
            <div className="relative mx-auto aspect-square w-48">
              <div className="grid h-full w-full place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-secondary/60">
                {candidates[picked] ? (
                  <img src={candidates[picked].thumb} alt="仮画像" className="h-full w-full object-cover opacity-80" />
                ) : (
                  <Ghost className="h-12 w-12 text-muted-foreground" />
                )}
              </div>
              <span className="absolute left-2 top-2 rounded-full bg-foreground/70 px-2 py-0.5 text-[10px] font-semibold text-background">
                仮の画像
              </span>
              {candidates[picked]?.credit && (
                <a
                  href={candidates[picked].credit!.link}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute bottom-1 right-2 text-[9px] text-white/90 drop-shadow"
                >
                  📷 {candidates[picked].credit!.name}
                </a>
              )}
            </div>
            {candidates.length > 1 && (
              <div className="flex justify-center gap-2 overflow-x-auto">
                {candidates.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => setPicked(i)}
                    className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg ring-2 ${i === picked ? "ring-primary" : "ring-transparent"}`}
                  >
                    <img src={c.thumb} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-baseline gap-2">
                <h2 className="text-2xl font-bold tracking-tight">{text.trim()}</h2>
                {verified ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-900 ring-1 ring-emerald-200">✓ 検証済み</span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200">AI生成</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isPhrase ? phraseCard?.reading_zhuyin : dict?.zhuyin || card?.reading_zhuyin}
                <span className="ml-2">{isPhrase ? phraseCard?.pinyin : dict?.pinyin || card?.pinyin}</span>
              </p>
              <p className="mt-2 text-base font-medium">
                {isPhrase ? phraseCard?.meaning_ja : dict?.meaning_ja || card?.meaning_ja}
              </p>

              {isPhrase && phraseCard && (
                <div className="mt-3 border-t border-border pt-3">
                  {scene && <p className="text-xs text-muted-foreground">シーン: {scene}</p>}
                  <p className="mt-1 text-xs font-semibold text-muted-foreground">返し方の例</p>
                  <ul className="mt-1 space-y-1">
                    {phraseCard.replies.map((r, i) => (
                      <li key={i} className="rounded-lg bg-secondary/60 px-3 py-1.5 text-sm">
                        {r.zh} <span className="text-xs text-muted-foreground">— {r.ja}</span>
                      </li>
                    ))}
                  </ul>
                  {phraseCard.usage_note && (
                    <p className="mt-2 text-xs text-muted-foreground">{phraseCard.usage_note}</p>
                  )}
                </div>
              )}

              {!isPhrase && card?.example_sentence && (
                <p className="mt-2 text-sm">
                  {card.example_sentence}
                  <span className="block text-xs text-muted-foreground">{card.example_translation}</span>
                </p>
              )}
            </div>

            {err && <p className="rounded-xl bg-destructive/10 p-2 text-xs text-destructive">{err}</p>}

            <button
              onClick={save}
              disabled={step === "saving"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 active:scale-95 disabled:opacity-50"
            >
              {step === "saving" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Ghost className="h-5 w-5" />}
              ゴーストとして図鑑に入れる
            </button>
            <p className="text-center text-[11px] text-muted-foreground">
              実物に出会ってスキャンすると金色に光り、撮影で図鑑が完成します。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
