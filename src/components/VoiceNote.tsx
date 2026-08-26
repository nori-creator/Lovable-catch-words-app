import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mic, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { setStickerVoiceVideo } from "@/lib/stickers.functions";
import {
  MAX_VOICE_NOTE_MS,
  isTooBig,
  pickAudioMime,
  remainingSeconds,
  voiceNoteConstraints,
} from "@/lib/voice-note";
import { uploadVoiceNote } from "@/lib/voice-note-upload";

/**
 * その札に添える**一言の録音**。
 *
 * オーナー(2026-08-26): 「一言は**音声だけ**にして。動画の撮影はやめて。
 *  すでに撮ってあるものは音として再生して。**再生ボタンは真ん中**、
 *  日付と場所の名前の隣に置いて」
 *
 * ## 聞く所はここに無い
 * 再生は `VoiceNotePlayer` が持ち、**日付と場所の行の真ん中**に立っている。
 * ここに同じ再生を並べない — この作業場で何度も起きているのは、同じ物が
 * 2箇所にあって片方だけ直る事故で、いちばん避けたい形がそれ。
 * ここは**録る所**に徹する。
 *
 * ## キャッチの保存経路には入れない
 * オーナーが「最大のペイン」と書いたのは「一瞬でも早く」で、キャッチの
 * 保存はその本体。あそこに録音を挟むと、いちばん壊してはいけない所が
 * 遅くなる。**保存が終わったカードから**開く。
 * (キャッチの最中に声で残す道は別に在る — `VoiceCaptionButton`。
 *  あちらは一言の欄の隣に立っていて、保存の前に何も待たせない。)
 *
 * ## カメラを掴まない
 * 音だけになったので、カメラの許可も内カメラのランプも無くなった。
 * 道端で残す物なので、そこが軽いほうがいい。
 *
 * ## 上限は `voice-note.ts` が持つ
 * 「止める側」と「長すぎると断る側」が別々の数字を持つと、録れたのに
 * 保存できない回ができる。
 *
 * ## 移行が当たっていなくても壊さない
 * 列がまだ無い環境では保存だけが失敗する。カードの閲覧まで巻き込まない
 * (`setStickerVoiceVideo` が `saved:false` を返す)。
 * 列の名前が `voice_video_url` のままなのは `voice-note.ts` の注のとおり。
 */
export function VoiceNote({
  stickerId,
  audioUrl,
}: {
  stickerId: string;
  /** すでに残してある一言(署名付きURL)。無ければ録る前。 */
  audioUrl?: string | null;
}) {
  const t = useT();
  const qc = useQueryClient();
  const saveFn = useServerFn(setStickerVoiceVideo);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [left, setLeft] = useState(remainingSeconds(0));
  const [busy, setBusy] = useState(false);

  // **開いたままの機材を必ず返す。** 止め忘れるとマイクを掴んだままになり、
  // 端末によっては次に開いたときに掴めなくなる。
  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  async function start() {
    if (recording || busy) return;
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
      rec.onstop = () => void upload(new Blob(chunksRef.current, { type: mime }), mime);
      rec.start();
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      setRecording(true);
      setLeft(remainingSeconds(0));
      // 残りを**録りながら**言う。上限があることを録る前に説明しない。
      tickRef.current = setInterval(
        () => setLeft(remainingSeconds(Date.now() - startedAtRef.current)),
        250,
      );
      // 上限で自動的に止める。止め忘れても費用が伸びない。
      stopTimerRef.current = setTimeout(stop, MAX_VOICE_NOTE_MS);
    } catch {
      toast.error(t("voice.noMic"));
      cleanup();
    }
  }

  function stop() {
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

  function cleanup() {
    stop();
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }

  async function upload(blob: Blob, mime: string) {
    cleanup();
    if (blob.size === 0) return;
    if (isTooBig(blob.size)) {
      toast.error(t("voice.tooBig"));
      return;
    }
    setBusy(true);
    try {
      // 置き場所の決め方は `voice-note-upload.ts` が唯一の正。
      // キャッチの経路と同じ道を通る(片方だけ直る事故を作らない)。
      const path = await uploadVoiceNote({ blob, mime, stickerId });
      const res = await saveFn({ data: { sticker_id: stickerId, voice_video_path: path } });
      if (!res.saved) {
        toast.error(t("voice.needsMigration"));
        return;
      }
      await qc.invalidateQueries({ queryKey: ["sticker", stickerId] });
      toast.success(t("voice.saved"));
    } catch (e) {
      console.warn("voice note upload failed", e);
      toast.error(t("voice.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    // **必ず訊く。** 録り直せない一言なので、取り消しがない。
    if (!window.confirm(t("voice.confirmDelete"))) return;
    setBusy(true);
    try {
      const res = await saveFn({ data: { sticker_id: stickerId, voice_video_path: null } });
      if (!res.saved) {
        toast.error(t("voice.needsMigration"));
        return;
      }
      await qc.invalidateQueries({ queryKey: ["sticker", stickerId] });
    } catch {
      toast.error(t("voice.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-3 rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-footnote font-semibold">{t("voice.title")}</h3>
        {audioUrl && !recording && (
          <button
            onClick={() => void remove()}
            disabled={busy}
            aria-label={t("voice.delete")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {recording ? (
        <>
          {/* 録っている最中。**画が無いぶん、録れていることを字で言う。**
              赤い点が息をしていないと、押したのに動いていないように見える。 */}
          <p
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-destructive/10 py-3 text-footnote font-semibold text-destructive-ink"
            aria-live="polite"
          >
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-destructive" />
            {t("voice.recording")}
          </p>
          <button
            onClick={stop}
            className="press-in mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-destructive px-4 text-footnote font-semibold text-destructive-foreground"
          >
            <Square className="h-4 w-4" aria-hidden />
            {t("voice.stop", { n: String(left) })}
          </button>
        </>
      ) : (
        <>
          {/* 既に在るときは説明を出さない。**聞く所は日付と場所の行に在る** —
              ここに同じ再生を並べると、片方だけ直る事故の種になる。 */}
          <p className="mt-1 text-caption text-muted-foreground">
            {audioUrl ? t("voice.playHint") : t("voice.hint")}
          </p>
          <button
            onClick={() => void start()}
            disabled={busy}
            className={`press-in mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-footnote font-semibold ${
              audioUrl ? "border border-border font-medium" : "bg-primary text-primary-foreground"
            }`}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Mic className="h-4 w-4" aria-hidden />
            )}
            {audioUrl ? t("voice.retake") : t("voice.record")}
          </button>
        </>
      )}
    </section>
  );
}
