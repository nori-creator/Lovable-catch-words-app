/**
 * **Higgsfield の API を呼ぶ所（サーバだけ）**。
 *
 * 公式の SDK（`@higgsfield/client`）は中で axios を使う。アプリのサーバ（Lovable の
 * 実行環境）に部品を増やさないため、ここでは**SDK と同じ手順を `fetch` で**行う:
 *
 *  1. `POST https://api.higgsfield.ai/<型番>` に入力をそのまま送る
 *     （見出し `Authorization: Key 鍵ID:鍵の秘密`）
 *  2. 返ってきた `request_id` で `GET /requests/<id>/status` を2秒ごとに見る
 *  3. `completed` なら `images[0].url` か `video.url`。`failed` / `nsfw` /
 *     `canceled` は**失敗として返す**（成功と言わない）
 *
 * 鍵の値は**記録にも返事にも出さない**。返すのは鍵を見つけた名前だけ。
 */
import {
  HIGGSFIELD_BASE_URL,
  pickHiggsfieldResult,
  readHiggsfieldCredentials,
} from "./image-provider";

export type HiggsfieldOutcome =
  | { ok: true; url: string; requestId: string | null; ms: number }
  | { ok: false; reason: string; status?: string; httpStatus?: number; ms: number };

const DONE = new Set(["completed", "failed", "nsfw", "canceled", "cancelled"]);

/** 失敗の理由を、見た人が次に何をすればよいか分かる言い方にする。 */
function explainHttp(status: number, detail: string): string {
  if (status === 401) return "鍵が正しくありません（401）。鍵ID:鍵の秘密 の形か確認してください";
  if (status === 403)
    return "Higgsfield の残高が足りないか、鍵にこの型を使う権限がありません（403）";
  if (status === 404) return "型番が見つかりません（404）。型番の綴りを確認してください";
  if (status === 422 || status === 400)
    return `入力の形が合いません（${status}）${detail ? `: ${detail}` : ""}`;
  return `Higgsfield が失敗を返しました（${status}）`;
}

export async function runHiggsfield(
  model: string,
  input: Record<string, unknown>,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<HiggsfieldOutcome> {
  const started = Date.now();
  const ms = () => Date.now() - started;
  const creds = readHiggsfieldCredentials(process.env);
  if (!creds) return { ok: false, reason: "Higgsfield の鍵が見つかりません", ms: ms() };
  const headers = {
    Authorization: `Key ${creds.credentials}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const pollMs = opts.pollMs ?? 2_000;
  try {
    const path = model.replace(/^\/+/, "");
    const res = await fetch(`${HIGGSFIELD_BASE_URL}/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { detail?: unknown } | null;
      const detail =
        typeof body?.detail === "string"
          ? body.detail
          : body?.detail
            ? JSON.stringify(body.detail)
            : "";
      return {
        ok: false,
        reason: explainHttp(res.status, detail.slice(0, 200)),
        httpStatus: res.status,
        ms: ms(),
      };
    }
    let r = pickHiggsfieldResult(await res.json());
    while (!DONE.has(r.status)) {
      if (!r.requestId)
        return { ok: false, reason: "受付番号が返りませんでした", status: r.status, ms: ms() };
      if (ms() > timeoutMs)
        return {
          ok: false,
          reason: `時間切れ（${Math.round(timeoutMs / 1000)}秒）`,
          status: r.status,
          ms: ms(),
        };
      await new Promise((ok) => setTimeout(ok, pollMs));
      const s = await fetch(`${HIGGSFIELD_BASE_URL}/requests/${r.requestId}/status`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      // 向こうの一時的な不調（500番台）は待って見直す（SDK と同じ）。
      if (s.status >= 500) continue;
      if (!s.ok)
        return { ok: false, reason: explainHttp(s.status, ""), httpStatus: s.status, ms: ms() };
      const next = pickHiggsfieldResult(await s.json());
      r = { ...next, requestId: next.requestId ?? r.requestId };
    }
    if (r.status === "completed" && r.url)
      return { ok: true, url: r.url, requestId: r.requestId, ms: ms() };
    const why =
      r.status === "nsfw"
        ? "内容の審査で断られました（残高は戻ります）"
        : r.status === "failed"
          ? "生成に失敗しました（残高は戻ります）"
          : r.status === "completed"
            ? "完了しましたが URL がありませんでした"
            : "取り消されました";
    return { ok: false, reason: why, status: r.status, ms: ms() };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    return {
      ok: false,
      reason:
        name === "TimeoutError"
          ? "Higgsfield が応答しませんでした"
          : "Higgsfield に繋がりませんでした",
      ms: ms(),
    };
  }
}

/** 鍵がどの名前で入っているか（値は返さない）。 */
export function higgsfieldCredentialSource(): string | null {
  return readHiggsfieldCredentials(process.env)?.source ?? null;
}
