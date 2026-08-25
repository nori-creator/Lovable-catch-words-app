import { useEffect, useRef, useState } from "react";
import { sttLangOf } from "@/lib/target-lang";
import { useTargetLang } from "@/lib/target-lang-pref";
import { emptyExtras } from "@/lib/extras";
import { WordCandidateRow } from "@/components/WordCandidateRow";
import { cutoutAtCatch, recordCatchTiming, useCatchSpeed } from "@/lib/catch-speed";

/**
 * 候補1件。**意味と読みが既に入っている** — 要望 #19 が言う
 * 「意味と発音だけで即登録」の材料は、ここに揃っている。
 */
type CandidateSeed = {
  headword: string;
  reading_zhuyin: string;
  pinyin: string;
  meaning_ja: string;
  distinction: string;
};
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ImagePlus,
  Keyboard,
  Loader2,
  Mic,
  Search,
  Sparkles,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  generateCard,
  generatePhraseCard,
  suggestWordCandidates,
  type GeneratedCard,
  type GeneratedPhraseCard,
} from "@/lib/ai.functions";
import { lookupHeadwords, type DictionaryEntry } from "@/lib/scan.functions";
import { saveGhostSticker } from "@/lib/ghost.functions";
import {
  searchImageCandidates,
  fetchImageAsDataUrl,
  type ImageCandidate,
} from "@/lib/images.functions";
import { usePhoneticPref, pickReading } from "@/lib/phonetic";
import { usePronounce } from "@/lib/use-pronounce";
import { useCatchLocation } from "@/lib/use-catch-location";
import { heroSearchQuery } from "@/lib/hero-image";
import { useT } from "@/lib/i18n";
import { downscaleDataUrl } from "@/lib/cutout";
import { toImageDataUrl } from "@/lib/sticker-upload";
import { Zh } from "@/components/Zh";
import { isTargetHeadword } from "@/lib/target-language";

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

