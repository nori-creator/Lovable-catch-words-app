import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Video, Square, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { setStickerVoiceVideo } from "@/lib/stickers.functions";
import {
  MAX_VOICE_VIDEO_MS,
  isTooBig,
  pickVideoMime,
  remainingSeconds,
  voiceVideoConstraints,
  voiceVideoPath,
} from "@/lib/voice-video";

/**
 * その札に添える**一言の自撮り動画**。
 *
 * オーナー(2026-08-21): 「動画は supabase に上げる **B案**」
 *
 * ## キャッチの保存経路には入れない
 * オーナーが「最大のペイン」と書いたのは「一瞬でも早く」で、キャッチの
 * 保存はその本体。あそこに録画を挟むと、いちばん壊してはいけない所が
 * 遅くなる。**保存が終わったカードから**開く。
 *
 * ## 音を入れる
 * 復習の録画は `audio: false`。あれはマイクを掴むと `SpeechRecognition` が
 * 黙るからで、**こちらには音声認識が走っていない**。一言は声が本体。
 *
 * ## 上限は `voice-video.ts` が持つ
 * 「止める側」と「長すぎると断る側」が別々の数字を持つと、撮れたのに
 * 保存できない回ができる。
 *
 * ## 移行が当たっていなくても壊さない
 * 列がまだ無い環境では保存だけが失敗する。カードの閲覧まで巻き込まない
 * (`setStickerVoiceVideo` が `saved:false` を返す)。
 */
export function VoiceVideoNote({
  stickerId,
  videoUrl,
}: {
  stickerId: string;
  /** すでに撮ってある一言(署名付きURL)。無ければ撮る前。 */
  videoUrl?: string | null;
}) {
  const t = useT();
  const qc = useQueryClient();
  const saveFn = useServerFn(setStickerVoiceVideo);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [left, setLeft] = useState(remainingSeconds(0));
  const [busy, setBusy] = useState(false);

  // **開いたままの機材を必ず返す。** 止め忘れるとカメラのランプが
  // 点いたまま残り、次に開いたときに掴めなくなる端末がある。
  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  async function start() {
    if (recording || busy) return;
    const mime = pickVideoMime((type) => MediaRecorder.isTypeSupported(type));
    if (!mime) {
      toast.error(t("voice.unsupported"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(voiceVideoConstraints());
      streamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        // **自分の声を自分に返さない。** 撮っている最中に音が回る。
        previewRef.current.muted = true;
        void previewRef.current.play().catch(() => {});
      }
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => void upload(new Blob(chunksRef.current, { type: mime }), mime);
      rec.start();
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      setRecording(true);
      setLeft(remainingSeconds(0));
      // 残りを**撮りながら**言う。上限があることを撮る前に説明しない。
      tickRef.current = setInterval(
        () => setLeft(remainingSeconds(Date.now() - startedAtRef.current)),
        250,
      );
      // 上限で自動的に止める。指を離し忘れても費用が伸びない。
      stopTimerRef.current = setTimeout(stop, MAX_VOICE_VIDEO_MS);
    } catch {
      toast.error(t("voice.noCamera"));
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
    if (previewRef.current) previewRef.current.srcObject = null;
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
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("no user");
      const path = voiceVideoPath(userId, stickerId, mime);
      const { error } = await supabase.storage.from("stickers").upload(path, blob, {
        contentType: mime,
        // **撮り直しは上書き。** 札ごとに1本なので、古いものを残さない
        // (残すと消せない物が増え続ける)。
        upsert: true,
      });
      if (error) throw error;
      const res = await saveFn({ data: { sticker_id: stickerId, voice_video_path: path } });
      if (!res.saved) {
        toast.error(t("voice.needsMigration"));
        return;
      }
      await qc.invalidateQueries({ queryKey: ["sticker", stickerId] });
      toast.success(t("voice.saved"));
    } catch (e) {
      console.warn("voice video upload failed", e);
      toast.error(t("voice.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    // **必ず訊く。** 撮り直せない一言なので、取り消しがない。
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
        {videoUrl && !recording && (
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
          {/* 撮っている最中の自分。**鏡にする** — 自撮りは鏡像のほうが
              自分の向きと合う(内カメラの見え方に合わせる)。 */}
          <video
            ref={previewRef}
            playsInline
            muted
            className="mt-2 aspect-[3/4] w-full rounded-xl bg-black object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          <button
            onClick={stop}
            className="press-in mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-destructive px-4 text-footnote font-semibold text-destructive-foreground"
          >
            <Square className="h-4 w-4" aria-hidden />
            {t("voice.stop", { n: String(left) })}
          </button>
        </>
      ) : videoUrl ? (
        <>
          {/* 撮ったもの。**自動で再生しない** — 図鑑を開くたび声が鳴る。 */}
          <video
            src={videoUrl}
            controls
            playsInline
            preload="metadata"
            className="mt-2 aspect-[3/4] w-full rounded-xl bg-black object-cover"
          />
          <button
            onClick={() => void start()}
            disabled={busy}
            className="press-in mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border px-4 text-footnote font-medium"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Video className="h-4 w-4" aria-hidden />
            )}
            {t("voice.retake")}
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-caption text-muted-foreground">{t("voice.hint")}</p>
          <button
            onClick={() => void start()}
            disabled={busy}
            className="press-in mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-footnote font-semibold text-primary-foreground"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Video className="h-4 w-4" aria-hidden />
            )}
            {t("voice.record")}
          </button>
        </>
      )}
    </section>
  );
}
