/**
 * **書く時の条件**（`example-scene-label.server.ts` と `updateReaderExplanationIfUnchanged` が使う。PR #189 の点検）。
 * 画面からも読まれるファイル（`word-explanation.functions.ts`）が使うので、サーバだけの道具は入れない。
 */

/** 読んだ時の `example_scene_for`（生の値。鍵が無ければ null）。書く時の条件に使う。 */
export function rawSceneFor(extras: unknown): string | null {
  if (!extras || typeof extras !== "object" || Array.isArray(extras)) return null;
  const v = (extras as Record<string, unknown>).example_scene_for;
  return typeof v === "string" ? v : null;
}

/** 更新の問い合わせ（条件を足せる形）。 */
export type CasQuery = PromiseLike<{ data?: unknown; error: unknown }> & {
  eq: (k: string, v: string) => CasQuery;
  is: (k: string, v: null) => CasQuery;
  select: (c: string) => CasQuery;
};

/**
 * 書く時の条件: `example_scene_for` が読んだ時のままの行だけ（鍵が無かった行は、まだ無い行だけ）。
 * 書けた行を返させて、書けたかを知る。
 */
export function casSceneFor(q: CasQuery, read: string | null, returning: string): CasQuery {
  const cond =
    read === null
      ? q.is("extras->>example_scene_for", null)
      : q.eq("extras->>example_scene_for", read);
  return cond.select(returning);
}
