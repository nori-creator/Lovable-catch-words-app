import { reportBackgroundFailure } from "@/lib/background-failure";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getTtsVoiceTags, synthesizeSpeech } from "@/lib/tts.functions";
import {
  isVoiceLockedFor,
  refreshVoiceTagsOnce,
  rememberVoiceLocks,
  voiceTagFor,
} from "@/lib/tts-voice-tag";
import { speak } from "@/lib/speak";
import { claimAudio, primeAudio, stopOtherAudio } from "@/lib/audio";
import { decodeSpeech, playSpeechBuffer, unlockSpeechOutput } from "@/lib/speech-buffer";
import { DEFAULT_TARGET_LANGUAGE } from "@/lib/target-lang";
import { speechIdentity, type SpeechIdentityInput } from "@/lib/tts-cache";
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
export type Pronounce = ((
  text: string,
  waitUntilEnded?: boolean,
  /** 読み・品詞（分かる時だけ）。多音字・同綴り異音語の音を取り違えない（`tts-cache.ts`）。 */
  ident?: SpeechIdentityInput | null,
) => Promise<void>) & {
  /**
   * 音を先に取っておく(鳴らさない)。
   *
   * **URL ではなく音そのもの**を取る。以前は URL だけ覚えていたので、
   * 「先読み済み」と言いながら押した瞬間に mp3 のダウンロードが始まっていた。
   */
  prefetch: (text: string, ident?: SpeechIdentityInput | null) => void;
  /** Unlock before a delayed animation cue, synchronously in the gesture. */
  prepare: () => void;
};

/** いま取りに行っている語。**二重に取りに行かない**(費用と帯域の無駄)。 */
const inflight = new Map<string, Promise<string | null>>();

type Fetcher = (text: string) => Promise<{ audio_url?: string | null; locked?: boolean }>;

/** サーバへ渡す読み・品詞（空の欄は送らない）。 */
function identFields(ident: SpeechIdentityInput | null | undefined): {
  pinyin?: string;
  zhuyin?: string;
  ipa?: string;
  pos?: string;
} {
  const out: { pinyin?: string; zhuyin?: string; ipa?: string; pos?: string } = {};
  if (ident?.pinyin?.trim()) out.pinyin = ident.pinyin.trim().slice(0, 200);
  if (ident?.zhuyin?.trim()) out.zhuyin = ident.zhuyin.trim().slice(0, 200);
  if (ident?.ipa?.trim()) out.ipa = ident.ipa.trim().slice(0, 200);
  if (ident?.pos?.trim()) out.pos = ident.pos.trim().slice(0, 40);
  return out;
}

/**
 * 端末の鍵。読みが要らない語・読みの分からない呼び出しは今までと同じ鍵
 * （`speechIdentity` が空）。
 */
