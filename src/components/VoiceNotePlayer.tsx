import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * その札に残した**一言を聞く**ボタン。
 *
 * オーナー(2026-08-26): 「再生ボタンは**真ん中**、日付と場所の名前の隣に
 *  置いて」
 *
 * ## なぜ日付と場所の間なのか
 * 一言は「**いつ・どこで**出会って、そのとき何を思ったか」の3つ目で、
 * 前の2つと同じ行に並ぶのが素直。前は下のほうの独立した節にあって、
 * 声を残したこと自体を忘れる置き場所だった。
 *
 * ## 動画でも鳴る
 * `<audio>` は動画のファイルを渡されても音の道だけを鳴らす。
 * 2026-08-26 より前に撮った自撮り動画は、**何もしなくてもそのまま聞ける**
 * (`voice-note.ts` の注)。
 *
 * ## 自動で再生しない
 * 図鑑を開くたびに声が鳴ると、人前で開けないアプリになる。
 * 押したときだけ鳴らす。
 */
export function VoiceNotePlayer({ url }: { url: string }) {
  const t = useT();
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  // **別の札に移ったら止める。** 同じ面を使い回すので、止めないと
  // 前の札の声が鳴ったまま次の語が出る。
  useEffect(() => {
    const el = ref.current;
    return () => {
      el?.pause();
    };
  }, [url]);

  function toggle() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  }

  return (
    <>
      <button
        onClick={toggle}
        aria-label={t(playing ? "voice.pause" : "voice.play")}
        className="press-in grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
      >
        {playing ? (
          <Pause className="h-4 w-4" aria-hidden />
        ) : (
          // **三角は左に重心が寄る。** 円の真ん中に置くと左に見えるので
          // 半文字ぶん右へ寄せる(Apple/Google の再生ボタンも同じ扱い)。
          <Play className="h-4 w-4 translate-x-px" aria-hidden />
        )}
      </button>
      {/* 状態は**音の側**から受け取る。自前の真偽値だけで持つと、
          鳴り終わったのに「止める」のままになる。 */}
      <audio
        ref={ref}
        src={url}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
    </>
  );
}
