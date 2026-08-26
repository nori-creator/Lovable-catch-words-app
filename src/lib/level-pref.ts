/**
 * **選んだ級を、その端末が憶えておく。**
 *
 * オーナー報告 2026-08-26（3度目）:
 * > 「まだ一度保存しても、ほかのページ移ってから設定のページに行くと、
 * >  学習言語を英語、表示言語を台湾華語や TOEFL のレベルを設定で指定しても、
 * >  すぐに学習言語台湾華語、表示言語日本語、今の TOEFL のレベル1、
 * >  目標はレベル2に戻る。」
 *
 * ## 言語は端末の写しで守ったのに、級だけ裸だった
 * 2度目の報告で `language-sync.ts` を入れ、言語は
 * 「**端末に選択が在ればそちらが勝つ**」形にした。ところが級には
 * 端末の写しが無く、`profiles.level_goal` / `current_level` だけが出所。
 * だから
 *
 *   ・私用の列が読めない行（`partial: true`）が返る
 *   ・`current_level` の列がまだ無くて保存が黙って落とされる
 *
 * のどちらでも、開き直すたびに**1級と2級**（= 既定）へ戻る。
 * 報告の「レベル1・目標レベル2」はこの既定そのもの。
 *
 * ## 言語と同じ形にする
 * 級は言語と同じ「**その端末で今どう動くかを決める値**」なので、
 * 同じ形（localStorage の写し + `reconcileLanguage` で突き合わせ）にする。
 * 形を揃えておくと、片方を直したときにもう片方も直す場所が分かる。
 *
 * ## サーバの値を捨てるわけではない
 * 解説の難しさを決めるのは server 側（`ai-provider.server.ts` が
 * `profiles` を読む）なので、**書き戻しは要る**。ここが持つのは
 * 「画面に何を出すか」の写しで、正はやはり書き戻した後のサーバ。
 * 書き戻せなかったときに**選んだ事実まで消えない**ようにするのが役目。
 */

/** 級は学習言語ごとに別（TOCFL-2 と B1 は同じ人の別の値）。 */
const KEY = "level-pref-v1";

export type StoredLevels = {
  /** `"TOCFL-2"` / `"A2"` など、保存される形そのまま。 */
  current: string | null;
  goal: string | null;
};

export const EMPTY_LEVELS: StoredLevels = { current: null, goal: null };

/** その学習言語で憶えている級。選んだことが無ければ `null`。 */
export function storedLevels(language: string | null | undefined): StoredLevels {
  if (typeof window === "undefined") return EMPTY_LEVELS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_LEVELS;
    const all = JSON.parse(raw) as Record<string, { current?: unknown; goal?: unknown }>;
    const one = all?.[String(language ?? "")];
    if (!one) return EMPTY_LEVELS;
    return {
      current: typeof one.current === "string" ? one.current : null,
      goal: typeof one.goal === "string" ? one.goal : null,
    };
  } catch {
    return EMPTY_LEVELS;
  }
}

/**
 * 級を憶える。**学習言語ごとに分けて書く** — 台湾華語で2級の人が
 * 英語に切り替えて B1 を選んでも、戻ったときに2級のままでいられる。
 */
export function setStoredLevels(
  language: string | null | undefined,
  levels: Partial<StoredLevels>,
): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, StoredLevels>) : {};
    const key = String(language ?? "");
    all[key] = { ...EMPTY_LEVELS, ...all[key], ...levels };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}
