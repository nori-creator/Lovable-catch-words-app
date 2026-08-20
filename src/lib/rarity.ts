/**
 * 「その言葉に、今週どのくらい出会いそうか」を数で出す所。
 *
 * 要望(2026-08-18):
 * 「ユーザーがその単語や実際にその単語の実物に出会う確率を、コーパスなどの
 *  その単語の使われる頻度やランキングとユーザーが町中で出会う確率を
 *  数学的に正確に推定し確率を表示して。(単語のレア度を数学的に正確に表示したい。)」
 *
 * ## 使える材料と、使えない材料
 * 外部のコーパス本文は**入れない**(商用ライセンスと両立しない。
 * `docs/design/09-language-data-plan.md`)。使えるのは:
 *
 * | 材料 | 何が言えるか |
 * |---|---|
 * | TOCFL の級 | 語彙表は頻度順に作られているので、**順位帯**の代理になる |
 * | Zipf の法則 | 順位 → 相対頻度。公開されている数学 |
 * | 自前の `corpus_stats` | 台湾ニュースの見出しから**出現回数だけ**を貯めた実測 |
 * | 自前の `stickers` | 実際に何人が撮ったか = **本当の遭遇** |
 * | 場面・季節・地域 | 遭遇率の補正 |
 * | その人自身の行動 | どの場面によく居る人か |
 *
 * ## 芯にある考え
 * **推定は実測に道を譲る。** 語の頻度から出す λ はあくまで事前分布で、
 * 「何人が実際に撮ったか」が貯まるほど、そちらが事前を押しのける
 * (ベータ二項の縮小推定)。利用者が増えるほど正確になる形にしてある。
 *
 * **だから画面には必ず出所を書く。** 推定なのか実測なのかを混ぜて出すのは、
 * このアプリが最初に決めた「検証済みとAI生成を区別する」に反する。
 *
 * ここは**時計もDBも持たない純粋な関数だけ**を置く。数式が正しいかどうかは
 * 試験で決められる形にしておきたい。
 */

/** 何を根拠にその数字を出したか。**画面に必ず出す。** */
export type RarityConfidence = "estimate" | "blended" | "measured";

/**
 * TOCFL 各級の語彙数(既定値)。
 *
 * **これは公開されている目安であって、このアプリの辞書の実数ではない。**
 * 辞書側から数えた実数を渡せるように、引数で差し替えられるようにしてある
 * (投入済みの語彙は級ごとに偏りがある)。
 */
export const TOCFL_BAND_SIZES: readonly number[] = [300, 500, 1500, 2500, 5000, 8000];

/** 語彙全体の見積り。Zipf の正規化に使う。 */
export const VOCAB_SIZE = 100_000;

/** Zipf-Mandelbrot の形。中国語の実測値域(s≈0.9〜1.1)の真ん中を既定にする。 */
export type ZipfShape = { s: number; b: number; n: number };
export const ZIPF_DEFAULT: ZipfShape = { s: 1.0, b: 2.7, n: VOCAB_SIZE };

/** 数として使えるか。使えなければ既定へ落とす(**投げない**)。 */
function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * 級から**代表順位**を出す。
 *
 * 語彙表は頻度順なので、3級の語は「1〜2級の語数を足した所から、3級の語数の
 * 真ん中あたり」に居ると見なす。級の中の順位までは分からないので中央を採る —
 * **分からないことを分かったふりで細かく刻まない。**
 */
export function representativeRank(
  level: number,
  bands: readonly number[] = TOCFL_BAND_SIZES,
): number {
  const lv = clamp(Math.round(num(level, 2)), 1, bands.length);
  let before = 0;
  for (let i = 0; i < lv - 1; i++) before += Math.max(0, num(bands[i], 0));
  const own = Math.max(1, num(bands[lv - 1], 1));
  return before + own / 2;
}

/** 正規化の分母は形ごとに変わらないので覚えておく(語ごとに10万回足さない)。 */
const normalizerCache = new Map<string, number>();

