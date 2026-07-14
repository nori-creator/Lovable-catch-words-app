import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { assertWithinDailyCap, getAi, logUsage } from "./ai-provider.server";

/**
 * Scan-First MVP §3.2 — one AI call combines object detection + OCR and returns
 * a fixed JSON. The client draws dots at normalized coords (0..1000). We also
 * record every result into scan_events (§3.7) so "調べたが保存しなかった語" can
 * resurface later.
 */

const DetectInput = z.object({
  // Cap ~8MB base64 (~6MB raw) to prevent cost/memory abuse via AI vision calls.
  imageBase64: z.string().min(100).max(8_000_000), // data URL or raw base64
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

const DetectItemSchema = z.object({
  kind: z.enum(["object", "text"]),
  headword: z.string().min(1),
  zhuyin: z.string().default(""),
  pinyin: z.string().default(""),
  meaning_ja: z.string().default(""),
  pos: z.string().default(""),
  point: z.tuple([z.number(), z.number()]),
  confidence: z.number().min(0).max(1).default(0.8),
  alternatives: z.array(z.string()).default([]),
});

const DetectResponseSchema = z.object({
  items: z.array(DetectItemSchema).max(12),
});

export type DetectedItem = z.infer<typeof DetectItemSchema> & { id: string };

export type DictionaryEntry = {
  headword: string;
  zhuyin: string | null;
  pinyin: string | null;
  meaning_ja: string;
  pos: string | null;
  tocfl_level: number | null;
  audio_path: string | null;
  /** Signed URL for the pre-generated audio (§4.3). Play directly — no TTS round trip. */
  audio_url: string | null;
  source: string | null;
  entry_type: string | null;
};

function parseJsonFromAiText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return JSON.parse(fenced[1]);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  return JSON.parse(trimmed);
}

const PROMPT = `あなたは台湾華語(zh-TW / 繁体字 / 注音)の学習アプリの検出エンジンです。
入力画像から、学習価値のある「モノ (kind=object)」と「写っている文字 (kind=text)」を検出してください。

厳守ルール:
- 出力は下記スキーマに厳密に従うJSONオブジェクトのみ。前置き・後書き・コードフェンス禁止。
- 台湾教育部準拠の正式な繁体字を使用。大陸簡体字・大陸独自語彙は禁止(例: 出租车✗ → 計程車○)。
- TOCFL 1〜3レベルの語を優先。学習価値の低いもの(壁・空・地面など)は返さない。
- kind=text は看板・メニュー・商品ラベルなど「写っている文字そのもの」。推測で足したり書き換えたりしない。
- point は画像を 0〜1000 に正規化した座標 [x, y]。物体/文字の中心。
- confidence は 0〜1。断定できないときは 0.75 未満にし、alternatives に紛らわしい候補を1〜2個入れる。
- items は最大 8 個。大きく写っている・学習価値の高いものを優先。
- 各項目に zhuyin(注音)・pinyin・meaning_ja(日本語訳)・pos(名詞/動詞など日本語)を必ず埋める。
- 名詞だけでなく、シーンの中心的な**状態・動作**も学べるようにする: 画像を最もよく表す動詞または形容詞を1〜2個まで追加してよい(例: 湯気の立つ麺→「熱」、雨の街→「下雨」、走る人→「跑步」)。kind=object、pos=動詞/形容詞、point はその様子が見える場所。無理にひねり出さず、はっきり写っている時だけ。

出力スキーマ:
{
  "items": [
    {
      "kind": "object" | "text",
      "headword": "繁体字",
      "zhuyin": "ㄇㄤˊ ㄍㄨㄛˇ",
      "pinyin": "mángguǒ",
      "meaning_ja": "マンゴー",
      "pos": "名詞",
      "point": [512, 340],
      "confidence": 0.93,
      "alternatives": []
    }
  ]
}`;

export const detectScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DetectInput.parse(input))
  .handler(async ({ data, context }) => {
    const ai = getAi();
    const { supabase, userId } = context;
    await assertWithinDailyCap(userId, "scan_detect");

    const imageInput = data.imageBase64.startsWith("data:")
      ? data.imageBase64
      : `data:image/jpeg;base64,${data.imageBase64}`;

    const t0 = Date.now();
    let text = "";
    try {
      const r = await generateText({
        model: ai.gateway(ai.modelFast),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image", image: imageInput },
            ],
          },
        ],
      });
      text = r.text;
    } catch (e) {
      throw new Error(`scan detect failed: ${(e as Error).message}`);
    }

    let parsed: z.infer<typeof DetectResponseSchema>;
    try {
      parsed = DetectResponseSchema.parse(parseJsonFromAiText(text));
    } catch {
      throw new Error("AI did not return valid detection JSON");
    }

    await logUsage(supabase, userId, "scan_detect");

    // §7 measurement: server-side detection latency (AI call + parse).
    // The client's full scan→dots number additionally includes upload+render.
    const detectMs = Date.now() - t0;

    // §3.7 record every detected item as a scan_event (tapped=false initially)
    if (parsed.items.length > 0) {
      const rows = parsed.items.map((it) => ({
        user_id: userId,
        headword: it.headword,
        meaning_ja: it.meaning_ja || null,
        kind: it.kind,
        confidence: it.confidence,
        tapped: false,
        caught: false,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        detect_ms: detectMs,
      }));
      const { error: insErr } = await supabase.from("scan_events").insert(rows);
      if (insErr && /detect_ms/.test(insErr.message)) {
        // Migration not applied yet — keep the funnel log working without the column.
        await supabase.from("scan_events").insert(rows.map(({ detect_ms: _detectMs, ...r }) => r));
      }
    }

    const items: DetectedItem[] = parsed.items.map((it, i) => ({
      ...it,
      id: `${Date.now()}_${i}`,
    }));
    return { items };
  });

