import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Keyboard, Loader2, Mic, Search, Sparkles, Square, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateCard, generatePhraseCard, type GeneratedCard, type GeneratedPhraseCard } from "@/lib/ai.functions";
import { lookupHeadwords, type DictionaryEntry } from "@/lib/scan.functions";
import { saveGhostSticker } from "@/lib/ghost.functions";
import { searchImageCandidates, fetchImageAsDataUrl, type ImageCandidate } from "@/lib/images.functions";
import { usePhoneticPref, pickReading } from "@/lib/phonetic";
import { useT } from "@/lib/i18n";
import { downscaleDataUrl } from "@/lib/cutout";
import { Zh } from "@/components/Zh";

/**
 * Input catch (§5.2): the entrance for words you can't photograph — heard in
 * class, said by a clerk, seen in a video. Type it, or repeat it back with
 * your own voice (the repetition doubles as pronunciation practice).
 * Saves a GHOST card (§5.3) with an auto-fetched placeholder image; meeting
 * the word in the real world later turns the dot gold and completes the card.
 */

type Props = {
  initialMode: "text" | "voice";
  /** Prefill the search box — e.g. a word typed on the scan screen's fallback. */
  initialText?: string;
  /** 派生キャッチ(?word=◯◯)用: 開いたら即AIで調べる。 */
  autoLookup?: boolean;
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

export function InputCatchSheet({ initialMode, initialText, autoLookup, onClose }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cardFn = useServerFn(generateCard);
  const phraseFn = useServerFn(generatePhraseCard);
  const lookupFn = useServerFn(lookupHeadwords);
  const saveGhostFn = useServerFn(saveGhostSticker);

  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState(initialText ?? "");
  const [isPhrase, setIsPhrase] = useState(false);
  const [phraseTouched, setPhraseTouched] = useState(false);
  const [scene, setScene] = useState("");
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [card, setCard] = useState<GeneratedCard | null>(null);
  const [phraseCard, setPhraseCard] = useState<GeneratedPhraseCard | null>(null);
  const [dict, setDict] = useState<DictionaryEntry | null>(null);
  // 画像: ユーザー添付が最優先。無ければWeb検索の候補から自動で仮画像を
  // 添付する(タップでワンタッチ変更可)。B2で一度廃止したがNORI指定で復活。
  const [attachedDataUrl, setAttachedDataUrl] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ImageCandidate[]>([]);
  const [picked, setPicked] = useState(0);
  const searchImagesFn = useServerFn(searchImageCandidates);
  const fetchImageFn = useServerFn(fetchImageAsDataUrl);
  const phonetic = usePhoneticPref();
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  // 派生キャッチ: 語が渡されて来たら、開いた瞬間にそのまま調べる。
  useEffect(() => {
    if (autoLookup && initialText?.trim()) {
      const t = setTimeout(() => { void lookupAndGenerate(); }, 150);
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
        const pc = await phraseFn({ data: { phrase: headword, scene } });
        setPhraseCard(pc);
        setDict(null);
      } else {
        // 母語(日本語)入力OK: generateCard が台湾華語の見出し語に解決して
        // headword_zh で返すので、辞書照合はその解決後の語で行う。
        const c = await cardFn({ data: { headword, targetLanguage: "zh-TW" } });
        const resolved = c.headword_zh || headword;
        const lk = await lookupFn({ data: { headwords: [resolved] } }).catch(() => ({ entries: {} as Record<string, DictionaryEntry> }));
        setDict(lk.entries[resolved] ?? null);
        setCard(c);
        if (resolved !== headword) setText(resolved);
        // 仮画像候補をWeb検索(失敗しても保存は続行できる)。
        void searchImagesFn({ data: { query: c.meaning_ja || resolved } })
          .then(({ candidates: cands }) => { setCandidates(cands); setPicked(0); })
          .catch(() => {});
      }
      setStep("preview");
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("err.generateFailed"));
      setStep("input");
    }
  }

  async function onPickFile(file: File) {
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(new Error("read failed"));
        r.readAsDataURL(file);
      });
      const small = await downscaleDataUrl(dataUrl, 1280, 0.82);
      setAttachedDataUrl(small);
    } catch { /* 添付は任意 */ }
  }

  async function save() {
    const headword = text.trim();
    if (!headword || step === "saving") return;
    setStep("saving");
    setErr(null);
    try {
      // ユーザーが添付した画像があればそれを実写として使う。無ければ
      // Web検索の候補を仮画像(placeholder)として自動添付する。
      let object_path: string | null = null;
      let placeholder_path: string | null = null;
      let placeholder_credit: { name?: string; link?: string; source: string } | null = null;
      if (attachedDataUrl) {
        try {
          const blob = await (await fetch(attachedDataUrl)).blob();
          const { data: userData } = await supabase.auth.getUser();
          const userId = userData.user?.id;
          if (userId) {
            const path = `${userId}/${Date.now()}-object.jpg`;
            const { error } = await supabase.storage.from("stickers").upload(path, blob, {
              contentType: blob.type,
              upsert: false,
            });
            if (!error) object_path = path;
          }
        } catch { /* 画像なしでも保存は続行 */ }
      } else if (!isPhrase && candidates[picked]) {
        // 仮画像: サーバー経由で取得(CORS回避)→自分のフォルダにアップロード。
        try {
          const cand = candidates[picked];
          const { dataUrl } = await fetchImageFn({ data: { url: cand.url } });
          const small = await downscaleDataUrl(dataUrl, 1024, 0.8);
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
        } catch { /* 仮画像は任意 — 失敗しても保存は続行 */ }
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
          object_path,
          placeholder_path,
          placeholder_credit,
        },
      });

      await qc.invalidateQueries({ queryKey: ["stickers"] });
      void qc.invalidateQueries({ queryKey: ["scan-context"] });
      if (res.first_catch) {
        toast.success(t("sheet.firstCatch"), { duration: 5000 });
      } else if (object_path) {
        toast.success(t("sheet.cardAdded"));
      } else {
        toast.success(t("sheet.addedGhostFree"));
      }
      onClose();
      navigate({ to: "/dex/$stickerId", params: { stickerId: res.id } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("cap.saveFailed"));
      setStep("preview");
    }
  }

  const verified = !!dict && dict.source === "verified";

  return (
    <div className="material-in fixed inset-0 z-50 flex flex-col bg-background/97 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={t("input.title")}>
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 pl-1 text-xs font-medium text-muted-foreground">
          <Keyboard className="h-3.5 w-3.5" /> {t("input.title")}
        </span>
        <button
          onClick={onClose}
          aria-label={t("common.close")}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card active:scale-95 motion-reduce:active:scale-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {(step === "input" || step === "loading") && (
          <div className="mx-auto max-w-sm space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              {t("input.lead")}
            </p>

            {canSpeak && initialMode === "voice" && (
              <button
                onClick={toggleRecord}
                disabled={step === "loading"}
                className={`lift mx-auto flex h-16 w-16 items-center justify-center rounded-full shadow-xl transition-colors ${
                  listening ? "bg-red-500 text-white shadow-red-500/30" : "bg-primary text-primary-foreground shadow-primary/30"
                }`}
                aria-label={listening ? t("sheet.stopRepeat") : t("sheet.repeat")}
              >
                {listening ? <Square className="h-6 w-6" /> : <Mic className="h-7 w-7" />}
              </button>
            )}
            <p className="text-center text-[11px] text-muted-foreground">
              {initialMode === "voice" && canSpeak
                ? listening
                  ? t("input.listening")
                  : t("input.micHint")
                : t("input.textHint")}
            </p>

            <div className="relative">
              <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (!phraseTouched) setIsPhrase(guessIsPhrase(e.target.value));
                }}
                placeholder={t("sheet.inputPlaceholder")}
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
                  {v ? t("input.phrase") : t("input.word")}
                </button>
              ))}
            </div>

            {isPhrase && (
              <input
                value={scene}
                onChange={(e) => setScene(e.target.value)}
                placeholder={t("input.scene")}
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
              {step === "loading" ? t("input.looking") : t("input.lookup")}
            </button>
          </div>
        )}

        {(step === "preview" || step === "saving") && (
          <div className="mx-auto max-w-sm space-y-4">
            {/* 画像はネット検索から自動で入る(#67)。自分の画像を添付したい
                ときはここをタップ。候補は下のサムネイルから選び直せる。 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPickFile(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative mx-auto block aspect-square w-48"
            >
              {attachedDataUrl ? (
                <img src={attachedDataUrl} alt={t("sheet.attached")} className="h-full w-full rounded-2xl object-cover shadow-md ring-1 ring-black/5" />
              ) : !isPhrase && candidates[picked] ? (
                <img src={candidates[picked].thumb} alt={t("sheet.webImage")} className="h-full w-full rounded-2xl object-cover opacity-90 shadow-md ring-1 ring-black/5" />
              ) : (
                <div className="grid h-full w-full place-items-center rounded-2xl border-2 border-dashed border-border bg-secondary/60">
                  <div className="text-center text-muted-foreground">
                    <ImagePlus className="mx-auto h-10 w-10" />
                    <span className="mt-1 block text-[11px]">{t("input.attach")}</span>
                  </div>
                </div>
              )}
            </button>
            <p className="text-center text-[11px] text-muted-foreground">
              {attachedDataUrl
                ? t("input.attachChange")
                : candidates.length > 0
                  ? t("input.autoImage")
                  : t("input.noImageOk")}
            </p>
            {!attachedDataUrl && candidates.length > 1 && (
              <div className="flex justify-center gap-2">
                {candidates.slice(0, 4).map((c, i) => (
                  <button
                    key={i}
                    onClick={() => setPicked(i)}
                    aria-pressed={picked === i}
                    className={`h-14 w-14 overflow-hidden rounded-xl ring-2 transition ${picked === i ? "ring-primary" : "ring-transparent opacity-70"}`}
                  >
                    <img src={c.thumb} alt={t("sheet.candidateN", { n: i + 1 })} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-baseline gap-2">
                <h2 className="text-2xl font-bold tracking-tight">{text.trim()}</h2>
                {verified ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-900 ring-1 ring-emerald-200">{t("input.verified")}</span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200">{t("input.aiGenerated")}</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isPhrase
                  ? pickReading(phonetic, phraseCard?.reading_zhuyin, phraseCard?.pinyin)
                  : pickReading(phonetic, dict?.zhuyin || card?.reading_zhuyin, dict?.pinyin || card?.pinyin)}
              </p>
              <p className="mt-2 text-base font-medium">
                {isPhrase ? phraseCard?.meaning_ja : dict?.meaning_ja || card?.meaning_ja}
              </p>

              {isPhrase && phraseCard && (
                <div className="mt-3 border-t border-border pt-3">
                  {scene && <p className="text-xs text-muted-foreground">{t("sheet.scene", { s: scene })}</p>}
                  <p className="mt-1 text-xs font-semibold text-muted-foreground">{t("input.replies")}</p>
                  <ul className="mt-1 space-y-1">
                    {phraseCard.replies.map((r, i) => (
                      <li key={i} className="rounded-lg bg-secondary/60 px-3 py-1.5 text-sm">
                        <Zh>{r.zh}</Zh> <span className="text-xs text-muted-foreground">— {r.ja}</span>
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
              {step === "saving" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              {t("input.save")}
            </button>
            <p className="text-center text-[11px] text-muted-foreground">
              {t("input.saveHint")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