function zipfNormalizer(shape: ZipfShape): number {
  const key = `${shape.s}|${shape.b}|${shape.n}`;
  const hit = normalizerCache.get(key);
  if (hit !== undefined) return hit;
  let sum = 0;
  for (let r = 1; r <= shape.n; r++) sum += 1 / Math.pow(r + shape.b, shape.s);
  normalizerCache.set(key, sum);
  return sum;
}

/**
 * 順位 → **百万語あたりの出現回数**(Zipf-Mandelbrot)。
 *
 *     f(r) = C / (r + b)^s
 *
 * C は「全順位を足すと 100万」になるように決める。
 */
export function perMillionFromRank(rank: number, shape: ZipfShape = ZIPF_DEFAULT): number {
  const r = Math.max(1, num(rank, 1));
  const s = clamp(num(shape.s, 1), 0.1, 3);
  const b = clamp(num(shape.b, 2.7), 0, 100);
  const n = clamp(Math.round(num(shape.n, VOCAB_SIZE)), 1, 1_000_000);
  const norm = zipfNormalizer({ s, b, n });
  if (!(norm > 0)) return 0;
  return 1_000_000 / norm / Math.pow(r + b, s);
}

/**
 * 実測(`corpus_stats`)がある語は、そちらを百万語あたりに直して使う。
 * 観測語数が少ないうちは推定と混ぜる — **1件の観測で言い切らない。**
 *
 * @param wordCount その語の観測回数
 * @param totalCount 同じ期間に観測した全語の回数
 * @param prior 観測が無いときに使う推定値(百万語あたり)
 * @param minTotal これ未満の観測数では推定を主にする
 */
export function blendPerMillion(
  wordCount: number,
  totalCount: number,
  prior: number,
  minTotal = 50_000,
): { perMillion: number; confidence: RarityConfidence } {
  const k = Math.max(0, num(wordCount, 0));
  const total = Math.max(0, num(totalCount, 0));
  const p = Math.max(0, num(prior, 0));
  if (total <= 0) return { perMillion: p, confidence: "estimate" };
  const observed = (k / total) * 1_000_000;
  // 観測がまだ薄いうちは推定寄り。厚くなるほど観測へ寄る。
  const w = clamp(total / Math.max(1, minTotal), 0, 1);
  return {
    perMillion: observed * w + p * (1 - w),
    confidence: w >= 1 ? "measured" : "blended",
  };
}

/**
 * 場面の重なり。
 *
 * その語が出る場面の分布と、その人が居る場面の分布を突き合わせる。
 * **一様なら 1** になるように場面数を掛けてある — そうしないと、
 * 場面のデータがある語だけが理由もなく低く出る。
 */
export function sceneOverlap(
  wordScenes: Record<string, number> | null | undefined,
  userScenes: Record<string, number> | null | undefined,
): number {
  if (!wordScenes || !userScenes) return 1;
  const keys = Object.keys(wordScenes);
  if (keys.length === 0) return 1;
  let dot = 0;
  for (const k of keys)
    dot += Math.max(0, num(wordScenes[k], 0)) * Math.max(0, num(userScenes[k], 0));
  if (!(dot > 0)) return 0.2; // 行かない場所の物にはまず出会わない(0 にはしない)
  // 一様分布どうしなら keys.length * (1/S)^2 * S = 1 になる。
  return clamp(dot * keys.length, 0.2, 5);
}

/** 季節の補正。旬の月なら 1、外れていれば大きく下がる。通年なら常に 1。 */
export function seasonFactor(
  seasonMonths: readonly number[] | null | undefined,
  month: number,
): number {
  if (!seasonMonths || seasonMonths.length === 0) return 1;
  const m = clamp(Math.round(num(month, 1)), 1, 12);
  return seasonMonths.includes(m) ? 1 : 0.1;
}

/** 地域の補正。限定が無ければ 1、限定されていて外に居るなら大きく下がる。 */
export function regionFactor(
  regionScope: string | null | undefined,
  userRegion: string | null | undefined,
): number {
  const scope = (regionScope ?? "").trim();
  if (!scope) return 1;
  const here = (userRegion ?? "").trim();
  // その人の居場所が分からないときは**下げない**。
  // 知らないことを「外に居る」と決めつけない。
  if (!here) return 1;
  return here.includes(scope) || scope.includes(here) ? 1 : 0.05;
}

