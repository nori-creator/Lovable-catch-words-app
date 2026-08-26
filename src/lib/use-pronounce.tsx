import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useServerFn } from "@tanstack/react-start";
import { synthesizeSpeech } from "@/lib/tts.functions";
import { speak } from "@/lib/speak";
import { claimAudio, primeAudio } from "@/lib/audio";
import { DEFAULT_TARGET_LANGUAGE } from "@/lib/target-lang";
import {
  audioCacheKey,
  getCachedAudio,
  markSpeechReady,
  putCachedAudio,
  setSpeechState,
  speechState,
  speechUrl,
  subscribeSpeech,
  type SpeechState,
} from "@/lib/tts-store";

/**
 * 正しい発音を、**待たせずに**鳴らす。
 *
 * ネイティブの声(Google Cloud TTS の cmn-TW / en-US)をサーバで1度だけ
 * 合成し、以後は同じ mp3 を全員に配る。どの端末でも同じ発音になる
 * — 端末の声は、サーバの合成が使えないときだけの控え。
 *
 * ## 端末の中に貯める(オーナー指摘 2026-08-26)
 * > 「音声ボタンを押しても発音がすぐに聞こえないのがストレスだから、
 * >  ラグが長すぎる。過去に調べた発音は端末内に保存し…」
 *
 * 押してから鳴るまでの往復を **3回 → 0回** にした。何が遅かったかは
 * `tts-store.ts` の注に書いてある。要点は「サーバ側のキャッシュ」と
 * 「端末に音が在ること」は別物だ、ということ。
 *
 * ## 出来てからボタンを出す
 * > 「新しく音声を生成する場合は、発音がでるようになってから
 * >  発音ボタンを表示して」
 *
 * `useSpeechReady(text, language)` がその判定。押しても鳴らないボタンを
 * 一瞬でも出さないために、**状態は画面をまたいで1つ**にしてある。
 */
export type Pronounce = ((text: string) => Promise<void>) & {
  /**
   * 音を先に取っておく(鳴らさない)。
   *
   * **URL ではなく音そのもの**を取る。以前は URL だけ覚えていたので、
   * 「先読み済み」と言いながら押した瞬間に mp3 のダウンロードが始まっていた。
   */
  prefetch: (text: string) => void;
};

/** いま取りに行っている語。**二重に取りに行かない**(費用と帯域の無駄)。 */
const inflight = new Map<string, Promise<string | null>>();

type Fetcher = (text: string) => Promise<{ audio_url?: string | null }>;

/**
 * 置き場所から音を落として、端末に貯める。
 *
 * `signedUrl` が渡されればサーバ関数を呼ばない — 辞書の作り置きは
 * 引いた時点で URL が手元に在るので、**同じ音を2度取りに行かない**。
 */
async function download(
  key: string,
  text: string,
  fetcher: Fetcher | null,
  signedUrl: string | null,
): Promise<string | null> {
  try {
    const local = await getCachedAudio(key);
    if (local) return markSpeechReady(key, local);
    setSpeechState(key, "loading");
    let url = signedUrl;
    if (!url && fetcher) url = (await fetcher(text)).audio_url ?? null;
    if (!url) {
      setSpeechState(key, "failed");
      return null;
    }
    // **音そのものを取る。** ここを省くと「準備できた」と言った直後に
    // ダウンロードが始まり、結局待たされる。
    const res = await fetch(url);
    if (!res.ok) throw new Error(`audio ${res.status}`);
    const blob = await res.blob();
    void putCachedAudio(key, blob);
    return markSpeechReady(key, blob);
  } catch {
    // 端末の声に落ちる道が残っているので、ここで画面を壊さない。
    setSpeechState(key, "failed");
    return null;
  } finally {
    inflight.delete(key);
  }
}

/**
 * その語の音を端末に用意して、鳴らせる URL を返す。
 *
 * 1. 端末の中(IndexedDB)
 * 2. サーバ(署名付きURL)→ 落として端末に貯める
 */
function ensureAudio(
  key: string,
  text: string,
  fetcher: Fetcher | null,
  signedUrl: string | null = null,
): Promise<string | null> {
  const have = speechUrl(key);
  if (have) return Promise.resolve(have);
  const running = inflight.get(key);
  if (running) return running;
  const job = download(key, text, fetcher, signedUrl);
  inflight.set(key, job);
  return job;
}

/**
 * @param language 読む語の学習言語。**渡さないと台湾華語として読む。**
 *   英語の語をそのまま渡すと、サーバは台湾華語の声で合成し、
 *   端末の控えも台湾華語の声を探す。しかも合成した音は保存されるので、
 *   **誰かが聞くまで間違いに気づけない**。
 */