/**
 * §3.5 「+細かく」 on-demand hierarchical detection. The client crops a region
 * around a previously-tapped object (e.g. 手) and sends it in; we ask the fast
 * model to enumerate *parts* of that thing (拇指 / 手掌 / 指甲) with normalized
 * coords **within the cropped region**. The client maps them back into the
 * parent frame. Kept as a second call so the initial scan stays fast.
 */
const DetectPartsInput = z.object({
  imageBase64: z.string().min(100).max(8_000_000),
  parentHeadword: z.string().min(1).max(40),
});

export const detectParts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DetectPartsInput.parse(input))
  .handler(async ({ data, context }) => {
    const ai = getAi();
    await assertWithinDailyCap(context.userId, "scan_parts");
    const imageInput = data.imageBase64.startsWith("data:")
      ? data.imageBase64
      : `data:image/jpeg;base64,${data.imageBase64}`;

    const prompt = `画像には「${data.parentHeadword}」が写っています。この物体を構成する**部分・要素**の名称を、台湾華語(繁体字/注音)で学習価値のあるものだけ最大6個抽出してください。
- 全体名(${data.parentHeadword})は含めない
- 部位・部品・素材・付随物のみ(例: 手→拇指/手掌/指甲/手腕)
- point は切り取られた画像内での中心座標を 0〜1000 に正規化した [x, y]
- 台湾教育部準拠の正式な繁体字。TOCFL 1〜3レベル優先
- 出力はJSONのみ、前置き/コードフェンス禁止

出力スキーマ:
{"items":[{"kind":"object","headword":"拇指","zhuyin":"ㄇㄨˇ ㄓˇ","pinyin":"mǔzhǐ","meaning_ja":"親指","pos":"名詞","point":[420,510],"confidence":0.9,"alternatives":[]}]}`;

    let text = "";
    try {
      const r = await generateText({
        model: ai.gateway(ai.modelFast),
        messages: [
          { role: "user", content: [
            { type: "text", text: prompt },
            { type: "image", image: imageInput },
          ] },
        ],
      });
      text = r.text;
    } catch (e) {
      throw new Error(`detect parts failed: ${(e as Error).message}`);
    }

    let parsed: z.infer<typeof DetectResponseSchema>;
    try { parsed = DetectResponseSchema.parse(parseJsonFromAiText(text)); }
    catch { throw new Error("AI did not return valid parts JSON"); }

    await logUsage(context.supabase, context.userId, "scan_parts");

    // Also log parts into scan_events so recollection notifications can surface them.
    if (parsed.items.length > 0) {
      await context.supabase.from("scan_events").insert(parsed.items.map((it) => ({
        user_id: context.userId,
        headword: it.headword,
        meaning_ja: it.meaning_ja || null,
        kind: it.kind,
        confidence: it.confidence,
        tapped: false,
        caught: false,
      })));
    }

    const items: DetectedItem[] = parsed.items.map((it, i) => ({
      ...it,
      id: `part_${Date.now()}_${i}`,
    }));
    return { items };
  });


/**
 * Bulk lookup for detected headwords against the verified dictionary (§4.2).
 * Returns a map keyed by headword so the client can decorate chips with the
 * "✓ 検証済み" badge and prefer DB values over AI output.
 */
