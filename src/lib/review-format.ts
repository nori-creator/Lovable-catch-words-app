import { memoryLevel } from "./memory";

/**
 * 「その1枚を、いまどの形で出すか」を決める所。
 *
 * ## なぜ要るか — 計算していたのに誰も読んでいなかった
 * 要望(2026-08-14):
 * 「記憶の段階で出題形式を変える。L1 写真+音声の4択 / L2 写真を見て発音 /
 *  L3 型を提示して作文発話・撮影状況を説明」
 *
 * `srs.ts` には既に `modeFor(repetitions)` が在り、試験まで書いてあり、
 * `DueReviewCard.mode` としてサーバから毎回送られている。
 * **ところが画面がその値を一度も読んでいない**(`review.tsx` を
 * `card.mode` で探すと0件)。実際に効いていたのは設定の
 * 「発話 / 4択」の**全カード一律の切替**だけで、
 * 段階で変えるという要望は計算だけされて画面に届いていなかった。
 * 先週 `getMyStats` と `rarity.ts` で直したのと同じ形。
 *
 * ## なぜ `repetitions` ではなく記憶レベルで決めるか
 * `modeFor` は復習回数だけを見る。すると
 * **画面に「忘れかけ」と赤で出ている札に、いちばん難しい作文発話が来る**
 * — 8回やったが1か月放置した語がまさにそれになる。
 * 出す形と、すぐ隣に出ているバッジが**別の数字**を根拠にしていたら、
 * 人からは気分で変わっているようにしか見えない。
 *
 * だから `memoryLevel(retention, interval, repetitions)`(バッジと同じ関数)
 * から決める。**画面が見せている段階と、出す形が必ず一致する。**
 *
 * ## 人が明示的に選んだ物は動かさない
 * 設定で「いつも4択」「いつも発話」を選んでいる人の画面を、
 * こちらの判断で勝手に変えない。段階に合わせるのは
 * **「AIが選ぶ」を選んだときだけ**。
 */

/** 出題の形。 */
export type ReviewFormat =
  /** 写真+音声を見聞きして意味を4択。忘れかけの語を拾い直す入口。 */
  | "choice"
  /** 写真を見て、その語を声に出す。型も足場も出さない。 */
  | "say"
  /** 型を提示して一文を作って話す(撮ったときの状況を説明する)。 */
  | "compose";

/** 設定に保存する値。**DBの検査制約と必ず同じ集合**にしておく。 */
export type ReviewModePref = "speaking" | "choice" | "hybrid";

const PREFS: readonly ReviewModePref[] = ["speaking", "choice", "hybrid"];

/**
 * 保存されている文字列を読む。知らない値は既定(`speaking`)に落とす。
 *
 * **`Number()` と同じ罠を作らない** — 空文字も null も真偽値も、
 * 「たまたま通ってしまう」経路を持たせず、集合に在る物だけを認める。
 */
export function normalizeReviewMode(raw: unknown): ReviewModePref {
  return typeof raw === "string" && (PREFS as readonly string[]).includes(raw)
    ? (raw as ReviewModePref)
    : "speaking";
}

/**
 * 記憶レベル(0〜5)から形を決める。
 *
 * | レベル | 名前 | 形 | なぜ |
 * |---|---|---|---|
 * | 0-1 | 忘れかけ・あやうい | `choice` | 思い出せない物に「言え」は罰でしかない。見て選んで、まず再会させる |
 * | 2-3 | うろ覚え・定着中 | `say` | 意味は出るが口が回らない段。語そのものを声に出す |
 * | 4-5 | 覚えた・長期記憶 | `compose` | 単体では言える。使える所まで持っていく |
 *
 * 撮った直後の語は `memoryLevel` の側で「定着中」止まりに抑えられている
 * (記憶率が高くても復習回数が2回以下なら4以上にしない)ので、
 * **一度も復習していない語に作文発話が来ることはない**。
 * 段の下限はあちらが持っている — ここで二重に持たない。
 */
export function formatForLevel(level: number): ReviewFormat {
  if (level <= 1) return "choice";
  if (level <= 3) return "say";
  return "compose";
}

export type ReviewFormatInput = {
  /** 設定の値。生の文字列でよい(ここで正規化する)。 */
  pref: unknown;
  /** 現在の推定記憶率 0〜100。 */
  retention: number;
  intervalDays: number;
  repetitions: number;
  /** `"phrase"` のときだけ扱いが変わる。 */
  entryType?: string | null;
};

/**
 * その1枚の形を返す。
 *
 * フレーズの札(`entry_type === "phrase"`)は**相手の台詞に返す練習**で、
 * 「その語を発音する」という形が最初から存在しない。段が `say` に
 * なったときは `compose`(会話)に寄せる。
 * ただし人が「いつも4択」を選んでいるなら、そちらが優先。
 */
export function reviewFormatFor(input: ReviewFormatInput): ReviewFormat {
  const pref = normalizeReviewMode(input.pref);
  if (pref === "choice") return "choice";
  if (pref === "speaking") return "compose";

  const { level } = memoryLevel(input.retention, input.intervalDays, input.repetitions);
  const format = formatForLevel(level);
  if (format === "say" && input.entryType === "phrase") return "compose";
  return format;
}

/**
 * 「その語を言えたか」を**その場で**判定する。
 *
 * ## なぜAIに投げないか
 * `say` の段でやることは「写真を見て、その1語を声に出す」だけ。
 * ここを `getSpeakingFeedback`(作文の添削)に通すと、二重に間違える:
 *
 * ・**費用。** 1語言うたびにAIを1回呼ぶ。段の中でいちばん回数が多い所。
 * ・**採点が合わない。** 添削は「文として自然か」を見るので、
 *   裸の1語は自然さで低く付く。正しく言えた人が `skip`(最低評価)で
 *   記録され、SRS の間隔が縮む — **正解したのに罰される**。
 *
 * 音声認識が `cmn-Hant-TW` でその語を書き起こせた、という事実が
 * そのまま「発音が通じた」の証拠になる。判定はそれで足りる。
 *
 * ## 甘くしない所
 * 見出し語が空なら **false**。何も言っていない人に○を出さない
 * (`Number(null) === 0` で「中立」を既定にしてしまった件と同じ気の緩み)。
 */
export function saidTarget(transcript: string, headword: string): boolean {
  const strip = (s: unknown) => (typeof s === "string" ? s.replace(/[\s\p{P}\p{S}]/gu, "") : "");
  const said = strip(transcript);
  const target = strip(headword);
  if (!target || !said) return false;
  return said.includes(target);
}
