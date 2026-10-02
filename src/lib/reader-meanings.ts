import { useEffect, useSyncExternalStore } from "react";
import { readerMeaning } from "./note-language";
import { shortMeaning } from "./meaning-rule";

/**
 * **読む人の言語の意味を、語ごとにまとめて引いて覚えておく**（R17 言語の混在）。
 *
 * 図鑑のスライド・一覧・暦・地図は同じ語を何十も並べる。1語ずつ問い合わせると
 * 画面を開くたびに何十本も飛ぶので、同じ瞬間に欲しがられた語を1本にまとめる
 * （`getReaderMeanings`）。届くまでは共有の意味を言語で選り分けて出しておき、
 * 届いたら差し替える。問い合わせに失敗しても何も壊さない（共有の意味のまま）。
 *
 * ## 無ければ埋めに行く（オーナー報告 2026-10-02、英語と繁體中文の両方）
 * 「表示言語が英語・繁體中文だと、図鑑のスライドに意味が出ない」「復習の問いが
 * 『Which one means “グラタンマカロニ”?』」。その人の言語の解説の行は、単語の詳細を
 * 開いた語にしか無い。共有の意味も別の言語なら、**出せる意味が1つも無い**。
 * そういう語だけ（共有の意味を渡された呼び出しで、それが読む人の言語でないとき）、
 * 意味だけを埋める問い合わせ（`fillReaderMeanings`）にまとめて回す。
 * 共有の意味が読む人の言語で書かれている語（日本語の表示で日本語の語など）は
 * **埋めに行かない** — 今まで通りそれを出す。
 */

type Loader = (ids: string[], lang: string) => Promise<Record<string, string>>;

const cache = new Map<string, string | null>(); // `${lang}:${id}` → 意味（無ければ null）
const pending = new Map<string, Set<string>>(); // lang → まだ問い合わせていない id
const loaded = new Set<string>(); // 引き終わった `${lang}:${id}`（無かった語を見分けるため）
const listeners = new Set<() => void>();
let loader: Loader | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let version = 0;

/** 埋めに行く先（本番は `fillReaderMeanings`。試験・確認用ページでは差し込まない）。 */
let filler: Loader | null = null;
/** 1回に埋める語の数（server の上限 `FILL_BATCH_MAX` と同じ）。 */
const FILL_BATCH = 24;
/** 引いても無かったら埋めに行く語（共有の意味が読む人の言語でない語）。 */
const fillWanted = new Set<string>(); // `${lang}:${id}`
/** 埋めに行った語。**1回だけ**（失敗しても叩き続けない）。 */
const fillAsked = new Set<string>();
const fillPending = new Map<string, Set<string>>();
let fillTimer: ReturnType<typeof setTimeout> | null = null;
/** 埋めに行って失敗したとき（裏の処理の失敗として記録する。画面は止めない）。 */
let onFillError: ((e: unknown) => void) | null = null;

/** 問い合わせ先を差し込む（本番は server fn。試験・確認用ページでは差し込まない）。 */
export function setReaderMeaningLoader(fn: Loader | null) {
  loader = fn;
}

/** 意味が無い語を埋めに行く先を差し込む（`_authenticated/route.tsx`）。 */
export function setReaderMeaningFiller(fn: Loader | null, onError?: (e: unknown) => void) {
  filler = fn;
  onFillError = onError ?? null;
}

function notify() {
  version++;
  for (const l of listeners) l();
}

function flush() {
  timer = null;
  const batch = [...pending.entries()];
  pending.clear();
  for (const [lang, set] of batch) {
    const ids = [...set];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const run = loader;
      if (!run) continue;
      run(chunk, lang)
        .then((found) => {
          for (const id of chunk) {
            cache.set(`${lang}:${id}`, found[id] ?? null);
            loaded.add(`${lang}:${id}`);
            if (!found[id]) wantFill(id, lang);
          }
          notify();
        })
        .catch(() => {
          for (const id of chunk) cache.set(`${lang}:${id}`, null);
        });
    }
  }
}

function wantFill(id: string, lang: string) {
  const key = `${lang}:${id}`;
  if (!filler || !fillWanted.has(key) || fillAsked.has(key)) return;
  fillAsked.add(key);
  let set = fillPending.get(lang);
  if (!set) fillPending.set(lang, (set = new Set()));
  set.add(id);
  if (!fillTimer) fillTimer = setTimeout(flushFill, 16);
}

