/**
 * 日記の下書きを端末に置くときの鍵と、日をまたいだ後始末。
 *
 * ## なぜ切り出すか
 * この画面には「保存」が無く、文章が DB に入るのは添削が成功した後だけ。
 * 添削には1日の上限があるので、上限に達した日は保存に到達する道が1本も無い。
 * つまり**端末の控えが唯一の置き場所**で、ここが狂うと書いた文章が消える。
 *
 * 鍵を日付で分けたことで「昨日の文章で今日を上書き」は消えたが、代わりに
 * サーバーに届かなかった文章が日付をまたいだ瞬間に手の届かない所へ行く。
 * その拾い直しと掃除を、画面から離して**テストできる形**に置く。
 */

export const DRAFT_PREFIX = "journal-draft:";
/** 端末に残す日数。これを過ぎた書きかけは掃除する。 */
export const DRAFT_KEEP_DAYS = 14;

export function draftKeyFor(entryDate: string) {
  return `${DRAFT_PREFIX}${entryDate}`;
}

/** localStorage のうち、ここで使う分だけ。テストから差し替えられるように。 */
export interface DraftStore {
  readonly length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  removeItem(k: string): void;
}

/** `today` より前の日付を、`DRAFT_KEEP_DAYS` 日ぶん遡った境界。 */
export function cutoffDate(today: string, days = DRAFT_KEEP_DAYS) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * 日をまたいで残った書きかけを、新しい順に返す。ついでに掃除する。
 *
 * ・今日以降の鍵は触らない(今書いているもの)
 * ・古すぎるもの・空のものは消す
 * ・残ったものは**返すだけ**。自動では入れない — 勝手に入れたら
 *   日付で鍵を分けた意味が消える(昨日の文章で今日を上書きする)。
 */
export function readLeftoverDrafts(
  today: string,
  store: DraftStore | null | undefined = typeof localStorage === "undefined" ? null : localStorage,
): Array<{ date: string; text: string }> {
  if (!store) return [];
  const out: Array<{ date: string; text: string }> = [];
  const cutoff = cutoffDate(today);
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k?.startsWith(DRAFT_PREFIX)) keys.push(k);
  }
  for (const key of keys) {
    const date = key.slice(DRAFT_PREFIX.length);
    if (date >= today) continue;
    const text = store.getItem(key) ?? "";
    if (date < cutoff || !text.trim()) {
      try {
        store.removeItem(key);
      } catch {
        /* 消せない端末もある。拾えなくなるだけで、書くことは止めない。 */
      }
      continue;
    }
    out.push({ date, text });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}
