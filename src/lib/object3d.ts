/**
 * **撮った物を「360度回せる 3D」で手に入れる**（Pro の機能、オーナー指示 2026-09-28 R13
 * 「課金ユーザーの機能として、カメラモードで撮ったものがステッカーではなく3Dの360度回転して
 * リアルなものをゲットできる機能を作りたい。試作品を実装して」）。
 *
 * **既定は Tripo3D**（オーナー添付の GitHub「Camera to 3D」ahujasid 作・MIT と同じ作り）:
 *   写真 → Tripo に上げる → 2つの仕事を同時に頼む
 *     ・下書き（色なし・1万面・速い 20〜40 秒）… 点が集まって形になる演出に使う
 *     ・仕上げ（色と質感つき・30〜50 秒）… 出来たら下書きと入れ替える
 *   → 進み具合を数秒ごとに聞く → GLB の場所を受け取る。
 *   鍵は Lovable の Secrets に `TRIPO_API_KEY`（サーバだけが読む）。
 *
 * 写真1枚から 3D の形（glTF/GLB = 3D の絵の標準の入れ物）を作る AI は、2026 年時点で
 * 公開の物がいくつもある（Microsoft TRELLIS.2、Tencent Hunyuan3D 2.1、Meta SAM 3D Objects
 * など）。どれも**GPU（画像用の計算機）の上で動かす**もので、このアプリの中では動かない。
 * そこで「写真を送ると GLB の場所が返ってくる」**窓口（エンドポイント）1つ**だけを約束し、
 * 窓口の向こうの AI は差し替えられるようにする。
 *
 *   OBJECT3D_ENDPOINT  窓口の URL（無ければ機能は「準備中」）
 *   OBJECT3D_API_KEY   窓口の鍵（サーバだけが読む。画面にも記録にも出さない）
 *   OBJECT3D_PROVIDER  表示用の名前（trellis2 / hunyuan3d / sam3d / custom）
 */
export type Object3dProvider = "tripo" | "trellis2" | "hunyuan3d" | "sam3d" | "custom";

export type Object3dConfig = {
  endpoint: string | null;
  provider: Object3dProvider;
  /** 鍵があるか（値そのものは持ち回らない）。 */
  hasKey: boolean;
};

const PROVIDERS: Object3dProvider[] = ["tripo", "trellis2", "hunyuan3d", "sam3d", "custom"];

export function readObject3dConfig(env: Record<string, string | undefined>): Object3dConfig {
  const raw = env.OBJECT3D_ENDPOINT?.trim();
  let endpoint: string | null = null;
  if (raw) {
    try {
      const u = new URL(raw);
      // 鍵を平文で送らない（https だけ。手元の試験用の localhost は許す）。
      if (u.protocol === "https:" || u.hostname === "localhost") endpoint = u.toString();
    } catch {
      endpoint = null;
    }
  }
  const p = env.OBJECT3D_PROVIDER?.trim() as Object3dProvider | undefined;
  return {
    endpoint,
    provider: p && PROVIDERS.includes(p) ? p : "custom",
    hasKey: !!env.OBJECT3D_API_KEY?.trim(),
  };
}

/**
 * **開発者だけ**（オーナー指示 2026-09-29「開発者の私は pro プランだけど、今から友達に
 * シェアするから、私以外は 3D モデル機能使えないようにして」）。Pro かどうかは見ない —
 * 生成は1回ごとに料金がかかるので、試している間は開発者の鍵でだけ動かす。
 */
export function object3dAllowed(p: { isAdmin: boolean }): boolean {
  return p.isAdmin;
}

/**
 * 窓口の返事から GLB の場所を取り出す。窓口ごとに返事の形が違うので、よくある形を
 * 全部受ける: `{ glb }` / `{ model_url }` / `{ url }` / `{ output: "…glb" }` /
 * `{ output: ["…glb"] }` / `{ model_mesh: { url } }`（fal.ai の形）。
 * GLB（または glTF）の https の URL でなければ null。
 */
