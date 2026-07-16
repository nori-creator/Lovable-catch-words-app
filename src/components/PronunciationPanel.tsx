import { useEffect, useRef, useState } from "react";
import { Volume2, Mic, Square, Loader2, CheckCircle2 } from "lucide-react";

type Props = {
  headword: string;
  pinyin?: string | null;
  zhuyin?: string | null;
  /** Slow rate for learners (true) vs natural (false) */
};

/**
 * Speech APIs are browser-only. We feature-detect and gracefully degrade.
 * TTS: window.speechSynthesis with zh-TW voice preference.
 * STT: window.SpeechRecognition / webkitSpeechRecognition with cmn-Hant-TW.
 *
 * Upgrade path (commented intentionally): swap `speak()` for a server fn that
 * calls Google Cloud TTS (cmn-TW Wavenet) when a GOOGLE_TTS_API_KEY secret is added.
 */
export function PronunciationPanel({ headword, pinyin, zhuyin }: Props) {
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const recogRef = useRef<unknown>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const pickVoice = () => {
    const prefs = ["zh-TW", "zh-Hant", "cmn-Hant-TW", "zh-HK", "zh-CN"];
    for (const p of prefs) {
      const v = voices.find((vo) => vo.lang.toLowerCase().startsWith(p.toLowerCase()));
      if (v) return v;
    }
    return voices.find((v) => v.lang.toLowerCase().startsWith("zh"));
  };

  const speak = (slow = false) => {
    if (!("speechSynthesis" in window)) {
      setError("このブラウザは音声合成に対応していません");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(headword);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang ?? "zh-TW";
    u.rate = slow ? 0.7 : 0.95;
    u.pitch = 1;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  const startListen = () => {
    setError(null);
    setHeard(null);
    setScore(null);
    const SR =
      (window as unknown as { SpeechRecognition?: new () => unknown }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
    if (!SR) {
      setError("このブラウザは音声認識に対応していません（iOS Safari / Chrome 推奨）");
      return;
    }
    const rec = new SR() as {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      continuous: boolean;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onerror: (e: { error: string }) => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    };
    rec.lang = "cmn-Hant-TW";
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.continuous = false;
    rec.onresult = (e) => {
      const alts: string[] = [];
      const first = e.results[0];
      for (let i = 0; i < (first as ArrayLike<unknown>).length; i++) {
        alts.push(first[i].transcript);
      }
      const best = alts.reduce(
        (acc, t) => {
          const s = scoreSimilarity(headword, normalize(t));
          return s > acc.s ? { s, t } : acc;
        },
        { s: 0, t: alts[0] ?? "" },
      );
      setHeard(best.t);
      setScore(Math.round(best.s * 100));
      setListening(false);
    };
    rec.onerror = (e) => {
      setError(`認識エラー: ${e.error}`);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
      recogRef.current = rec;
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const stopListen = () => {
    const rec = recogRef.current as { stop: () => void } | null;
    rec?.stop?.();
    setListening(false);
  };

  const scoreColor =
    score == null ? "" : score >= 85 ? "text-emerald-600" : score >= 60 ? "text-amber-600" : "text-rose-600";

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">発音練習</h3>
          <p className="text-[11px] text-muted-foreground">{zhuyin ?? pinyin ?? ""}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => speak(false)}
            className="lift inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30"
            aria-label="自然な速度で再生"
          >
            {speaking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => speak(true)}
            className="lift inline-flex h-10 items-center justify-center rounded-full border border-border bg-background px-3 text-xs"
          >
            ゆっくり
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={listening ? stopListen : startListen}
          className={`lift inline-flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg ${
            listening ? "bg-destructive pulse-ring" : "bg-primary shadow-primary/30"
          }`}
          aria-label={listening ? "録音停止" : "発音を録音"}
        >
          {listening ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
        <div className="flex-1 text-sm">
          {listening ? (
            <span className="text-muted-foreground">聞き取り中…「{headword}」と言ってみて</span>
          ) : heard ? (
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">あなたの発音</div>
              <div className="font-medium">{heard}</div>
            </div>
          ) : (
            <span className="text-muted-foreground">マイクを押して「{headword}」と発音</span>
          )}
        </div>
        {score !== null && (
          <div className={`text-right ${scoreColor}`}>
            <div className="flex items-center gap-1 text-2xl font-bold">
              {score >= 85 && <CheckCircle2 className="h-5 w-5" />}
              {score}
            </div>
            <div className="text-[10px] text-muted-foreground">スコア</div>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}

/** Normalize CJK text: strip punctuation/whitespace. */
function normalize(s: string): string {
  return s.replace(/[\s\p{P}\p{S}]/gu, "").trim();
}

/**
 * Similarity score 0..1 between target and recognized text.
 * Combines (a) exact-char overlap ratio, (b) order-aware LCS ratio.
 * Both weighted to be lenient on tones but strict on character identity.
 */
function scoreSimilarity(target: string, heard: string): number {
  const a = normalize(target);
  const b = normalize(heard);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const lcs = longestCommonSubseq(a, b);
  const lcsScore = lcs / Math.max(a.length, b.length);
  const overlap = [...a].filter((c) => b.includes(c)).length / a.length;
  return Math.min(1, 0.6 * lcsScore + 0.4 * overlap);
}

function longestCommonSubseq(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}