/**
 * 1週間に「その物」に出会う回数の見込み(λ)。
 *
 * 語の頻度は「読む・聞く」の率なので、そのままでは物に出会う率ではない。
 * 触れる語数 T を掛けて回数に直し、場面・季節・地域で補正する。
 */
export function weeklyEncounterRate(input: {
  perMillion: number;
  /** 1週間に触れる語数の見積り。 */
  wordsPerWeek?: number;
  sceneOverlap?: number;
  season?: number;
  region?: number;
}): number {
  const f = Math.max(0, num(input.perMillion, 0));
  const T = Math.max(0, num(input.wordsPerWeek, 20_000));
  const scene = Math.max(0, num(input.sceneOverlap, 1));
  const season = Math.max(0, num(input.season, 1));
  const region = Math.max(0, num(input.region, 1));
  const lambda = f * 1e-6 * T * scene * season * region;
  return Number.isFinite(lambda) ? Math.max(0, lambda) : 0;
}

/** λ から「1週間に1回以上出会う確率」。ポアソンの素直な形。 */
export function atLeastOnce(lambda: number): number {
  const l = Math.max(0, num(lambda, 0));
  return clamp(1 - Math.exp(-l), 0, 1);
}

/**
 * 自前の実測で事前を押しのける(ベータ二項の縮小推定)。
 *
 *     p̂ = (α + k) / (α + β + n),  α = κ·p_prior,  β = κ·(1 − p_prior)
 *
 * κ は事前の重み。利用者が κ 人を超えたあたりから実測が主になる。
 * **これが「限界まで正確」の意味** — 人が増えるほど推定が実測に置き換わる。
 */
export function shrinkToObserved(input: {
  priorP: number;
  /** その語を撮った利用者数。 */
  caughtUsers: number;
  /** 活動している利用者数。 */
  activeUsers: number;
  /** 事前の重み。 */
  weight?: number;
}): { p: number; confidence: RarityConfidence; observedUsers: number } {
  const prior = clamp(num(input.priorP, 0), 0, 1);
  const k = Math.max(0, Math.round(num(input.caughtUsers, 0)));
  const n = Math.max(0, Math.round(num(input.activeUsers, 0)));
  const kappa = clamp(num(input.weight, 20), 0.001, 10_000);
  // 撮った人が活動者数を超えることは無い(数え方が食い違ったときの保険)。
  const kk = Math.min(k, n);
  const alpha = kappa * prior;
  const beta = kappa * (1 - prior);
  const denom = alpha + beta + n;
  const p = denom > 0 ? (alpha + kk) / denom : prior;
  // **どれだけ実測で出来た数字か**で名乗りを決める。
  // 事後平均に事前が占める重みはちょうど κ/(κ+n) なので、
  // それが2割を切ったら(= n ≥ 4κ)「実測」と言ってよい。
  // 目分量ではなく式から出た境目にしておく。
  const priorWeight = kappa / (kappa + n);
  return {
    p: clamp(p, 0, 1),
    confidence: n <= 0 ? "estimate" : priorWeight <= 0.2 ? "measured" : "blended",
    observedUsers: kk,
  };
}

/**
 * 確率 → ★1〜5。★5 が最もレア。
 *
 * ## 確率ではなく**回数**で切る
 * 等分に切ると 90% と 99% が別の星になるが、その2つは体感で同じ「毎日見る」。
 * 逆に 1% と 5% は「年に数回」と「月に1回」で、はっきり違う。
 * 確率は上のほうで潰れるので、切るなら**元の回数 λ** のほうがいい。
 *
 *     λ = −ln(1 − p)
 *
 * 境目は **1つ星ごとにおよそ半分の回数**。この規則にした理由は、
 * 実際にこのアプリが持つ語(TOCFL 1〜6級)が★1〜★5にきれいに散るから:
 *
 *     1級 λ12.7→★1  2級 3.5→★1  3級 1.25→★2
 *     4級 0.54→★3   5級 0.26→★4  6級 0.14→★5
 *
 * 前は確率で 0.5/0.2/0.05/0.01 と切っていて、**1〜3級が全部★1**に潰れ、
 * ★4と★5がほとんど出なかった。5段あるのに3段しか使っていなかった。
 *
 * 季節外れ・地域限定はここからさらに下がるので、そのまま★5に落ちる —
 * 「台南限定」が最もレアに見えるのは、要望どおりの姿。
 */