export function usePronounce(language: string = DEFAULT_TARGET_LANGUAGE): Pronounce {
  const ttsFn = useServerFn(synthesizeSpeech);
  const elRef = useRef<HTMLAudioElement | null>(null);
  const fetcher = useCallback<Fetcher>(
    (text) => ttsFn({ data: { text, language } }),
    [ttsFn, language],
  );

  const pronounce = async function pronounce(text: string) {
    const word = text.trim();
    if (!word) return;
    // iOS: 再生解禁はタップ内で同期的に行う必要がある(await より前)。
    if (!elRef.current) elRef.current = new Audio();
    primeAudio(elRef.current);
    // **鍵に言語を混ぜる。** 同じ綴りが両方の言語に在り得る("a" / "in")。
    // 混ぜないと、先に鳴らしたほうの声が残る。
    const key = audioCacheKey(language, word);
    try {
      // 端末に在るならここで終わり — ネットに一度も出ない。
      const url = speechUrl(key) ?? (await ensureAudio(key, word, fetcher));
      if (url) {
        // 音声の被り対策: このフックは画面ごとに別インスタンスなので、各自が
        // 自前の Audio を持つと重なって鳴る。再生前にグローバルで排他を取る。
        claimAudio(elRef.current);
        elRef.current.src = url;
        await elRef.current.play();
        return;
      }
    } catch {
      /* server TTS unavailable — use the device voice below */
    }
    speak(word, language);
  } as Pronounce;

  pronounce.prefetch = (text: string) => {
    const word = text.trim();
    if (!word) return;
    void ensureAudio(audioCacheKey(language, word), word, fetcher);
  };

  return pronounce;
}

/**
 * その語の音が**いま鳴らせるか**。
 *
 * 見えた瞬間に取りに行き、端末に届いたら `ready` になる。
 * 発音ボタンはこれが `ready` のときだけ出す(オーナー指示 2026-08-26)。
 *
 * `enabled` を `false` にすると取りに行かない — 画面に無い語まで
 * 先読みすると、合成の費用がそのぶん増える。
 */
export function useSpeechReady(
  text: string | null | undefined,
  language: string = DEFAULT_TARGET_LANGUAGE,
  enabled = true,
): SpeechState {
  const ttsFn = useServerFn(synthesizeSpeech);
  const word = (text ?? "").trim();
  const key = word ? audioCacheKey(language, word) : "";

  const state = useSyncExternalStore(
    subscribeSpeech,
    () => (key ? speechState(key) : "none"),
    // サーバで描くときは何も無い。**`ready` を返さない** —
    // 端末に届く前にボタンが出ると、押しても鳴らない。
    () => "none" as SpeechState,
  );

  useEffect(() => {
    if (!enabled || !word) return;
    void ensureAudio(key, word, (t) => ttsFn({ data: { text: t, language } }));
  }, [enabled, word, key, language, ttsFn]);

  return state;
}

/**
 * 先に取っておく語をまとめて渡す(候補の一覧など)。
 *
 * 撮った直後に候補が5つ出るなら、その5つを**並べた瞬間に**取りに行く。
 * 人が読んでいる数秒のあいだに全部そろうので、どれを押しても待たない。
 *
 * `urls` に作り置きの署名付きURLを添えられる — 辞書に音が在る語は
 * サーバ関数を1回も呼ばずに端末へ落ちる。
 */
export function usePrefetchSpeech(
  words: readonly string[],
  opts: {
    language?: string;
    enabled?: boolean;
    urls?: Readonly<Record<string, string | null | undefined>>;
  } = {},
): void {
  const ttsFn = useServerFn(synthesizeSpeech);
  const language = opts.language ?? DEFAULT_TARGET_LANGUAGE;
  const enabled = opts.enabled ?? true;
  const urls = opts.urls;
  // 中身が同じなら効果を回さない。配列は描くたびに作り直されるので、
  // 参照で比べると**描き直すたびに先読みが走る**。
  const plan = useMemo(
    () =>
      words
        .map((w) => (w ?? "").trim())
        .filter(Boolean)
        .map((w) => ({ word: w, url: urls?.[w] ?? null })),
    [words, urls],
  );
  const planKey = JSON.stringify(plan);
  useEffect(() => {
    if (!enabled) return;
    const items = JSON.parse(planKey) as { word: string; url: string | null }[];
    for (const { word, url } of items) {
      void ensureAudio(
        audioCacheKey(language, word),
        word,
        (t) => ttsFn({ data: { text: t, language } }),
        url,
      );
    }
  }, [planKey, enabled, language, ttsFn]);
}