function flushFill() {
  fillTimer = null;
  const batch = [...fillPending.entries()];
  fillPending.clear();
  for (const [lang, set] of batch) {
    const ids = [...set];
    for (let i = 0; i < ids.length; i += FILL_BATCH) {
      const chunk = ids.slice(i, i + FILL_BATCH);
      const run = filler;
      if (!run) continue;
      run(chunk, lang)
        .then((found) => {
          let changed = false;
          for (const id of chunk) {
            if (found[id]) {
              cache.set(`${lang}:${id}`, found[id]);
              changed = true;
            }
          }
          if (changed) notify();
        })
        .catch((e) => onFillError?.(e));
    }
  }
}

/**
 * その語の意味を欲しがる（束ねて問い合わせる）。`shared` の扱いは `useReaderMeaningFor` の注。
 * 描画の外から呼べるように分けてある（試験もここを通す）。
 */
export function requestReaderMeaning(id: string, lang: string, shared?: string | null) {
  const key = `${lang}:${id}`;
  // 共有の意味を渡され、それが読む人の言語でなければ、無かったときに埋めに行く。
  if (shared !== undefined && !readerMeaning((shared ?? "").trim(), lang).trim()) {
    fillWanted.add(key);
    // もう引き終わっていて無かった語（別の画面が先に引いた）は、ここで埋めに行く。
    if (loaded.has(key) && !cache.get(key)) wantFill(id, lang);
  }
  if (cache.has(key) || !loader) return;
  cache.set(key, null); // 同じ語を二度問い合わせない
  let set = pending.get(lang);
  if (!set) pending.set(lang, (set = new Set()));
  set.add(id);
  if (!timer) timer = setTimeout(flush, 16);
}

/** 覚えている意味（無ければ ""）。検索のように、描画の外で読みたい所のため。 */
export function readerMeaningCached(wordId: string | null | undefined, lang: string): string {
  return (wordId && cache.get(`${lang}:${wordId}`)) || "";
}

/**
 * 別の道で分かった意味を覚えさせる（復習で単語の詳細と同じ解説が届いたとき）。
 * 図鑑に戻ったときに、もう一度問い合わせずにその意味が出る。
 */
export function primeReaderMeaning(wordId: string, lang: string, meaning: string) {
  const m = meaning.trim();
  if (!m || cache.get(`${lang}:${wordId}`) === m) return;
  cache.set(`${lang}:${wordId}`, m);
  notify();
}

/**
 * その語の、読む人の言語で書かれた解説の意味（まだ無い・分からなければ ""）。
 *
 * `shared`（共有の意味）を渡すと、それが読む人の言語でない語は、無かったときに
 * 意味だけを埋めに行く（上の注）。渡さなければ今まで通り引くだけ。
 */
export function useReaderMeaningFor(
  wordId: string | null | undefined,
  lang: string,
  shared?: string | null,
): string {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => 0,
  );
  useEffect(() => {
    if (wordId) requestReaderMeaning(wordId, lang, shared);
  }, [wordId, lang, shared]);
  return (wordId && cache.get(`${lang}:${wordId}`)) || "";
}

/**
 * 画面に出す意味の文字（`ReaderMeaning` と同じ決め方）。その人向けの意味 → 共有の意味が
 * 読む人の言語のときだけそれ → 無ければ ""。長い説明文は語の長さに縮める。
 * 読み上げの名前（`aria-label`）のように、部品ではなく文字が要る所のため。
 */
export function useReaderMeaningText(
  text: string | null | undefined,
  wordId: string | null | undefined,
  lang: string,
): string {
  const own = useReaderMeaningFor(wordId, lang, text ?? "");
  return shortMeaning(own || readerMeaning(text, lang));
}

/** 試験用。 */
export function resetReaderMeaningsForTest() {
  cache.clear();
  pending.clear();
  loaded.clear();
  fillWanted.clear();
  fillAsked.clear();
  fillPending.clear();
  loader = null;
  filler = null;
  onFillError = null;
  if (timer) clearTimeout(timer);
  if (fillTimer) clearTimeout(fillTimer);
  timer = null;
  fillTimer = null;
}
