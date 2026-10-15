/**
 * **候補の「どんな言い方か」の印（1本の物差し）**。オーナー指示 2026-10-15:
 *
 * > 写真のタグは台湾の人がふだんいちばんよく使う言い方。詳しい名前・固有名詞にしない。
 * > 候補は「一般的な言い方」を上に、口語・より詳しい言い方・学術的な言い方・固有名詞の順で下へ。
 * > どの候補にも必ず印を付ける: 一般的な言い方 / 口語 / より詳しい言い方 / 学術的な言い方 / 固有名詞。
 *
 * 前は道ごとに別の物差しだった — 写真の候補は `common|casual|specific|proper`、打った語の候補は
 * 文体（`spoken|written|both|technical|signage`）。iOS は写真の4つしか知らないので、打った語の候補
 * （例: ボクサーパンツ → 平口褲 / 四角褲 / 內褲）には**印が1つも出なかった**。いまは全部の候補の
 * `register` がこの5つのどれか（文体は打った語の候補の `style` に移した）。
 *
 * 写真・打った語・スキャン・チュートリアルの候補が全部ここを通る（`finalizeNameRegisters`）。
 */

/** 並びの順（上ほど先）。 */
export const NAME_REGISTERS = ["common", "colloquial", "specific", "academic", "proper"] as const;
export type NameRegister = (typeof NAME_REGISTERS)[number];

const RANK: Record<NameRegister, number> = {
  common: 0,
  colloquial: 1,
  specific: 2,
  academic: 3,
  proper: 4,
};

/** 並べ替えの段（知らない値・空は一般的な言い方と同じ段）。 */
export function nameRegisterRank(r: string | null | undefined): number {
  return RANK[(r ?? "") as NameRegister] ?? 0;
}

/** 画面の札の言葉（オーナーの呼び名）。iOS もこの言葉を使う。 */
export const NAME_REGISTER_LABELS = {
  common: {
    ja: "一般的な言い方",
    en: "Common",
    "zh-TW": "一般說法",
  },
  colloquial: {
    ja: "口語",
    en: "Colloquial",
    "zh-TW": "口語",
  },
  specific: {
    ja: "より詳しい言い方",
    en: "More specific",
    "zh-TW": "更具體的說法",
  },
  academic: {
    ja: "学術的な言い方",
    en: "Academic / technical",
    "zh-TW": "學術說法",
  },
  proper: {
    ja: "固有名詞",
    en: "Proper noun",
    "zh-TW": "專有名詞",
  },
} satisfies Record<NameRegister, Record<string, string>>;

/**
 * AI が返した印を5つのどれかに直す。読めなければ `null`（呼ぶ側が埋める）。
 *
 * 古い印も読む: 写真の `casual` → colloquial、打った語の文体 `spoken` → colloquial、
 * `technical` → academic、`both` / `signage` / `written` → common。
 */
export function normalizeNameRegister(raw: unknown): NameRegister | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if ((NAME_REGISTERS as readonly string[]).includes(v)) return v as NameRegister;
  if (/^(casual|informal|spoken|slang|colloq|口語|口语|俗|くだけ|砕け)/.test(v))
    return "colloquial";
  if (
    /^(academic|technical|scientific|specialist|professional|jargon|學術|学術|学术|專業|専門)/.test(
      v,
    )
  )
    return "academic";
  if (/^(proper|brand|trademark|name of|固有|商標|品牌|專有)/.test(v)) return "proper";
  if (/^(specific|detailed|narrow|precise|formal name|正式|詳しい|くわしい|更具體)/.test(v))
    return "specific";
  if (/^(common|general|standard|neutral|everyday|both|signage|written|一般|普通|ふだん)/.test(v))
    return "common";
  return null;
}

type Groupable = { register?: unknown; group?: number | null };

/**
 * **全部の候補に印を付け、決まった順に並べる**（AI は呼ばない）。
 *
 * - 物ごと（`group`）に分ける。番号が無い候補は全部で1つの物（打った語の候補）。物の並びは AI の順のまま。
 * - 読めない・無い印を埋める: その物の1つ目 → common、2つ目から → specific（同じ物の別の名前は、
 *   ふつうはより詳しい名前）。
 * - 物の中を common → colloquial → specific → academic → proper に並べる。同じ段の中は AI の順（よく使う順）。
 * - **物の1つ目は必ず一般的な言い方**: common が1つも無い物は、固有名詞でない最初の候補を先頭に出して
 *   common にする（タグに詳しい名前・固有名詞を出さない）。全部が固有名詞の物だけはそのまま。
 */
export function finalizeNameRegisters<T extends Groupable>(
  items: readonly T[],
): Array<T & { register: NameRegister }> {
  const order: string[] = [];
  const buckets = new Map<string, Array<T & { register: NameRegister }>>();
  for (const it of items) {
    const key = typeof it.group === "number" ? `g${it.group}` : "all";
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    const bucket = buckets.get(key)!;
    const register =
      normalizeNameRegister(it.register) ?? (bucket.length === 0 ? "common" : "specific");
    bucket.push({ ...it, register });
  }
  const out: Array<T & { register: NameRegister }> = [];
  for (const key of order) {
    const sorted = buckets
      .get(key)!
      .map((it, i) => ({ it, i }))
      .sort((a, b) => RANK[a.it.register] - RANK[b.it.register] || a.i - b.i)
      .map((x) => x.it);
    if (sorted.length > 0 && sorted[0].register !== "common") {
      const k = sorted.findIndex((c) => c.register !== "proper");
      if (k >= 0) {
        const [promoted] = sorted.splice(k, 1);
        sorted.unshift({ ...promoted, register: "common" });
      }
    }
    out.push(...sorted);
  }
  return out;
}

/** 指示文に入れる印の説明（写真・打った語・スキャンで同じ文）。 */
export const NAME_REGISTER_RULE =
  `register は**どの候補にも必ず1つ**、次のどれか: ` +
  `common（一般的な言い方: その土地の人がその物を指して日常会話でいちばん自然に口にする語）/ ` +
  `colloquial（口語: 会話だけで使うくだけた言い方・略語）/ ` +
  `specific（より詳しい言い方: もっと狭い種類の名前・正式な名前）/ ` +
  `academic（学術的な言い方: 専門用語・学名・業界の言葉）/ ` +
  `proper（固有名詞: 商品名・ブランド・店名）。` +
  `\n並びは common → colloquial → specific → academic → proper。同じ印の中はよく使う順。` +
  `**1つ目は必ず common**（タグとして写真に出るのはこの語）。詳しい名前・固有名詞を1つ目にしない。` +
  `ただし上位の分類語（衣服・肉・飲み物）に逃げない — その物をふだん何と呼ぶかで決める。` +
  `例: ボクサーパンツの写真 → common 內褲（台湾の人がふだんそう呼ぶ）、specific 四角褲・平口褲（より狭い種類の名前）。`;
