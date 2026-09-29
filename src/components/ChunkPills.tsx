import { Fragment, useMemo, useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { chunkStyle, chunkLegendFor } from "@/lib/pos";
import { usePrefetchSpeech, usePronounce } from "@/lib/use-pronounce";
import { normalizeTargetLanguage } from "@/lib/target-lang";
import { Term } from "@/components/Term";
import { PronounceButton } from "@/components/PronounceButton";
import type { ChunkPart } from "@/lib/extras";

/**
 * 文のパーツ(チャンク)を品詞色分けの札で並べる共通コンポーネント。
 * 復習の添削(型)と単語詳細(例文・使い方チャンク)で同じ見た目にして、
 * 「スピーキングの時にこの塊のまま口から出す」感覚を育てる。
 *
 * 札は**浮いている(NORI指定)** — 薄い地・同色の縁・下に落ちる影。
 * 押すと沈んで跳ね返る(`.chunk-pill`)。触れる物だと分かる手応えを返す。
 *
 * **形は公式（オーナー決定 2026-09-27「F にして」）。** 入れ替えて使う所（`slot`）
 * にも「人」ではなく、ネイティブがいちばんよく入れる具体語が入る（同日の指示）。
 *
 * **1本のカプセルに語を継ぐ**（オーナー指示 2026-09-28「チャンクの単語と単語の
 * 一体感がなく、それぞれの単語が独立してるように見える」）。原因は、語ごとに
 * 縁と影を持つ丸を、隙間と「＋」で離して並べていたこと — 人の目は**隙間
 * （近接）と囲い（共通領域）**で「どれが1つか」を決めるので、丸が5つ＝物が5つに
 * 見えていた。いまは外枠と影を**型に1つだけ**持たせ、語は中で品詞の色に塗り分け、
 * 継ぎ目は細い線（`.chunk-joint`）。入れ替える所は点線の下線と ▾ で分かる。
 */
export type ChunkLook = "boxes" | "focus" | "marker" | "bracket" | "capsule";

export function ChunkPills({
  parts,
  size = "md",
  appearance = "pill",
  lang,
  onSpeak,
  onSlot,
  openSlot = null,
  look = "boxes",
  fixedText,
}: {
  parts: ChunkPart[];
  size?: "sm" | "md" | "lg";
  /**
   * **型の見せ方**（オーナー指示 2026-09-28〜29 R14）。既定は四角。
   * 「四角以外にチャンクとしての一体感が欲しい」「覚えたい単語が目立たない。該当の単語
   * 以外はボックスではなく文字だけのデザイン案を」を受けた案:
   *  ・`boxes`   … 語ごとの四角を狭い「＋」でつなぎ、**薄い台（トレー）に全部を載せる**（既定）
   *  ・`focus`   … **学ぶ語だけ四角**、ほかは文字だけ。全体を薄い台に載せる
   *  ・`marker`  … 学ぶ語だけ蛍光ペンで塗る、ほかは文字だけ。全体を1本の帯で包む
   *  ・`bracket` … 学ぶ語だけ四角、ほかは文字だけ。下に1本の括り線（⎣ ⎦）で「ひとかたまり」
   *  ・`capsule` … 前の形（1本のカプセルに継ぐ）
   */
  look?: ChunkLook;
  /**
   * **学んでいる語は入れ替えさせない**（R14「決して該当の単語はスクロールできるように
   * はしないで。なぜならこの単語を学習したいから」）。この字を含む札は、AI が入れ替え
   * 候補を付けていても固定の札として描き、学ぶ語として少し強く見せる。
   */
  fixedText?: string;
  /** 単語詳細では札を外し、品詞色を文字そのものに使う。 */
  appearance?: "pill" | "text";
  /** その型の学習言語。**渡さないと台湾華語として組む**(既定)。 */
  lang?: string | null;
  /**
   * 札そのものを押したときに鳴らす(オーナー指示 2026-08-27 ⑧
   * 「それぞれのバブルをタップしたら独立して発音されるようにする」)。
   *
   * 渡さなければ**押せない札のまま**。復習の添削のように、押しても
   * 意味の無い場所で押せる見た目にしない。
   */
  onSpeak?: (text: string) => void;
  /**
   * 入れ替える所（`slot`）で、ほかの具体語（`alts`）が在る札を押したとき。
   * 渡すと、その札は「鳴らす」ではなく「ほかの語を並べる」札になる（▾ 付き）。
   */
  onSlot?: (index: number) => void;
  /** いま並べている札（▾ を上向きに）。 */
  openSlot?: number | null;
}) {
  if (!parts.length) return null;
  // lg: 復習のヒント用。中国語そのものを一番大きく見せる(周りの説明文より上)。
  const pad =
    appearance === "text"
      ? "px-0.5 py-0 text-body"
      : size === "sm"
        ? "px-2 py-1 text-footnote"
        : size === "lg"
          ? "px-3 py-2 text-headline leading-snug tracking-wide"
          : "px-2.5 py-1.5 text-body";
  const pill = appearance === "pill";
  const isFixed = (t: string) => !!fixedText && !!t && t.includes(fixedText.trim());
  // 学ぶ語以外を文字だけにする案。
  const lite = look === "focus" || look === "marker" || look === "bracket";
  const setClass =
    look === "capsule"
      ? "chunk-set chunk-set--formula"
      : lite
        ? `chunk-set chunk-set--lite chunk-set--${look}`
        : "chunk-set chunk-set--boxes";
  return (
    // 札の型: 既定は**語ごとの四角を＋でつなぐ**。本文の型は字だけで並べる。
    <div className={pill ? setClass : "flex flex-wrap gap-x-1.5 gap-y-1"}>
      {parts.map((c, i) => {
        const st = chunkStyle(c.pos);
        // チャンク本体は**学習言語の語**。品詞ラベル(名詞など)は解説語なので、
        // こちらだけ言語を宣言して字形を固定する。
        // **`lang="zh-Hant"` の決め打ちにしない** — 英語の型に中国語の
        // フォントが当たる(`Term` の注)。
        // 記号(S/V/O…)は**帯から外した**。語のすぐ右に同じベースラインで
        // 置いていたので「我 s」が誤字に見えた。色と凡例で足りる。
        const target = isFixed(c.text);
        const swappable = !!onSlot && !!c.slot && !target && (c.alts?.length ?? 0) > 0;
        const body = swappable ? (
          <>
            <Term lang={lang}>{c.text}</Term>
            <ChevronDown
              aria-hidden
              className={`chunk-slot__chev h-3.5 w-3.5 ${openSlot === i ? "rotate-180" : ""}`}
            />
          </>
        ) : (
          <Term lang={lang}>{c.text}</Term>
        );
        const posClass = st.dot.replace("pos-dot ", "");
        const skin = !pill
          ? `chunk-word font-semibold ${pad} ${posClass}`
          : c.slot && !target
            ? `chunk-slot font-semibold ${pad} ${posClass}`
            : lite && !target
              ? `chunk-plain font-semibold ${pad} ${posClass}`
              : `chunk-bubble font-semibold ${pad} ${st.pill}${target ? " chunk-target" : ""}`;
        const style = { "--i": i } as CSSProperties;
        const joint =
          pill && i > 0 ? (
            look === "capsule" ? (
              <span aria-hidden className="chunk-joint" />
            ) : (
              <span aria-hidden className="chunk-plus">
                +
              </span>
            )
          ) : null;

        if (!onSpeak) {
          return (
            <Fragment key={i}>
              {joint}
              <span className={skin} title={st.label} style={style}>
                {body}
              </span>
            </Fragment>
          );
        }
        return (
          <Fragment key={i}>
            {joint}
            <button
              type="button"
              onClick={(e) => {
                // 札は押せる物の中に入っていることがある(図鑑の一覧)。
                // ここで止めないと、鳴らすつもりが画面ごと切り替わる。
                e.stopPropagation();
                if (swappable) onSlot!(i);
                else onSpeak(c.text);
              }}
              aria-expanded={swappable ? openSlot === i : undefined}
              /**
               * **押せる札は指の大きさにする**(44px)。
               *
               * 見えない枠(`::before`)で広げる手もあるが、札は隣り合うので、
               * 左右に広げると**隣の枠と重なる**。重なった所は後から描いた札が
               * 取るので、左の札は自分の右端を押しても反応しない。
               * **押せない札(`onSpeak` なし)は小さいまま**。
               */
              className={`${pill ? "chunk-pill" : "chunk-word-button"} press-in inline-flex min-h-11 items-center justify-center ${skin}`}
              title={st.label}
              style={style}
            >
              {body}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * 凡例。**その文に出てきた品詞だけ**を、詞類表の並びで出す。
 *
 * `parts` を渡さない呼び出しは何も描かない。以前は固定の2項目
 * (動詞・目的語)を無条件に並べていたので、その2つが1つも出てこない文の
 * 下にも凡例だけが残っていた。
 */
export function ChunkLegend({ parts }: { parts?: ChunkPart[] }) {
  const items = chunkLegendFor((parts ?? []).map((p) => p.pos));
  if (!items.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted-foreground">
      {items.map(({ key, style }) => (
        <span key={key} className="inline-flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-full ${style.dot}`} />
          {style.label}
        </span>
      ))}
    </div>
  );
}

/**
 * **チャンクの1行**（単語の詳細と復習の解説で同じ部品 — オーナー指示
 * 2026-09-24「単語の詳細のチャンクと復習の解説の欄のチャンクは同じデザインに
 * 統一して」）。
 *
 * 札（品詞ごとの丸）、その**下に訳を小さく薄く**、**右端に型ぜんぶを鳴らす
 * ボタン**。札を1つ押すとその語だけが鳴る（オーナー指示 2026-09-25「チャンクの
 * それぞれの単語を押すと、それぞれの単語の発音が聞けて、チャンクの右端に
 * ある発音ボタンを押すと、チャンクの全ての音声が聞けるように」）。
 */
export function ChunkLine({
  parts,
  translation,
  lang,
  speakText,
  onSpeak,
  headword,
  look,
}: {
  parts: ChunkPart[];
  /** 学んでいる語。この語の札は入れ替えない（R14）。 */
  headword?: string;
  look?: ChunkLook;
  translation?: string | null;
  lang?: string | null;
  /** 型ぜんぶをひと息で鳴らす文。無ければボタンを出さない。 */
  speakText?: string;
  /** 札を1つずつ鳴らす。渡さなければ、その言語の声でここが鳴らす。 */
  onSpeak?: (text: string) => void;
}) {
  const pronounce = usePronounce(lang ?? undefined);
  /**
   * **入れ替える所の語を選ぶ**（オーナー指示 2026-09-27「汎用部分（人・もの）は
   * タップすると、ネイティブ頻出の具体的単語が出る（跟+男朋友+吵架 → 女朋友・
   * 朋友などをスクロールで表示）。音声も全部」）。
   *
   * 札（▾ 付き）を押すと、下に**横に送れる語の列**が開く。語を押すと型の中の
   * その札が入れ替わり、**入れ替えた型ぜんぶ**が鳴る。右端のボタンも、いま
   * 入れ替えている形を読む。
   */
  const [open, setOpen] = useState<number | null>(null);
  const [pick, setPick] = useState<Record<number, number>>({});
  const sep = normalizeTargetLanguage(lang) === "en" ? " " : "";
  const shown = useMemo(
    () =>
      parts.map((p, i) => {
        const k = pick[i];
        const alt = k != null && k >= 0 ? p.alts?.[k] : undefined;
        return alt ? { ...p, text: alt.text } : p;
      }),
    [parts, pick],
  );
  const phraseWith = (i: number, text: string) =>
    shown
      .map((p, j) => (j === i ? text : p.text).trim())
      .filter(Boolean)
      .join(sep);
  const slot = open != null ? parts[open] : null;
  const choices = slot ? [{ text: slot.text, ja: "" }, ...(slot.alts ?? [])] : [];
  // 開いた列の型ぜんぶを先に作っておく（押した瞬間に鳴る）。
  usePrefetchSpeech(open != null ? choices.map((c) => phraseWith(open, c.text)) : [], {
    language: lang ?? undefined,
    enabled: open != null,
  });
  const hasPick = Object.keys(pick).length > 0;
  if (!parts.length) return null;
  return (
    <div className="chunk-line">
      <div className="chunk-line__body">
        <ChunkPills
          parts={shown}
          size="md"
          lang={lang}
          onSpeak={onSpeak ?? ((text) => void pronounce(text))}
          onSlot={(i) => setOpen((o) => (o === i ? null : i))}
          openSlot={open}
          fixedText={headword}
          look={look}
        />
        {translation && !hasPick ? <p className="chunk-line__translation">{translation}</p> : null}
        {slot && open != null && (
          <div className="chunk-alts" role="listbox" aria-label={slot.text}>
            {choices.map((c, k) => {
              const on = (pick[open] ?? -1) === k - 1;
              return (
                <button
                  key={`${c.text}-${k}`}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPick((p) => ({ ...p, [open]: k - 1 }));
                    void pronounce(phraseWith(open, c.text));
                  }}
                  className="chunk-alts__item press-in"
                >
                  <Term lang={lang} className="chunk-alts__word">
                    {c.text}
                  </Term>
                  {c.ja ? <span className="chunk-alts__ja">{c.ja}</span> : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {speakText ? (
        <PronounceButton
          text={
            hasPick
              ? shown
                  .map((p) => p.text.trim())
                  .filter(Boolean)
                  .join(sep)
              : speakText
          }
          language={lang ?? undefined}
          size="sm"
          tone="quiet"
          stopPropagation
          className="chunk-line__speak"
        />
      ) : null}
    </div>
  );
}