export const lookupHeadwords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      headwords: z.array(z.string()).max(20),
      language: z.string().default("zh-TW"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const words = Array.from(new Set(data.headwords.map((s) => s.trim()).filter(Boolean)));
    const empty: Record<string, DictionaryEntry> = {};
    if (words.length === 0) return { entries: empty };
    const { data: rows, error } = await context.supabase
      .from("dictionary_entries")
      .select("headword, zhuyin, pinyin, meaning_ja, pos, tocfl_level, audio_path, source, entry_type")
      .eq("language", data.language)
      .in("headword", words);
    if (error) throw new Error(error.message);

    // §4.3: pre-generated audio is served straight from Storage. Sign all
    // audio paths in one call so tap→audio start needs zero further requests.
    const paths = (rows ?? []).map((r) => r.audio_path).filter((p): p is string => !!p);
    const urlByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await context.supabase.storage
        .from("tts")
        .createSignedUrls([...new Set(paths)], 60 * 60 * 6);
      for (const row of signed ?? []) {
        if (row.path && row.signedUrl && !row.error) urlByPath.set(row.path, row.signedUrl);
      }
    }

    const map: Record<string, DictionaryEntry> = {};
    for (const r of rows ?? []) {
      map[r.headword] = {
        ...(r as Omit<DictionaryEntry, "audio_url">),
        audio_url: r.audio_path ? (urlByPath.get(r.audio_path) ?? null) : null,
      };
    }
    return { entries: map };
  });

/**
 * §3.1b dot-state context: the user's own cards + previously tapped words,
 * fetched once per scan session and matched client-side (zero AI calls).
 * Headwords are NFC-normalized so 你/你 variants from different sources match.
 */
export type ScanContextEntry = {
  sticker_id: string;
  has_photo: boolean;
  found_at: string;
};

export type ScanContext = {
  owned: Record<string, ScanContextEntry>;
  tapped: string[];
};

const normHeadword = (s: string) => s.normalize("NFC").trim();

export const getScanContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ScanContext> => {
    const { supabase, userId } = context;
    let [stickerRes, tapRes] = await Promise.all([
      supabase
        .from("stickers")
        .select("id, created_at, capture_type, cutout_image_url, object_image_url, words(headword)")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(2000),
      supabase
        .from("scan_events")
        .select("headword")
        .eq("user_id", userId)
        .eq("tapped", true)
        .order("created_at", { ascending: false })
        .limit(3000),
    ]);
    if (stickerRes.error && /capture_type/.test(stickerRes.error.message)) {
      // Migration not applied yet — every sticker is a photo catch then.
      stickerRes = (await supabase
        .from("stickers")
        .select("id, created_at, cutout_image_url, object_image_url, words(headword)")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(2000)) as typeof stickerRes;
    }

    const owned: Record<string, ScanContextEntry> = {};
    type Row = {
      id: string;
      created_at: string;
      capture_type: string | null;
      cutout_image_url: string | null;
      object_image_url: string | null;
      words: { headword: string } | null;
    };
    for (const r of (stickerRes.data ?? []) as unknown as Row[]) {
      if (!r.words?.headword) continue;
      const key = normHeadword(r.words.headword);
      const hasPhoto =
        (r.capture_type ?? "photo") === "photo" || !!r.cutout_image_url || !!r.object_image_url;
      const prev = owned[key];
      // Keep the earliest sticker; a photo on any sticker counts as captured.
      if (!prev) {
        owned[key] = { sticker_id: r.id, has_photo: hasPhoto, found_at: r.created_at };
      } else if (hasPhoto && !prev.has_photo) {
        prev.has_photo = true;
      }
    }

    const tapped = [...new Set((tapRes.data ?? []).map((r) => normHeadword(r.headword)))];
    return { owned, tapped };
  });

export const markScanTap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      headword: z.string().min(1),
      tap_to_audio_ms: z.number().int().nonnegative().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Best-effort: flip the most recent matching scan_event to tapped=true.
    const { data: rows } = await context.supabase
      .from("scan_events")
      .select("id")
      .eq("user_id", context.userId)
      .eq("headword", data.headword)
      .order("created_at", { ascending: false })
      .limit(1);
    const id = rows?.[0]?.id;
    if (id) {
      const patch: { tapped: boolean; tap_to_audio_ms?: number } = { tapped: true };
      if (data.tap_to_audio_ms != null) patch.tap_to_audio_ms = data.tap_to_audio_ms;
      const { error } = await context.supabase.from("scan_events").update(patch).eq("id", id);
      if (error && /tap_to_audio_ms/.test(error.message)) {
        await context.supabase.from("scan_events").update({ tapped: true }).eq("id", id);
      }
    }
    return { ok: true };
  });

export const markScanCaught = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ headword: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("scan_events")
      .select("id")
      .eq("user_id", context.userId)
      .eq("headword", data.headword)
      .order("created_at", { ascending: false })
      .limit(1);
    const id = rows?.[0]?.id;
    if (id) await context.supabase.from("scan_events").update({ tapped: true, caught: true }).eq("id", id);
    return { ok: true };
  });

