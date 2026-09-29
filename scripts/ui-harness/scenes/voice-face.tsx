import { useEffect, useRef, useState } from "react";
import { Camera, Check, Mic, Square, Trash2, Volume2 } from "lucide-react";

/**
 * **自分の声と顔で学ぶ — 試作**（オーナー指示 R11「声と顔の試作を同時に開始（最新AI調査:
 * Google の声・Seedance の顔）」。計画は `docs/personal-avatar-plan.md`）。
 *
 * 流れ（全部この端末の中だけ。**どこにも送らない**試作）:
 *  1. 同意 — 何に使うか・どこへ送るか・いつ消すか。初期値は「使わない」。
 *  2. 声 — 決まった文を**10秒**読む（Google Chirp 3: Instant Custom Voice が求める長さ）。
 *     録った声はその場で聞き直せる。単語の発音で「ネイティブ / 自分の声」を切り替える所まで。
 *     ※ 自分の声で**新しい文を読ませる**のは Google の許可制（allowlist）の機能で、許可が
 *       下りるまで本物は作れない。ここでは録った声をそのまま鳴らして流れだけ見せる。
 *  3. 顔 — 正面の写真を1枚。単語の絵に「自分」が出てくる所の見本（本物は Seedance / Higgsfield
 *     の参照画像つき生成。1枚ごとに費用がかかる）。
 *  4. 消す — 声と顔をこの場で全部消せる。
 */
const READ_LINE = "我同意用我的聲音建立語音。今天天氣很好，我們去夜市吃珍珠奶茶吧！";

type Step = "consent" | "voice" | "face" | "done";

export function VoiceFaceScene() {
  const [step, setStep] = useState<Step>("consent");
  const [agree, setAgree] = useState(false);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [faceUrl, setFaceUrl] = useState<string | null>(null);
  const wipe = () => {
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    if (faceUrl) URL.revokeObjectURL(faceUrl);
    setVoiceUrl(null);
    setFaceUrl(null);
    setAgree(false);
    setStep("consent");
  };
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 pb-16 pt-20">
      <Steps step={step} />
      {step === "consent" && (
        <section className="space-y-3 rounded-3xl bg-card p-5 shadow">
          <h1 className="text-title2 font-bold">自分の声と顔で覚える（試作）</h1>
          <ul className="list-disc space-y-1.5 pl-5 text-footnote text-muted-foreground">
            <li>声: 10秒の読み上げから、あなたの声で単語と例文を聞けるようにします。</li>
            <li>顔: 正面の写真1枚から、単語の絵にあなたが出てくるようにします。</li>
            <li>
              作るときだけ、声は Google（Cloud Text-to-Speech）、顔は画像を作るサービスへ送ります。
            </li>
            <li>録音と写真は作り終えたら消します。設定からいつでも全部消せます。</li>
            <li>ネイティブの発音は消しません（切り替えて聞けます）。</li>
          </ul>
          <label className="flex min-h-11 items-center gap-3 rounded-2xl bg-secondary px-4">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="h-5 w-5"
            />
            <span className="text-body font-semibold">上の内容に同意して使う</span>
          </label>
          <button
            type="button"
            disabled={!agree}
            onClick={() => setStep("voice")}
            className="h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-40"
          >
            はじめる
          </button>
          <p className="text-center text-caption text-muted-foreground">
            使わない場合はこのまま閉じてください
          </p>
        </section>
      )}
      {step === "voice" && (
        <VoiceStep
          url={voiceUrl}
          onRecorded={(u) => {
            if (voiceUrl) URL.revokeObjectURL(voiceUrl);
            setVoiceUrl(u);
          }}
          onNext={() => setStep("face")}
        />
      )}
      {step === "face" && (
        <FaceStep
          url={faceUrl}
          onPicked={(u) => {
            if (faceUrl) URL.revokeObjectURL(faceUrl);
            setFaceUrl(u);
          }}
          onNext={() => setStep("done")}
        />
      )}
      {step === "done" && <Result voiceUrl={voiceUrl} faceUrl={faceUrl} onWipe={wipe} />}
    </div>
  );
}

function Steps({ step }: { step: Step }) {
  const all: Step[] = ["consent", "voice", "face", "done"];
  const i = all.indexOf(step);
  return (
    <div className="flex gap-1.5" aria-label={`${i + 1} / 4`}>
      {all.map((s, k) => (
        <span
          key={s}
          className="h-1.5 flex-1 rounded-full"
          style={{ background: k <= i ? "var(--primary)" : "var(--secondary)" }}
        />
      ))}
    </div>
  );
}

