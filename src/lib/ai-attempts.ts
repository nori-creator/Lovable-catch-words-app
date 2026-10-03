/**
 * **AI の1回の呼び出しに締め切りを付け、落ちたら別の AI で1回だけやり直す**（監査 2026-10-03）。
 *
 * 公開中のアプリで、チュートリアルの写真の分析が 20〜50 秒かかり、ある回は 4 回続けて
 * 約 45〜50 秒待った末に「もう一度試す」になった。原因の見立て:
 * - 1 回の呼び出しの締め切りが 45 秒で、その中で AI SDK が既定で**2 回まで黙って再送**する
 *   （`maxRetries: 2`、間隔を空けながら）。詰まった相手を 45 秒待ち続けていた。
 * - 締め切りに達しても、別の AI に切り替える道が無かった。
 *
 * ここは通信しない段取りだけ（試験できるように、サーバー専用の物を読み込まない）:
 * 1 回ごとに `timeoutMs` で打ち切り（`AbortSignal` も止める）、だめなら次の候補へ。
 * 全部だめなら `AiAttemptsFailed` を投げ、**何をどれだけ待って、どう落ちたか**を持たせる
 * （記録と、使った回数を数え直すかの判断に使う）。
 */

export type AiAttemptOutcome =
  /** 使える返事が来た。 */
  | "ok"
  /** 締め切りまでに返事が来なかった。 */
  | "timeout"
  /** 返事は来たが形が使えなかった（AI は働いたので、使った回数に数える）。 */
  | "unusable"
  /** 通信・認証・上限・モデル名の誤りなど、返事が来なかった失敗。 */
  | "error";

export type AiAttemptRecord = {
  /** 記録用の名前（例 `lovable:google/gemini-3-flash-preview`）。鍵は含めない。 */
  label: string;
  ms: number;
  outcome: AiAttemptOutcome;
  /** 失敗の短い印（長い英文や個人の情報は入れない）。 */
  code?: string;
};

export type AiAttempt<T> = {
  label: string;
  timeoutMs: number;
  run: (signal: AbortSignal) => Promise<T>;
};

export const AI_ATTEMPT_TIMEOUT = "AI_ATTEMPT_TIMEOUT";

export class AiAttemptsFailed extends Error {
  constructor(
    message: string,
    readonly attempts: AiAttemptRecord[],
    readonly lastError: unknown,
  ) {
    super(message);
    this.name = "AiAttemptsFailed";
  }
  /** どの回も締め切り切れだった。 */
  get timedOut(): boolean {
    return this.attempts.length > 0 && this.attempts.every((a) => a.outcome === "timeout");
  }
  /**
   * 使った回数に数えるか。どの回も**返事を受け取れなかった**（締め切り切れ・通信の失敗）なら
   * 数えない — 利用者が「もう一度試す」を押すたびに枠が2つずつ減らないように。
   */
  get chargeable(): boolean {
    return this.attempts.some((a) => a.outcome === "ok" || a.outcome === "unusable");
  }
}

/** 記録に残す短い印。エラー文の先頭の英数字の記号だけ（中身の文や鍵を残さない）。 */
export function attemptErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const status = (error as { statusCode?: unknown }).statusCode;
  if (typeof status === "number") return `http_${status}`;
  const code = error.message.match(/^[A-Z][A-Z0-9_]{2,60}$/)?.[0];
  if (code) return code;
  if (error.name === "AbortError" || error.name === "TimeoutError") return "aborted";
  return error.name && error.name !== "Error" ? error.name.slice(0, 40) : "error";
}

export async function runAiAttempts<T>(
  attempts: AiAttempt<T>[],
  options: {
    /** 返事は来たが使えなかった失敗か（例: JSON の形が崩れていた）。 */
    isUnusableReply?: (error: unknown) => boolean;
    /** 全部が締め切り切れだったときに投げる印。 */
    timeoutMessage?: string;
    now?: () => number;
    onAttemptFailed?: (record: AiAttemptRecord, next: string | null) => void;
  } = {},
): Promise<{ value: T; attempts: AiAttemptRecord[]; ms: number }> {
  const now = options.now ?? (() => Date.now());
  const started = now();
  const records: AiAttemptRecord[] = [];
  let lastError: unknown = new Error("NO_AI_ATTEMPT");
  let lastReal: unknown = null;
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    const controller = new AbortController();
    const begin = now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          const error = new Error(AI_ATTEMPT_TIMEOUT);
          controller.abort(error);
          reject(error);
        }, attempt.timeoutMs);
      });
      // 相手が中断に応じなくても、締め切りで必ず先へ進む。
      const value = await Promise.race([attempt.run(controller.signal), deadline]);
      records.push({ label: attempt.label, ms: now() - begin, outcome: "ok" });
      return { value, attempts: records, ms: now() - started };
    } catch (error) {
      lastError = error;
      const outcome: AiAttemptOutcome = timedOut
        ? "timeout"
        : options.isUnusableReply?.(error)
          ? "unusable"
          : "error";
      if (outcome !== "timeout") lastReal = error;
      const record: AiAttemptRecord = {
        label: attempt.label,
        ms: now() - begin,
        outcome,
        code: outcome === "timeout" ? "timeout" : attemptErrorCode(error),
      };
      records.push(record);
      options.onAttemptFailed?.(record, attempts[i + 1]?.label ?? null);
    } finally {
      clearTimeout(timer);
      // 負けた側の呼び出しを止める（締め切り後に返事が来ても使わない）。
      if (!controller.signal.aborted) controller.abort();
    }
  }
  const allTimedOut = records.length > 0 && records.every((r) => r.outcome === "timeout");
  const message = allTimedOut
    ? (options.timeoutMessage ?? AI_ATTEMPT_TIMEOUT)
    : lastReal instanceof Error
      ? lastReal.message
      : "AI_UNAVAILABLE";
  throw new AiAttemptsFailed(message, records, lastReal ?? lastError);
}
