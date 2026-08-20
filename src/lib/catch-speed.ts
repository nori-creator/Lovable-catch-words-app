import { useEffect, useState } from "react";

/**
 * キャッチの速さと丁寧さのつまみ(要望 #18・#20・#76)。
 *
 * > 「速度モードと詳細モード ①キャッチ時に切り抜きするしない
 * >  (後から詳細画面でも切り抜ける)」
 * > 「切り抜きあり/なし・ファストモードの時間を計測して比較したい」
 *
 * ## いま何が遅いのか
 * 撮る経路(`capture.tsx`)は、候補を押した瞬間に切り抜きを始め、
 * **切り抜きが終わるまでカードを見せない**:
 *
 *     const cut = (await cutoutPromise) ?? objectImg;
 *     setCutoutImg(cut);
 *     setStep("card");
 *
 * 意味と発音は候補から即座に入っているのに、**背景を消す処理を待つために
 * 画面が止まっている**。切り抜きは見た目の格上げであってキャッチの条件では
 * ない、とすぐ上の注釈にも書いてある — 待たせる理由もそこには無い。
 *
 * ## 決めごと
 * - `detail`(既定) … いまのまま。切り抜いてからカードを出す
 * - `fast` … 切り抜きを待たずにカードを出す。切り抜きは**後から**
 *   詳細画面でできる(長押しの「別の写真に差し替える」と同じ場所)
 *
 * 既定を変えない。速さのために見た目を落とすかどうかは人が決めることで、
 * 黙って切り替えるものではない。
 *
 * 端末ごとの設定にしてある(`photo-pref.ts` と同じ理由 —
 * 切り抜きは**その端末の上で走る**処理なので、速さの好みも端末に属する)。
 */

export type CatchSpeed = "detail" | "fast";

const KEY = "catch-speed-v1";
const EVENT = "catch-speed-changed";

export function normalizeCatchSpeed(raw: unknown): CatchSpeed {
  return raw === "fast" ? "fast" : "detail";
}

export function getCatchSpeed(): CatchSpeed {
  if (typeof window === "undefined") return "detail";
  try {
    return normalizeCatchSpeed(localStorage.getItem(KEY));
  } catch {
    return "detail";
  }
}

export function setCatchSpeed(v: CatchSpeed) {
  try {
    localStorage.setItem(KEY, v);
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* storage unavailable */
  }
}

export function useCatchSpeed(): CatchSpeed {
  const [v, setV] = useState<CatchSpeed>(() => getCatchSpeed());
  useEffect(() => {
    const h = () => setV(getCatchSpeed());
    window.addEventListener(EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(EVENT, h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return v;
}

/** キャッチの瞬間に切り抜くか。 */
export function cutoutAtCatch(speed: CatchSpeed | string | null | undefined): boolean {
  return normalizeCatchSpeed(speed) === "detail";
}

// ---------------------------------------------------------------------------
// 計測(要望 #73)
// ---------------------------------------------------------------------------

/**
 * 1回のキャッチにかかった時間。**端末に貯める。**
 *
 * ## なぜサーバに送らないか
 * 切り抜きはその端末の上で走るので、速さは**端末の性能そのもの**。
 * 別の端末の数字と混ぜた中央値は、どちらの端末の話でもなくなる。
 * それに、比べたいのは「この端末で、切り抜きあり/なしがどう違うか」で、
 * その比較は手元の記録だけで足りる — 列を1本も足さずに済む
 * (いま未適用の移行が3本たまっているので、増やさない判断も込み)。
 */
export type CatchTiming = {
  /** ミリ秒。押してからカードが出るまで。 */
  ms: number;
  speed: CatchSpeed;
  /** 実際に切り抜きが走ったか(`fast` でも古い記録には true が在りうる)。 */
  cutout: boolean;
  at: number;
};

const LOG_KEY = "catch-timing-v1";
/** 貯める上限。**古い順に捨てる** — 端末の記憶を食い続けない。 */
const LOG_MAX = 40;

export function recordCatchTiming(t: Omit<CatchTiming, "at">): void {
  if (typeof window === "undefined") return;
  try {
    const log = readCatchTimings();
    log.push({ ...t, at: Date.now() });
    localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-LOG_MAX)));
  } catch {
    /* storage unavailable — 計測は落ちてよい */
  }
}

/** **壊れた記録でも画面を壊さない。** 読めない物は捨てる。 */
export function readCatchTimings(): CatchTiming[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (r): r is CatchTiming =>
        !!r &&
        typeof r === "object" &&
        typeof (r as CatchTiming).ms === "number" &&
        Number.isFinite((r as CatchTiming).ms),
    );
  } catch {
    return [];
  }
}

export function clearCatchTimings(): void {
  try {
    localStorage.removeItem(LOG_KEY);
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore */
  }
}

export type CatchTimingSummary = {
  detail: { median: number | null; n: number };
  fast: { median: number | null; n: number };
};

/** 中央値。**平均にしない** — 1回の外れ値で像が歪む。 */
function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * 「切り抜きあり/なし」を並べて比べられる形にする(要望 #73)。
 * **片方しか記録が無いときは、無いほうを null で返す** —
 * 0 と書くと「0ミリ秒で終わった」と読めてしまう。
 */
export function summarizeCatchTimings(log: readonly CatchTiming[]): CatchTimingSummary {
  const pick = (s: CatchSpeed) =>
    log.filter((r) => normalizeCatchSpeed(r.speed) === s).map((r) => r.ms);
  const d = pick("detail");
  const f = pick("fast");
  return {
    detail: { median: median(d), n: d.length },
    fast: { median: median(f), n: f.length },
  };
}
