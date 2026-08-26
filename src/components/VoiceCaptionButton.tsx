import { useEffect, useRef, useState } from "react";
import { Check, Mic, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import {
  MAX_VOICE_NOTE_MS,
  pickAudioMime,
  remainingSeconds,
  voiceNoteConstraints,
} from "@/lib/voice-note";

/** 録れた一言。**まだ上げていない** — 札が出来てから裏で上げる。 */
export type RecordedNote = { blob: Blob; mime: string };

/**
 * キャッチの最中に、一言を**声で**吹き込むボタン。
 *
 * オーナー(2026-08-26): 「キャッチのときに一言を声で吹き込めるように。
 *  **文字入力の隣にボタン**を置いて」
 *
 * ## なぜ文字の欄の隣なのか
 * 一言は「文字で書く」か「声で言う」かの**同じ用事の2つの言い方**で、
 * 別の場所に置くと別の機能に見える。歩きながら、手袋をしたまま、
 * 荷物を持ったまま — 文字が打てない場面ほど一言は残したくなる。
 *
 * ## 保存を1ミリ秒も遅くしない
 * オーナーが「最大のペイン」と書いたのは「一瞬でも早く」で、キャッチの
 * 保存はその本体。だからここは**録るだけ**で、上げも結び付けもしない。
 * 録れた物を親に渡し、親は**札が出来てから裏で**上げる
 * (`voice-note-upload.ts`)。押していない人には何の負担も無い。
 *
 * ## 上限は `voice-note.ts` が持つ
 * 「止める側」と「長すぎると断る側」が別々の数字を持つと、録れたのに
 * 保存できない回ができる。
 */
export function VoiceCaptionButton({
  value,
  onChange,
  disabled,
}: {
  /** 録れている一言。無ければまだ録っていない。 */
  value: RecordedNote | null;
  onChange: (note: RecordedNote | null) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [left, setLeft] = useState(remainingSeconds(0));

  // **開いたままの機材を必ず返す。** キャッチの面は途中で閉じられるので、
  // ここを怠るとマイクを掴んだまま次の画面へ行く。
  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  function finish() {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    stopTimerRef.current = null;
    tickRef.current = null;
    try {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    } catch {
      /* 既に止まっていることがある */
    }
    setRecording(false);
  }

  async function start() {
    if (recording || disabled) return;
    const mime = pickAudioMime((type) => MediaRecorder.isTypeSupported(type));
    if (!mime) {
      toast.error(t("voice.unsupported"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(voiceNoteConstraints());
      streamRef.current = stream;
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        streamRef.current?.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mime });
        // 何も入っていない録音を「録れた」と言わない。
        onChange(blob.size > 0 ? { blob, mime } : null);
      };
      rec.start();
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      setRecording(true);
      setLeft(remainingSeconds(0));
      tickRef.current = setInterval(
        () => setLeft(remainingSeconds(Date.now() - startedAtRef.current)),
        250,
      );
      stopTimerRef.current = setTimeout(finish, MAX_VOICE_NOTE_MS);
    } catch {
      toast.error(t("voice.noMic"));
      finish();
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
  }

  if (recording) {
    return (
      <button
        type="button"
        onClick={finish}
        aria-label={t("voice.stop", { n: String(left) })}
        className="press-in inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-destructive px-3 text-footnote font-semibold text-destructive-foreground"
      >
        <Square className="h-4 w-4" aria-hidden />
        {left}
      </button>
    );
  }

  if (value) {
    // **「録れた」と「捨てる」を1つのボタンにしない。**
    // ゴミ箱の絵に「録れました」と書くと、押したら何が起きるのか読めない
    // (押すと消える)。報せは報せ、押す物は押す物として分ける。
    return (
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span className="inline-flex items-center gap-1 text-caption font-semibold text-primary-ink">
          <Check className="h-3.5 w-3.5" aria-hidden />
          {t("voice.recorded")}
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={t("voice.discard")}
          className="press-in grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={disabled}
      aria-label={t("voice.speak")}
      className="press-in grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-card text-primary-ink disabled:opacity-60"
    >
      <Mic className="h-4 w-4" aria-hidden />
    </button>
  );
}