type Step = "input" | "loading" | "choose" | "preview" | "saving";

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
  const candidatesFn = useServerFn(suggestWordCandidates);
  const saveGhostFn = useServerFn(saveGhostSticker);

  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState(initialText ?? "");
  const [isPhrase, setIsPhrase] = useState(false);
  const [scene, setScene] = useState("");
  /** 母語の入力から出した台湾華語の候補(2つ以上あれば選ばせる)。 */
  const [wordChoices, setWordChoices] = useState<CandidateSeed[]>([]);
  // 選んだ直後に `text` を読むと、同じレンダーでは古い値しか見えない。
  const wordChoiceRef = useRef<string | null>(null);
  /**
   * 何回目の問い合わせか。**古い回の結果で新しい語を上書きしない**
   * (候補を選び直したときに前の問い合わせが後から着く)。
   * 撮る経路には最初から在った門で、こちらには無かった。
   */
  const runTokenRef = useRef(0);
  const catchSpeed = useCatchSpeed();
  /**
   * 裏で走っている「詳しいカード」。
   *
   * **仮のカードのまま保存させない。** 仮のカードは棚を決められないので
   * `other` を置いてあり、保存はそれをそのまま書き込む
   * (`category_key: card?.category_key ?? "other"`)。あとから走る
   * 自動補完は `extras` しか直さないので、**棚が `other` で固定される**。
   * 画面は先に出す(速さの取り分はそこ)が、保存の直前だけは待つ。
   */
  const cardPromiseRef = useRef<Promise<GeneratedCard | null> | null>(null);
  const realCardRef = useRef<GeneratedCard | null>(null);
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
  const pronounce = usePronounce();
  const { resolve: resolveLocation } = useCatchLocation();
  const t = useT();
  /**
   * **いま撮ろうとしている物を何語として扱うか。**
   * ここが `targetLanguage` に決め打たれていたので、設定で
   * 英語を選んでも台湾華語として辞書を引き、台湾華語として保存していた。
   */
  const targetLanguage = useTargetLang();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recogRef = useRef<SR | null>(null);
  const canSpeak = srAvailable();

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
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
      const t = setTimeout(() => {
        void lookupAndGenerate();
      }, 150);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleRecord() {
    if (listening) {
      recogRef.current?.stop();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => unknown;
      webkitSpeechRecognition?: new () => unknown;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor() as SR;
    // 聞き取りの言語も学習言語から引く("cmn-Hant-TW" を直に書かない)。
    // この画面の他の8箇所と**同じ値**を見ているので、
    // 「英語として聞き取ったのに台湾華語として辞書を引く」は起きない。
    rec.lang = sttLangOf(targetLanguage);
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      const trimmed = t.trim();
      setText(trimmed);
      setIsPhrase(guessIsPhrase(trimmed));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recogRef.current = rec;
    setListening(true);
    rec.start();
  }

  /**
   * 母語で書いた入力から、まず**候補を並べる**。
   *
   * 母語の1語が台湾華語では別々の語に割れる(ティッシュ → 衛生紙 / 面紙)。
   * 決め打ちで1語に落とすと、欲しかった方が二度と出てこない。
   * 候補が1つに絞れたときだけ、そのままカードへ進む。
   */
  async function lookupAndGenerate() {
    const headword = text.trim();
    if (!headword) return;
    setErr(null);
    // **毎回忘れてから始める。** 前の周の選択が残っていると、
    // 書き直した語ではなく前に選んだ語でカードを作ってしまう。
    // この関数の中で立てたものだけを信じる。
    wordChoiceRef.current = null;
    setStep("loading");
    /** 候補が1つに決まったときの種(意味と読み)。 */
    let soleCandidate: CandidateSeed | undefined;
    try {
      if (!isPhrase && !isTargetHeadword(headword, targetLanguage)) {
        // 母語で書かれている = どの語を指すかまだ決まっていない。
        const { candidates: cands } = await candidatesFn({
          data: {
            query: headword,
            scene: scene.trim() || undefined,
            targetLanguage: targetLanguage,
          },
        });
        if (cands.length > 1) {
          setWordChoices(cands);
          setStep("choose");
          return;
        }
        // 1つしか無いなら選ばせる意味が無いので、そのまま進む。
        // **`setText` の直後に `text` を読まない** — 同じレンダーでは
        // 古い値しか見えないので、母語のまま次へ渡してしまう。
        if (cands.length === 1) {
          wordChoiceRef.current = cands[0].headword;
          setText(cands[0].headword);
          soleCandidate = cands[0];
        }
      }
      await buildCard(isPhrase ? headword : (wordChoiceRef.current ?? headword), soleCandidate);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("err.generateFailed"));
      setStep("input");
    }
  }

  /**
   * 選ばれた見出し語(または句)でカードを作る。
   *
   * ## 待たせている物(要望 #19/#80「意味と発音だけで即登録し、詳細は後から」)
   * ここは**全部を直列で待つ**作りだった:
   * 候補を出す → **詳しいカードを作る** → 辞書を引く → やっと画面。
   * 詳しいカードには型・共起語・発音のコツ・語源・部首・覚え方…まで
   * 入るので、いちばん重い。撮る経路(`capture.tsx`)は候補から
   * 意味と読みを**先に入れて**画面を出し、詳しい所は裏で入れ替えている
   * のに、こちらにはその段が無かった。
   *
   * `seed`(候補の意味と読み)が在って「速い」を選んでいるときは、
   * まずそれで画面を出し、詳しいカードは裏で作って差し替える。
   * **保存してしまっても直る** — 詳細の画面が、中身の無い語を初めて
   * 開いたときに自動で作り直す(`StickerSheet` の auto-enrich)。
   * それが要望の言う「詳細は後から」そのもの。
   */
  async function buildCard(headword: string, seed?: CandidateSeed) {
    const token = ++runTokenRef.current;
    const startedAt = Date.now();
    setErr(null);
    setStep("loading");
    try {
      if (isPhrase) {
        const pc = await phraseFn({ data: { phrase: headword, scene } });
        setPhraseCard(pc);
        setDict(null);
      } else {
        // 「速い」を選んでいて、候補から意味と読みが取れているときは
        // **先に画面を出す。** 詳しいカードは下で裏に回す。
        const fast = !cutoutAtCatch(catchSpeed) && !!seed;
        if (fast && seed) {
          setCard({
            headword_zh: seed.headword,
            reading_zhuyin: seed.reading_zhuyin,
            pinyin: seed.pinyin,
            meaning_ja: seed.meaning_ja,
            part_of_speech: "名詞",
            level: "TOCFL-2",
            // 棚は詳しいカードが決める。それまでは仮置き
            // (`CardSchema` も決められないときは `other` に落とす)。
            category_key: "other",
            example_sentence: "",
            example_translation: "",
            new_shelf: null,
            extras: emptyExtras(),
          });
          setDict(null);
          setStep("preview");
          recordCatchTiming({
            ms: Date.now() - startedAt,
            speed: catchSpeed,
            cutout: false,
          });
        }

        // 母語(日本語)入力OK: generateCard が台湾華語の見出し語に解決して
        // headword_zh で返すので、辞書照合はその解決後の語で行う。
        realCardRef.current = null;
        const inflight = cardFn({ data: { headword, targetLanguage: targetLanguage } })
          .then((got) => {
            if (runTokenRef.current === token) realCardRef.current = got;
            return got;
          })
          .catch(() => null);
        cardPromiseRef.current = inflight;
        const c = await inflight;
        if (!c) throw new Error(t("err.generateFailed"));
        // **古い回の結果で新しい語を上書きしない。**
        // 候補を選び直したときに前の問い合わせが後から着くと、
        // 画面には新しい語が出ているのに中身だけ前の語になる。
        if (runTokenRef.current !== token) return;
        // **解決できなかったときに入力をそのまま見出しにしない。**
        // ここは `c.headword_zh || headword` と書いてあった。解決に失敗すると
        // 日本語が見出しになり、「シャーペン」がカタカナのまま図鑑に入って
        // 注音だけが下に付いていた。学んでいる言語でないものは見出しにしない。
        const resolved = isTargetHeadword(c.headword_zh ?? "", targetLanguage)
          ? c.headword_zh
          : isTargetHeadword(headword, targetLanguage)
            ? headword
            : "";
        if (!resolved) {
          setErr(t("input.notTargetLang"));
          setStep("input");
          return;
        }
        // **辞書は待たない。** これは添え物で、無くても画面は成り立つ
        // (失敗しても空で通す作りに既になっている)。待っていたぶんだけ
        // 画面が遅れていた。
        void lookupFn({ data: { headwords: [resolved] } })
          .then((lk) => {
            if (runTokenRef.current !== token) return;
            setDict(lk.entries[resolved] ?? null);
          })
          .catch(() => {});
        setCard(c);
        if (resolved !== headword) setText(resolved);
        // 仮画像候補をWeb検索(失敗しても保存は続行できる)。
        void searchImagesFn({
          data: { query: heroSearchQuery({ headword: resolved, meaning: c.meaning_ja }) },
        })
          .then(({ candidates: cands }) => {
            setCandidates(cands);
            setPicked(0);
          })
          .catch(() => {});
      }
      setStep("preview");
      if (!seed) {
        recordCatchTiming({ ms: Date.now() - startedAt, speed: catchSpeed, cutout: false });
      }
    } catch (e) {
      if (runTokenRef.current !== token) return;
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
    } catch {
      /* 添付は任意 */
    }
  }

  async function save() {
    const headword = text.trim();
    if (!headword || step === "saving") return;
    // 下見の画面で見出しを手で書き換えられるので、**保存の直前にもう一度見る。**
    // 入口だけ閉じても、途中で書き換えられたら同じ所に戻る。
    if (!isPhrase && !isTargetHeadword(headword, targetLanguage)) {
      setErr(t("input.notTargetLang"));
      return;
    }
    setStep("saving");
    setErr(null);
    try {
      // **仮のカードのまま書き込まない。** 速さを選んで先に画面が出ている
      // ときは、詳しいカードが着くまでここで待つ(理由は `cardPromiseRef`)。
      if (cardPromiseRef.current && !realCardRef.current) {
        const got = await cardPromiseRef.current;
        if (got) setCard(got);
      }
      // 画面を開いた時から温めてある。ここで**短く待つだけ**で、
      // 取れなくてもキャッチは止めない(`use-catch-location.tsx` に理由)。
      const here = await resolveLocation();
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
        } catch {
          /* 画像なしでも保存は続行 */
        }
      } else if (!isPhrase && candidates[picked]) {
        // 仮画像: サーバー経由で取得(CORS回避)→自分のフォルダにアップロード。
        try {
          const cand = candidates[picked];
          // ネットの画像はサーバ経由、AIの生成画像はそのまま。
          // その判断は toImageDataUrl が1箇所で持つ。
          const dataUrl = await toImageDataUrl(cand.url, fetchImageFn);
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
        } catch {
          /* 仮画像は任意 — 失敗しても保存は続行 */
        }
      }

      /** 書き込みに使うカード。**本物が在ればそちら。** */
      const saved = realCardRef.current ?? card;
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
            // **仮ではなく本物を書く。** `setCard` は非同期に効くので、
            // 上で待った結果は `card` にはまだ映っていないことがある。
            reading_zhuyin: dict?.zhuyin || saved?.reading_zhuyin || "",
            pinyin: dict?.pinyin || saved?.pinyin || "",
            meaning_ja: dict?.meaning_ja || saved?.meaning_ja || headword,
            part_of_speech: dict?.pos || saved?.part_of_speech || "名詞",
            level: saved?.level ?? "TOCFL-2",
            category_key: saved?.category_key ?? "other",
            example_sentence: saved?.example_sentence ?? "",
            example_translation: saved?.example_translation ?? "",
            extras: saved?.extras,
            entry_type: "word" as const,
          };

      const res = await saveGhostFn({
        data: {
          word,
          language: targetLanguage,
          capture_type: initialMode === "voice" && canSpeak ? "voice" : "text",
          caption: isPhrase && scene ? scene : null,
          object_path,
          placeholder_path,
          placeholder_credit,
          // **文字・声から拾った語にも場所を残す。** ここは前まで
          // server 側で null を直に書いていたので、この経路の語だけ
          // 地図にも「場所で思い出す」にも出てこなかった。
          location_name: here.name,
          lat: here.lat,
          lng: here.lng,
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
    <div
      className="material-in fixed inset-0 z-50 flex flex-col bg-background/97 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={t("input.title")}
    >
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 pl-1 text-footnote font-medium text-muted-foreground">
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
          <InputCatchFace
            text={text}
            onText={(v) => {
              setText(v);
              // **単語とフレーズで欄を分けない**(オーナー指摘 2026-08-20)。
              // 打つ人にとっては同じ「言葉を入れる」動作で、どちらなのかを
              // 先に決めさせる理由が無い。長さと句読点で自動的に決める。
              setIsPhrase(guessIsPhrase(v));
            }}
            scene={scene}
            onScene={setScene}
            isPhrase={isPhrase}
            error={err}
            loading={step === "loading"}
            onSubmit={lookupAndGenerate}
            showMic={canSpeak && initialMode === "voice"}
            voiceHints={initialMode === "voice" && canSpeak}
            listening={listening}
            onToggleRecord={toggleRecord}
          />
        )}

        {step === "choose" && (
          <div className="space-y-3">
            {/* **どれか1つに決め打ちしない。** 母語の1語が台湾華語では
                別の語に割れるので、違いを添えて並べ、学習者に選ばせる。 */}
            <div>
              <p className="text-headline font-semibold">{t("input.chooseTitle")}</p>
              <p className="ja-phrase mt-1 text-footnote text-muted-foreground">
                {t("input.chooseHint", { q: text.trim() })}
              </p>
            </div>
            <ul className="space-y-2">
              {/* 撮った写真の候補(`capture.tsx` の `PickWordPanel`)と
                  **同じ部品**を使う。ここには「同じ形にする」という注意書きが
                  あっただけで写しが残っており、実際に2つの見た目になっていた。
                  注意書きは写しを1つにしない。 */}
              {wordChoices.map((c) => (
                <li key={c.headword}>
                  <WordCandidateRow
                    headword={c.headword}
                    zhuyin={c.reading_zhuyin}
                    pinyin={c.pinyin}
                    meaning={c.meaning_ja}
                    distinction={c.distinction}
                    onPick={() => {
                      wordChoiceRef.current = c.headword;
                      setText(c.headword);
                      // 候補には**意味と読みが既に入っている**。
                      // 「速い」ではこれで先に画面を出す(要望 #19)。
                      void buildCard(c.headword, c);
                    }}
                    onPronounce={() => void pronounce(c.headword)}
                  />
                </li>
              ))}
            </ul>
            <button
              onClick={() => {
                // **前の選択を忘れる。** 残したまま書き直すと、
                // 新しく書いた語ではなく前に選んだ語でカードを作ってしまう。
                wordChoiceRef.current = null;
                setStep("input");
              }}
              className="min-h-11 w-full rounded-full border border-border bg-card text-body font-medium"
            >
              {t("input.chooseBack")}
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
                <img
                  src={attachedDataUrl}
                  alt={t("sheet.attached")}
                  className="h-full w-full rounded-2xl object-cover shadow-md ring-1 ring-black/5"
                />
              ) : !isPhrase && candidates[picked] ? (
                <img
                  src={candidates[picked].thumb}
                  alt={t("sheet.webImage")}
                  className="h-full w-full rounded-2xl object-cover opacity-90 shadow-md ring-1 ring-black/5"
                />
              ) : (
                <div className="grid h-full w-full place-items-center rounded-2xl border-2 border-dashed border-border bg-secondary/60">
                  <div className="text-center text-muted-foreground">
                    <ImagePlus className="mx-auto h-10 w-10" />
                    <span className="mt-1 block text-caption">{t("input.attach")}</span>
                  </div>
                </div>
              )}
            </button>
            <p className="text-center text-caption text-muted-foreground">
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
                    <img
                      src={c.thumb}
                      alt={t("sheet.candidateN", { n: i + 1 })}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-baseline gap-2">
                <h2 className="text-title font-bold tracking-tight">{text.trim()}</h2>
                {/* **発音ボタン(NORI指定)。** 決める前に音で確かめられる。 */}
                <button
                  onClick={() => void pronounce(text.trim())}
                  aria-label={t("common.playWord", { word: text.trim() })}
                  className="grid h-11 w-11 shrink-0 place-items-center self-center rounded-full bg-primary/10 text-primary-ink active:scale-95 motion-reduce:active:scale-100"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
                {verified ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-caption font-semibold text-emerald-900 ring-1 ring-emerald-200">
                    {t("input.verified")}
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-caption font-semibold text-amber-900 ring-1 ring-amber-200">
                    {t("input.aiGenerated")}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-footnote text-muted-foreground">
                {isPhrase
                  ? pickReading(phonetic, phraseCard?.reading_zhuyin, phraseCard?.pinyin)
                  : pickReading(
                      phonetic,
                      dict?.zhuyin || card?.reading_zhuyin,
                      dict?.pinyin || card?.pinyin,
                    )}
              </p>
              <p className="mt-2 text-body font-medium">
                {isPhrase ? phraseCard?.meaning_ja : dict?.meaning_ja || card?.meaning_ja}
              </p>

              {isPhrase && phraseCard && (
                <div className="mt-3 border-t border-border pt-3">
                  {scene && (
                    <p className="text-footnote text-muted-foreground">
                      {t("sheet.scene", { s: scene })}
                    </p>
                  )}
                  <p className="mt-1 text-footnote font-semibold text-muted-foreground">
                    {t("input.replies")}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {phraseCard.replies.map((r, i) => (
                      <li key={i} className="rounded-lg bg-secondary/60 px-3 py-1.5 text-body">
                        <Zh>{r.zh}</Zh>{" "}
                        <span className="text-footnote text-muted-foreground">— {r.ja}</span>
                      </li>
                    ))}
                  </ul>
                  {phraseCard.usage_note && (
                    <p className="mt-2 text-footnote text-muted-foreground">
                      {phraseCard.usage_note}
                    </p>
                  )}
                </div>
              )}

              {/* 例文はここに出さない(NORI指定)。**選ぶ前に読む物ではない。**
                  この面は「この語で合っているか」を決める所で、例文まで
                  並べると読む物が増えて決めにくくなる。例文は保存後の
                  単語カードに載るので、失われるものは無い。 */}
            </div>

            {err && (
              <p className="rounded-xl bg-destructive/10 p-2 text-footnote text-destructive-ink">
                {err}
              </p>
            )}

            <button
              onClick={save}
              disabled={step === "saving"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-body font-semibold text-primary-foreground shadow-lg shadow-primary/30 active:scale-95 disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none"
            >
              {step === "saving" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Sparkles className="h-5 w-5" />
              )}
              {t("input.save")}
            </button>
            <p className="text-center text-caption text-muted-foreground">{t("input.saveHint")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 打ち込む面。**この画面はこれまで検査の場面が1つも無かった。**
 *
 * オーナーが2度「単語の文字入力がエラーが出て、機能してない」と言った
 * 画面がここで、そのとき出ていたのは英語の1行(
 * "AI did not return a structured card")だった。
 * **壊れた姿を機械が一度も撮っていなかった**ことと無関係ではない。
 *
 * シートは通信も画面の遷移も持つので、そのままでは場面から描けない。
 * 打ち込む面だけを、通信も状態も持たない部品として出す —
 * 見出しや復習の札で何度もやってきたのと同じ形。
 * これで「空のとき」「打った後」「探している間」「失敗したとき」を
 * 実物のまま撮れる。
 */
export function InputCatchFace({
  text,
  onText,
  scene,
  onScene,
  isPhrase,
  error,
  loading,
  onSubmit,
  showMic,
  voiceHints,
  listening,
  onToggleRecord,
}: {
  text: string;
  onText: (v: string) => void;
  scene: string;
  onScene: (v: string) => void;
  /** 長さと句読点から自動で決まる。状況欄の言い方が変わる。 */
  isPhrase: boolean;
  /** 失敗したときの一言。**必ず読める言葉で**渡すこと。 */
  error: string | null;
  loading: boolean;
  onSubmit: () => void;
  showMic: boolean;
  voiceHints: boolean;
  listening: boolean;
  onToggleRecord: () => void;
}) {
  const t = useT();
  return (
    <div className="mx-auto max-w-sm space-y-4">
      {/* **中央に2行で置くと決めた印を残す**(検査の門が求めている)。
          `text-balance` は行の長さを揃えるので印であると同時に読みやすくなり、
          `ja-phrase` は日本語を**文節で**折る — オーナーの絵では
          「写真がな / くても図鑑に。」と語の途中で割れていた。
          この画面はここまで検査の場面が無く、一度も測られていなかった。 */}
      <p className="ja-phrase text-balance text-center text-body text-muted-foreground">
        {t("input.lead")}
      </p>

      {showMic && (
        <button
          onClick={onToggleRecord}
          disabled={loading}
          className={`lift mx-auto flex h-16 w-16 items-center justify-center rounded-full shadow-xl transition-colors ${
            listening
              ? "bg-bad text-white shadow-bad/30"
              : "bg-primary text-primary-foreground shadow-primary/30"
          }`}
          aria-label={listening ? t("sheet.stopRepeat") : t("sheet.repeat")}
        >
          {listening ? <Square className="h-6 w-6" /> : <Mic className="h-7 w-7" />}
        </button>
      )}
      <p className="ja-phrase text-balance text-center text-caption text-muted-foreground">
        {voiceHints ? (listening ? t("input.listening") : t("input.micHint")) : t("input.textHint")}
      </p>

      {/* **焦点の輪を薄くしない。**
          `ring-primary/40` は実測 1.68:1 で、下限(3:1)の半分ほどしか
          無かった — 打つことが用事そのものの画面で、いま**どちらの欄に
          居るのかが見えない**状態だった。この画面はここまで検査の場面が
          無く、一度も測られていなかった。 */}
      <div className="relative">
        <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder={t("sheet.inputPlaceholder")}
          className="w-full rounded-full border border-border bg-card py-3 pl-9 pr-4 text-body outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-card"
        />
      </div>

      {/* 状況の欄は**単語のときにも出す。**
          母語の1語が台湾華語では別々の語に割れることが多く
          (ティッシュ → 衛生紙 / 面紙)、どれが欲しいかは
          その場の様子を聞かないと決まらない。 */}
      <input
        value={scene}
        onChange={(e) => onScene(e.target.value)}
        placeholder={isPhrase ? t("input.scene") : t("input.sceneWord")}
        className="w-full rounded-xl border border-border bg-secondary/50 p-3 text-body outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-card"
      />

      {/* 失敗の一言。**打った文字は消さない** — 出し直すのに
          もう一度打たせるのは、失敗の上に手間を重ねること。 */}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 p-2 text-footnote text-destructive-ink"
        >
          {error}
        </p>
      )}

      <button
        onClick={onSubmit}
        disabled={!text.trim() || loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-body font-semibold text-primary-foreground shadow-lg shadow-primary/30 active:scale-95 disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
        {loading ? t("input.looking") : t("input.lookup")}
      </button>
    </div>
  );
}