function VoiceStep({
  url,
  onRecorded,
  onNext,
}: {
  url: string | null;
  onRecorded: (url: string) => void;
  onNext: () => void;
}) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [left, setLeft] = useState(10);
  const [level, setLevel] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const stopRef = useRef<() => void>(() => {});
  useEffect(() => () => stopRef.current(), []);
  const start = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      // 声の大きさの目盛り（静かすぎ・大きすぎが分かる）。
      const ac = new AudioContext();
      const an = ac.createAnalyser();
      ac.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      let raf = 0;
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(peak / 128);
        raf = requestAnimationFrame(tick);
      };
      tick();
      const t0 = performance.now();
      const timer = window.setInterval(() => {
        const l = Math.max(0, 10 - Math.floor((performance.now() - t0) / 1000));
        setLeft(l);
        if (l === 0) r.stop();
      }, 200);
      stopRef.current = () => {
        window.clearInterval(timer);
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        void ac.close();
      };
      r.onstop = () => {
        stopRef.current();
        setRec(null);
        onRecorded(URL.createObjectURL(new Blob(chunks, { type: r.mimeType })));
      };
      r.start();
      setRec(r);
    } catch {
      setErr("マイクが使えません（端末の設定でマイクを許可してください）");
    }
  };
  return (
    <section className="space-y-3 rounded-3xl bg-card p-5 shadow">
      <h2 className="text-title3 font-bold">声を録る（10秒）</h2>
      <p className="text-footnote text-muted-foreground">
        静かな所で、次の文を自然な速さで読んでください。
      </p>
      <p
        lang="zh-Hant"
        className="rounded-2xl bg-secondary p-4 text-body font-semibold leading-relaxed"
      >
        {READ_LINE}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.round(level * 100)}%`,
            background: level > 0.9 ? "#ff453a" : "var(--primary)",
            transition: "width 80ms linear",
          }}
        />
      </div>
      {rec ? (
        <button
          type="button"
          onClick={() => rec.stop()}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-destructive font-semibold text-white"
        >
          <Square className="h-4 w-4" /> 止める（あと {left} 秒）
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void start()}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground"
        >
          <Mic className="h-5 w-5" /> {url ? "録り直す" : "録音をはじめる"}
        </button>
      )}
      {err && <p className="text-footnote text-destructive-ink">{err}</p>}
      {url && (
        <>
          <audio src={url} controls className="w-full" />
          <button
            type="button"
            onClick={onNext}
            className="h-12 w-full rounded-full bg-secondary font-semibold"
          >
            次へ（顔）
          </button>
        </>
      )}
    </section>
  );
}

function FaceStep({
  url,
  onPicked,
  onNext,
}: {
  url: string | null;
  onPicked: (url: string) => void;
  onNext: () => void;
}) {
  return (
    <section className="space-y-3 rounded-3xl bg-card p-5 shadow">
      <h2 className="text-title3 font-bold">顔の写真（正面・1枚）</h2>
      <p className="text-footnote text-muted-foreground">
        明るい所で、正面から。帽子・サングラスは外してください。本人の写真だけ使えます。
      </p>
      <label className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground">
        <Camera className="h-5 w-5" /> {url ? "撮り直す" : "撮る"}
        <input
          type="file"
          accept="image/*"
          capture="user"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPicked(URL.createObjectURL(f));
          }}
        />
      </label>
      {url && (
        <>
          <img
            src={url}
            alt="あなたの写真"
            className="mx-auto h-48 w-48 rounded-full object-cover"
          />
          <button
            type="button"
            onClick={onNext}
            className="h-12 w-full rounded-full bg-secondary font-semibold"
          >
            できあがりを見る
          </button>
        </>
      )}
    </section>
  );
}

function Result({
  voiceUrl,
  faceUrl,
  onWipe,
}: {
  voiceUrl: string | null;
  faceUrl: string | null;
  onWipe: () => void;
}) {
  const [who, setWho] = useState<"native" | "me">("me");
  const play = () => {
    if (who === "me" && voiceUrl) void new Audio(voiceUrl).play();
    else {
      const u = new SpeechSynthesisUtterance("雨傘");
      u.lang = "zh-TW";
      speechSynthesis.speak(u);
    }
  };
  return (
    <section className="space-y-4 rounded-3xl bg-card p-5 shadow">
      <h2 className="flex items-center gap-2 text-title3 font-bold">
        <Check className="h-5 w-5 text-primary" /> 単語の詳細での見え方
      </h2>
      {/* 単語の絵に「自分」が出てくる見本（本物は参照画像つきの生成で作る）。 */}
      <div className="relative mx-auto aspect-square w-56 overflow-hidden rounded-3xl bg-gradient-to-b from-sky-200 to-sky-50 shadow-inner">
        <div className="absolute inset-x-0 top-6 text-center text-5xl" aria-hidden>
          ☂️
        </div>
        {faceUrl && (
          <img
            src={faceUrl}
            alt=""
            className="absolute bottom-6 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full border-4 border-white object-cover shadow-lg"
          />
        )}
        <span className="absolute bottom-2 right-3 rounded-full bg-black/55 px-2 py-0.5 text-caption text-white">
          見本
        </span>
      </div>
      <div className="text-center">
        <div lang="zh-Hant" className="text-title1 font-bold">
          雨傘
        </div>
        <div className="text-footnote text-muted-foreground">ㄩˇ ㄙㄢˇ · かさ</div>
      </div>
      <div className="flex rounded-full bg-secondary p-1" role="radiogroup" aria-label="発音の声">
        {(["native", "me"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={who === k}
            onClick={() => setWho(k)}
            className="h-10 flex-1 rounded-full text-footnote font-semibold"
            style={{ background: who === k ? "var(--card)" : "transparent" }}
          >
            {k === "native" ? "ネイティブ" : "自分の声"}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={play}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground"
      >
        <Volume2 className="h-5 w-5" /> 聞く
      </button>
      <p className="text-caption text-muted-foreground">
        試作では「自分の声」は録った声をそのまま鳴らします。単語や例文を自分の声で読むのは、Google
        の許可（申請制）が下りてから本物に切り替えます。
      </p>
      <button
        type="button"
        onClick={onWipe}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-full text-footnote font-semibold text-destructive-ink"
      >
        <Trash2 className="h-4 w-4" /> 声と顔を全部消す
      </button>
    </section>
  );
}