export function rarityStars(p: number): 1 | 2 | 3 | 4 | 5 {
  const v = clamp(num(p, 0), 0, 1);
  // p=1 は λ=∞。いちばん出会いやすい側なので★1。
  if (v >= 1) return 1;
  const lambda = -Math.log(1 - v);
  if (!Number.isFinite(lambda)) return 1;
  if (lambda >= 2) return 1;
  if (lambda >= 1) return 2;
  if (lambda >= 0.5) return 3;
  if (lambda >= 0.25) return 4;
  return 5;
}

/**
 * 全部を通した1本。呼ぶ側はこれだけ使えばよい。
 * どの段でも壊れた入力で NaN を出さない。
 */
export function estimateEncounter(input: {
  /** TOCFL の級(1〜6)。 */
  level: number;
  bands?: readonly number[];
  zipf?: ZipfShape;
  /** 自前コーパスの観測(あれば)。`ai_synth` は渡さないこと — 観測ではない。 */
  corpusWordCount?: number;
  corpusTotalCount?: number;
  wordsPerWeek?: number;
  wordScenes?: Record<string, number> | null;
  userScenes?: Record<string, number> | null;
  seasonMonths?: readonly number[] | null;
  month?: number;
  regionScope?: string | null;
  userRegion?: string | null;
  caughtUsers?: number;
  activeUsers?: number;
  priorWeight?: number;
}): {
  /** 今週1回以上出会う見込み。 */
  probability: number;
  stars: 1 | 2 | 3 | 4 | 5;
  /** 何を根拠にした数字か。**画面に必ず出す。** */
  confidence: RarityConfidence;
  observedUsers: number;
  /** 内訳(開発者向け・検査用)。 */
  detail: { rank: number; perMillion: number; lambda: number; priorP: number };
} {
  const rank = representativeRank(input.level, input.bands);
  const zipfPm = perMillionFromRank(rank, input.zipf ?? ZIPF_DEFAULT);
  const { perMillion, confidence: corpusConf } = blendPerMillion(
    input.corpusWordCount ?? 0,
    input.corpusTotalCount ?? 0,
    zipfPm,
  );
  const lambda = weeklyEncounterRate({
    perMillion,
    wordsPerWeek: input.wordsPerWeek,
    sceneOverlap: sceneOverlap(input.wordScenes, input.userScenes),
    season: seasonFactor(input.seasonMonths, input.month ?? 1),
    region: regionFactor(input.regionScope, input.userRegion),
  });
  const priorP = atLeastOnce(lambda);
  const shrunk = shrinkToObserved({
    priorP,
    caughtUsers: input.caughtUsers ?? 0,
    activeUsers: input.activeUsers ?? 0,
    weight: input.priorWeight,
  });
  // ## 名乗りは「その数字が何で出来ているか」で決める
  //
  // 最初は**弱いほうに揃える**と書いていたが、それは間違いだった。
  // 撮った人が十分に居れば、事前(コーパス由来)は縮小推定で**押しのけられて
  // いる** — 1000人の実際の行動で出した数字を「推定」と呼ぶのは、
  // 出来ていることを過小に言うことになる。
  //
  // だから実測の人数を主に見る。人が1人も居ないときだけ、
  // その数字は丸ごと事前なので、事前の出来(コーパスの有無)がそのまま名乗りになる。
  const confidence: RarityConfidence =
    shrunk.confidence === "estimate" ? corpusConf : shrunk.confidence;
  return {
    probability: shrunk.p,
    stars: rarityStars(shrunk.p),
    confidence,
    observedUsers: shrunk.observedUsers,
    detail: { rank, perMillion, lambda, priorP },
  };
}