function speechKey(
  language: string,
  word: string,
  ident: SpeechIdentityInput | null | undefined,
): string {
  return audioCacheKey(
    language,
    word,
    voiceTagFor(language),
    speechIdentity(language, word, ident),
  );
}

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
    if (local) {
      // 端末に在る音は**先に読み解いておく**（押した瞬間に鳴らすため、`speech-buffer.ts`）。
      void decodeSpeech(key, local);
      return markSpeechReady(key, local);
    }
    setSpeechState(key, "loading");
    let url = signedUrl;
    if (!url && fetcher) url = (await fetcher(text)).audio_url ?? null;
    if (!url) {
      setSpeechState(key, "failed");
      if (fetcher) reportBackgroundFailure("tts", new Error("no audio_url"), { text });
      return null;
    }
    // **音そのものを取る。** ここを省くと「準備できた」と言った直後に
    // ダウンロードが始まり、結局待たされる。
    const res = await fetch(url);
    if (!res.ok) throw new Error(`audio ${res.status}`);
    const blob = await res.blob();
    void putCachedAudio(key, blob);
    void decodeSpeech(key, blob);
    return markSpeechReady(key, blob);
  } catch (e) {
    // 端末の声に落ちる道が残っているので、ここで画面を壊さない。ただし記録には残す。
    setSpeechState(key, "failed");
    reportBackgroundFailure("tts", e, { text });
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
 * **発音が鳴り始めたことを知らせる口**（ベータの計測、2026-10-03）。撮る画面が「撮ってから
 * 最初に発音を聞いた」（`first_audio_played`）を数えるのに使う。語そのものは渡さない。
 * `ms` = 頼んでから音が鳴り始めるまで（QA.md「request → first audio playback」）。
 * 端末の声に落ちた時は、端末に読ませ始めた時点まで。
 */
const pronouncedListeners = new Set<(ms: number) => void>();
export function onPronounced(listener: (ms: number) => void): () => void {
  pronouncedListeners.add(listener);
  return () => {
    pronouncedListeners.delete(listener);
  };
}

/**
 * @param language 読む語の学習言語。**渡さないと台湾華語として読む。**
 *   英語の語をそのまま渡すと、サーバは台湾華語の声で合成し、
 *   端末の控えも台湾華語の声を探す。しかも合成した音は保存されるので、
 *   **誰かが聞くまで間違いに気づけない**。
 */
export function usePronounce(language: string = DEFAULT_TARGET_LANGUAGE): Pronounce {
  const ttsFn = useServerFn(synthesizeSpeech);
  // 開発者が声を変えていたら、端末の古い音を使わない（1起動に1回だけ聞く）。
  const tagsFn = useServerFn(getTtsVoiceTags);
  useEffect(() => {
    void refreshVoiceTagsOnce(() => tagsFn());
  }, [tagsFn]);
  const elRef = useRef<HTMLAudioElement | null>(null);
  const fetcherFor = useCallback(
    (ident: SpeechIdentityInput | null | undefined): Fetcher =>
      async (text) => {
        const r = await ttsFn({ data: { text, language, ...identFields(ident) } });
        // 台湾の声が固定されていて合成できなかった → 以後は端末の声で読まない
        // （オーナー指示 2026-09-29「アプリ全体で1つの同一の音声」）。
        if (!r.audio_url && r.locked) rememberVoiceLocks({ [language]: true });
        return r;
      },
    [ttsFn, language],
  );

  const pronounce = async function pronounce(
    text: string,
    waitUntilEnded = false,
    ident?: SpeechIdentityInput | null,
  ) {
    const word = text.trim();
    if (!word) return;
    const fetcher = fetcherFor(ident);
    const askedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    let told = false;
    /** 音が鳴り始めた（1回だけ知らせる）。 */
    const started = () => {
      if (told) return;
      told = true;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const ms = Math.max(0, Math.round(now - askedAt));
      for (const listener of pronouncedListeners) {
        try {
          listener(ms);
        } catch {
          /* 数えられなくても発音は止めない */
        }
      }
    };
    // 声が固定されている言語では、端末の別の声で読まない（黙る）。
    const deviceVoice = () => {
      if (isVoiceLockedFor(language)) return Promise.resolve();
      started();
      return waitUntilEnded
        ? new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 2400);
            speak(word, language, 0.95, () => {
              clearTimeout(timer);
              resolve();
            });
          })
        : Promise.resolve(speak(word, language));
    };
    // iOS: 再生解禁はタップ内で同期的に行う必要がある(await より前)。
    if (!elRef.current) elRef.current = new Audio();
    primeAudio(elRef.current);
    unlockSpeechOutput();
    // **鍵に言語を混ぜる。** 同じ綴りが両方の言語に在り得る("a" / "in")。
    // 混ぜないと、先に鳴らしたほうの声が残る。
    const key = speechKey(language, word, ident);
    /**
     * **読み解き済みなら、その場で鳴らす**（オーナー指示 2026-09-28「発音ボタン押して
     * から発音が実践されるまで…タイムラグがある」）。`<audio>` に入れ直して mp3 を
     * 読み解く待ち（iPhone で 0.1〜0.3 秒）を飛ばす。無ければ下の今まで通りの道。
     */
    stopOtherAudio();
    const quick = playSpeechBuffer(key);
    if (quick) {
      started();
      if (waitUntilEnded) await quick;
      return;
    }
    /**
     * **一度駄目だった語で、押すたびに待たせない**(オーナー指摘 2026-08-26
     * 「発音のラグがまだある」)。
     *
     * サーバの合成が使えないとき(鍵が無い・圏外・上限)、ここは押すたびに
     * `ensureAudio` を待っていた。その中の `fetchWithBackoff` は 429/5xx を
     * **4回まで待って再試行**するので、最悪6秒近く黙ってから端末の声が
     * 鳴る。押した人には「反応しないアプリ」に見える。
     *
     * 駄目だと分かっている語は**その場で端末の声**にして、
     * 取り直しは裏で1回だけ試す(次に押すときは鳴るかもしれない)。
     */
    if (speechState(key) === "failed") {
      void ensureAudio(key, word, fetcher);
      await deviceVoice();
      return;
    }
    try {
      // 端末に在るならここで終わり — ネットに一度も出ない。
      const url =
        speechUrl(key) ??
        (await (waitUntilEnded
          ? Promise.race([
              ensureAudio(key, word, fetcher),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 350)),
            ])
          : ensureAudio(key, word, fetcher)));
      if (url) {
        // 音声の被り対策: このフックは画面ごとに別インスタンスなので、各自が
        // 自前の Audio を持つと重なって鳴る。再生前にグローバルで排他を取る。
        claimAudio(elRef.current);
        elRef.current.src = url;
        const audio = elRef.current;
        if (waitUntilEnded) {
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              clearTimeout(timer);
              audio.removeEventListener("ended", done);
              audio.removeEventListener("pause", done);
              audio.removeEventListener("error", done);
            };
            const done = () => {
              cleanup();
              resolve();
            };
            const timer = setTimeout(done, 2400);
            audio.addEventListener("ended", done, { once: true });
            audio.addEventListener("pause", done, { once: true });
            audio.addEventListener("error", done, { once: true });
            audio
              .play()
              .then(started)
              .catch((error) => {
                cleanup();
                reject(error);
              });
          });
        } else {
          await audio.play();
          started();
        }
        return;
      }
    } catch {
      /* server TTS unavailable — use the device voice below */
    }
    await deviceVoice();
  } as Pronounce;

  pronounce.prepare = () => {
    if (!elRef.current) elRef.current = new Audio();
    primeAudio(elRef.current);
  };
  pronounce.prefetch = (text: string, ident?: SpeechIdentityInput | null) => {
    const word = text.trim();
    if (!word) return;
    void ensureAudio(speechKey(language, word, ident), word, fetcherFor(ident));
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
  /** 読み・品詞（分かる時だけ。`usePronounce` に渡すのと同じ物を渡す）。 */
  ident?: SpeechIdentityInput | null,
): SpeechState {
  const ttsFn = useServerFn(synthesizeSpeech);
  const word = (text ?? "").trim();
  const key = word ? speechKey(language, word, ident) : "";
  const fieldsJson = JSON.stringify(identFields(ident));

  const state = useSyncExternalStore(
    subscribeSpeech,
    () => (key ? speechState(key) : "none"),
    // サーバで描くときは何も無い。**`ready` を返さない** —
    // 端末に届く前にボタンが出ると、押しても鳴らない。
    () => "none" as SpeechState,
  );

  useEffect(() => {
    if (!enabled || !word) return;
    const fields = JSON.parse(fieldsJson) as ReturnType<typeof identFields>;
    void ensureAudio(key, word, (t) => ttsFn({ data: { text: t, language, ...fields } }));
  }, [enabled, word, key, language, ttsFn, fieldsJson]);

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
        audioCacheKey(language, word, voiceTagFor(language)),
        word,
        (t) => ttsFn({ data: { text: t, language } }),
        url,
      );
    }
  }, [planKey, enabled, language, ttsFn]);
}