export function pickGlbUrl(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const cands: unknown[] = [
    o.glb,
    o.model_url,
    o.url,
    o.output,
    Array.isArray(o.output)
      ? o.output.find((v) => typeof v === "string" && /\.gl(b|tf)/i.test(v))
      : null,
    (o.model_mesh as { url?: unknown } | undefined)?.url,
    (o.model_glb as { url?: unknown } | undefined)?.url,
  ];
  for (const c of cands) {
    if (typeof c !== "string") continue;
    try {
      const u = new URL(c);
      if (u.protocol !== "https:") continue;
      if (!/\.gl(b|tf)$/i.test(u.pathname) && !/model|mesh|glb/i.test(u.pathname)) continue;
      return u.toString();
    } catch {
      continue;
    }
  }
  return null;
}

/** 表示用の名前（開発者の画面・案内で使う）。 */
export const OBJECT3D_PROVIDER_LABEL: Record<Object3dProvider, string> = {
  tripo: "Tripo3D",
  trellis2: "Microsoft TRELLIS.2",
  hunyuan3d: "Tencent Hunyuan3D 2.1",
  sam3d: "Meta SAM 3D Objects",
  custom: "独自の窓口",
};

// ---- Tripo3D ---------------------------------------------------------------------------

export const TRIPO_BASE_URL = "https://api.tripo3d.ai/v2/openapi";

/**
 * **Tripo の鍵を探す**（オーナー報告 2026-09-29「TRIPO ai の api を lovable に追加した」）。
 * Lovable の Secrets に入れた名前が分からないので、よく付けられる名前を順に見る。
 * 返すのは値と**見つけた名前**。値はサーバの中だけで使い、画面・記録には名前だけを出す。
 */
export const TRIPO_KEY_NAMES = [
  "TRIPO_API_KEY",
  "TRIPO3D_API_KEY",
  "TRIPO_AI_API_KEY",
  "TRIPOAI_API_KEY",
  "TRIPO_KEY",
  "TRIPO_SECRET_KEY",
] as const;
export function readTripoKey(
  env: Record<string, string | undefined>,
): { key: string; source: string } | null {
  for (const name of TRIPO_KEY_NAMES) {
    const v = (env[name] ?? "").trim();
    if (v) return { key: v, source: name };
  }
  return null;
}

/** Tripo に頼む仕事の中身。下書き（速い・色なし）と仕上げ（色と質感）。 */
export function tripoTaskBody(
  imageToken: string,
  kind: "preview" | "final",
  /** 上げた絵の種類（実際の中身と合わせる。png と書いて jpg を渡すと失敗する）。 */
  type: "png" | "jpg" | "webp" = "png",
) {
  const file = { type, file_token: imageToken };
  return kind === "preview"
    ? {
        type: "image_to_model",
        file,
        model_version: "v3.0-20250812",
        texture: false,
        pbr: false,
        export_uv: false,
        face_limit: 10000,
      }
    : { type: "image_to_model", file, model_version: "v3.1-20260211", texture: true, pbr: true };
}

export type Object3dTaskState =
  | { status: "running"; progress: number }
  | { status: "success"; progress: 100; modelUrl: string }
  | { status: "failed"; progress: number; reason?: string };

/** Tripo の「仕事の様子」の返事を読む。 */
export function readTripoTask(json: unknown): Object3dTaskState {
  const o = (json ?? {}) as { code?: number; message?: string; data?: Record<string, unknown> };
  if (o.code !== 0 || !o.data)
    return { status: "failed", progress: 0, reason: `code ${o.code ?? "-"} ${o.message ?? ""}` };
  const d = o.data;
  const progress = Math.max(0, Math.min(100, Number(d.progress) || 0));
  const st = String(d.status ?? "");
  if (st === "success") {
    const out = (d.output ?? {}) as Record<string, unknown>;
    const url = [out.pbr_model, out.model, out.base_model].find(
      (u): u is string => typeof u === "string" && u.startsWith("https://"),
    );
    return url
      ? { status: "success", progress: 100, modelUrl: url }
      : { status: "failed", progress, reason: "no model url" };
  }
  if (["failed", "banned", "expired", "cancelled", "unknown"].includes(st))
    return { status: "failed", progress, reason: st };
  return { status: "running", progress };
}

/**
 * 3D の形を画面へ中継してよい場所か（Tripo の配信先だけ）。どこでも中継すると、
 * このアプリのサーバが誰かの踏み台になる（任意の URL を取りに行かせる攻撃）。
 */
export function isAllowedModelUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    return /(^|\.)tripo3d\.(ai|com)$/i.test(u.hostname);
  } catch {
    return false;
  }
}
