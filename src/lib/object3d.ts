/**
 * **撮った物を「360度回せる 3D」で手に入れる**（Pro の機能、オーナー指示 2026-09-28 R13
 * 「課金ユーザーの機能として、カメラモードで撮ったものがステッカーではなく3Dの360度回転して
 * リアルなものをゲットできる機能を作りたい。試作品を実装して」）。
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
export type Object3dProvider = "trellis2" | "hunyuan3d" | "sam3d" | "custom";

export type Object3dConfig = {
  endpoint: string | null;
  provider: Object3dProvider;
  /** 鍵があるか（値そのものは持ち回らない）。 */
  hasKey: boolean;
};

const PROVIDERS: Object3dProvider[] = ["trellis2", "hunyuan3d", "sam3d", "custom"];

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

/** Pro だけ。無料の人には「Pro で使える」の案内を出す（押しても作らない）。 */
export function object3dAllowed(p: { isPro: boolean }): boolean {
  return p.isPro;
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
  trellis2: "Microsoft TRELLIS.2",
  hunyuan3d: "Tencent Hunyuan3D 2.1",
  sam3d: "Meta SAM 3D Objects",
  custom: "独自の窓口",
};
