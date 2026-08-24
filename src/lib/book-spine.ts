/**
 * 本棚に立つ**背表紙**の見た目を決める唯一の場所。
 *
 * オーナー指摘 2026-08-21:
 * > 「復習の単語帳の復習は上部に**リアルな本の本棚**を作って、
 * >  **背表紙のタイトルが見える**ようにし、いろんな単語帳を選択できる
 * >  ようにして。」
 *
 * ホーム側にも同じ注文がある(「壁紙を変更するところを本物の本の背表紙の
 * 本棚にして」)。**先に1つ作って両方から呼ぶ** — 別々に作ると、
 * この app が何度も踏んだ「同じ物が画面ごとに違う見た目で出る」に戻る。
 *
 * ## 本物らしさは「揃っていないこと」
 * 同じ幅・同じ高さ・同じ色の板が並んでも本棚には見えない。ただし
 * **毎回ばらけてもいけない** — 開くたび並びが変わる棚は、
 * 「さっき左から3冊目にあった本」を探し直すことになる。
 * だから**題名から決まる**ばらつきにする(同じ本はいつも同じ姿)。
 *
 * ## 色は素の16進を書かない
 * `--spine-1`〜`--spine-8` を明暗どちらにも定義してある。暗い面で
 * 発光した前例があるので、色は必ずトークンから取る。
 *
 * 外の世界に触れるものをここに入れないこと。
 */

/** 用意してある背表紙の色の数(`src/styles.css` の `--spine-N`)。 */
export const SPINE_TONES = 8;

/**
 * 背表紙の幅(px)。細すぎると題が読めず、太すぎると3冊しか並ばない。
 *
 * **44px を下回らせない。** 一度 30〜46px で作ったら、細い本が 41px に
 * なって検査が「タップ領域 41x164 < 44」で弾いた。本物の本は薄いが、
 * **指は薄くならない** — 押せない本は棚に置く意味が無い。
 */
export const SPINE_MIN_WIDTH = 44;
export const SPINE_MAX_WIDTH = 60;

/**
 * 背表紙の高さ(px)。棚板の高さはこれより少しだけ大きく取る。
 *
 * **低くしすぎない。** 一度 104〜140px で作ったら、題が7文字しか入らず
 * 「TOCFL…」だけの背表紙が並んだ。背表紙の値打ちは題が読めることに
 * あるので、本物の本と同じく**縦に長く**取る(絵で見つけた)。
 */
export const SPINE_MIN_HEIGHT = 148;
export const SPINE_MAX_HEIGHT = 186;

/**
 * 題名から決まる安定した数(0以上)。
 *
 * FNV-1a。**題が同じなら必ず同じ数**になり、1文字違えば大きく変わる。
 * 乱数を使わないのは、開くたび棚の姿が変わらないようにするため。
 */
export function spineSeed(title: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < title.length; i++) {
    h ^= title.charCodeAt(i);
    // FNV の素数を掛ける。32bit に収めるため Math.imul を使う。
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** その本の色(1〜`SPINE_TONES`)。 */
export function spineTone(title: string): number {
  return (spineSeed(title) % SPINE_TONES) + 1;
}

/** 色のトークン名。素の16進を書かない。 */
export function spineToneVar(tone: number): string {
  return `var(--spine-${clampTone(tone)})`;
}

/** その色の上に載せる字の色。 */
export function spineInkVar(tone: number): string {
  return `var(--spine-${clampTone(tone)}-ink)`;
}

function clampTone(tone: number): number {
  if (!Number.isFinite(tone)) return 1;
  return Math.min(SPINE_TONES, Math.max(1, Math.round(tone)));
}

/**
 * 背表紙の高さ(px)。題名から決まる。
 *
 * **同じ高さの板を並べない。** 揃いすぎると棚ではなく色見本に見える。
 */
export function spineHeight(title: string): number {
  const span = SPINE_MAX_HEIGHT - SPINE_MIN_HEIGHT;
  // seed の別の桁を使う(色と高さが連動すると、同じ色の本が必ず同じ高さになる)。
  return SPINE_MIN_HEIGHT + (Math.floor(spineSeed(title) / SPINE_TONES) % (span + 1));
}

/**
 * 背表紙の幅(px)。**題が長い本は厚い。** 本物の本と同じ理屈で、
 * しかも長い題ほど縦に書く場所が要る。
 */
export function spineWidth(title: string): number {
  const n = title.trim().length;
  const w = SPINE_MIN_WIDTH + Math.round((n / 12) * (SPINE_MAX_WIDTH - SPINE_MIN_WIDTH));
  return Math.min(SPINE_MAX_WIDTH, Math.max(SPINE_MIN_WIDTH, w));
}

/**
 * 背表紙に書く題。**縦に書くので、入らないぶんは切る。**
 *
 * 背表紙は本物でも入りきらない題を切る(あるいは小さくする)。ここで
 * 切らずに溢れさせると、棚板を突き抜けて下の段に重なる。
 */
export function spineLabel(title: string, height = SPINE_MAX_HEIGHT): string {
  const t = (title ?? "").trim();
  // 縦書きの1文字ぶんをおよそ 13px(字 12px + 字間)と見て、
  // 天地の帯のぶんの余白を引く。
  const max = Math.max(3, Math.floor((height - 20) / CHAR_HEIGHT));
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * 縦書き1文字ぶんの高さ(px)。`text-footnote`(13px)ぶん + わずかな余白。
 *
 * 字間は**足さない** — 検査が「和文の字間が広い」で弾く。漢字かなは
 * 字間を空けると読みにくくなるので、そのほうが正しい。
 */
export const SPINE_CHAR_HEIGHT = 14;
const CHAR_HEIGHT = SPINE_CHAR_HEIGHT;

/**
 * 題を**1文字ずつ**に割る。
 *
 * ## なぜ `writing-mode` を使わないか
 * 最初は `writing-mode: vertical-rl` で組んだ。絵で見ると漢字が
 * **同じ場所に重なって**潰れていた。調べたら、載っている書体
 * (`Noto Sans TC`)に縦組みの送り幅が無く、漢字の高さが 0 で返ってくる —
 * 「旅」1文字の高さが 0px、「看板と標識」5文字で 14px。欧文だけが
 * 送られるので、漢字が全部同じ点に積まれていた。
 *
 * 書体に頼らず、**1文字ずつ自分で積む**。どの書体でも同じ絵になり、
 * 欧文も1文字ずつ立つ(日本語の背表紙で `T O C F L` と縦に並ぶのと同じ)。
 *
 * `[...s]` で割るのは、絵文字や一部の漢字が2つの符号で1文字になるため。
 * `split("")` だと真ん中で割れて豆腐になる。
 */
export function spineChars(label: string): string[] {
  return [...(label ?? "")];
}
