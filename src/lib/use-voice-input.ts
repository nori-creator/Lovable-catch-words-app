import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 声で打ち込む。**認識した言葉を、渡された欄へ流し込むだけ。**
 *
 * ## なぜ部品にしたか（2026-09-16）
 * これはスキャン画面の検索欄の中に直に書かれていた。オーナー指示で
 * その欄を畳んだとき（「スキャンボタン押したら下の検索や調べるボタンは
 * すべて要らない」）、**声で調べる道も一緒に消えるところだった** —
 * 欄を消しただけなのに、機能が1つ黙って無くなる形。
 *
 * 出す場所は変わっても、聞き取りの作り方は同じ。ここに1つ置いて、
 * 撮り方の「検索」から使う。
 *
 * `SpeechRecognition` は標準に無い（Chrome/Safari の拡張）。型が無いので
 * その場で必要な形だけ書く — `any` は使わない。
 */

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: (e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};

/** この端末で声が使えるか。使えない端末に動かない釦を置かないため。 */
export function voiceInputAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

export function useVoiceInput({
  lang,
  onText,
  onUnavailable,
}: {
  /** 何語として聞くか（例: 台湾華語なら `cmn-Hant-TW`）。 */
  lang: string;
  /** 聞き取れた言葉。**途中の結果も来る**ので、欄をそのまま置き換える。 */
  onText: (text: string) => void;
  /** この端末で使えなかったとき。 */
  onUnavailable?: () => void;
}) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  // 画面を離れるときは必ず止める。止め忘れると、別の画面に移ってからも
  // 端末のマイクが開いたままになる。
  useEffect(() => () => recRef.current?.stop(), []);

  const toggle = useCallback(() => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      onUnavailable?.();
      return;
    }
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      onTextRef.current(text.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }, [listening, lang, onUnavailable]);

  return { listening, toggle, available: voiceInputAvailable() };
}
