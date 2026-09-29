import { useEffect, useSyncExternalStore } from "react";

/**
 * **読む人の言語の意味を、語ごとにまとめて引いて覚えておく**（R17 言語の混在）。
 *
 * 図鑑のスライド・一覧・暦・地図は同じ語を何十も並べる。1語ずつ問い合わせると
 * 画面を開くたびに何十本も飛ぶので、同じ瞬間に欲しがられた語を1本にまとめる
 * （`getReaderMeanings`）。届くまでは共有の意味を言語で選り分けて出しておき、
 * 届いたら差し替える。問い合わせに失敗しても何も壊さない（共有の意味のまま）。
 */

type Loader = (ids: string[], lang: string) => Promise<Record<string, string>>;

const cache = new Map<string, string | null>(); // `${lang}:${id}` → 意味（無ければ null）
const pending = new Map<string, Set<string>>(); // lang → まだ問い合わせていない id
const listeners = new Set<() => void>();
let loader: Loader | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let version = 0;

/** 問い合わせ先を差し込む（本番は server fn。試験・確認用ページでは差し込まない）。 */
export function setReaderMeaningLoader(fn: Loader | null) {
  loader = fn;
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
          for (const id of chunk) cache.set(`${lang}:${id}`, found[id] ?? null);
          notify();
        })
        .catch(() => {
          for (const id of chunk) cache.set(`${lang}:${id}`, null);
        });
    }
  }
}

function want(id: string, lang: string) {
  const key = `${lang}:${id}`;
  if (cache.has(key) || !loader) return;
  cache.set(key, null); // 同じ語を二度問い合わせない
  let set = pending.get(lang);
  if (!set) pending.set(lang, (set = new Set()));
  set.add(id);
  if (!timer) timer = setTimeout(flush, 16);
}

/** その語の、読む人の言語で書かれた解説の意味（まだ無い・分からなければ ""）。 */
export function useReaderMeaningFor(wordId: string | null | undefined, lang: string): string {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => 0,
  );
  useEffect(() => {
    if (wordId) want(wordId, lang);
  }, [wordId, lang]);
  return (wordId && cache.get(`${lang}:${wordId}`)) || "";
}
