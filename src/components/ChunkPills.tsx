import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ChevronDown } from "lucide-react";
import { chunkStyle, chunkLegendFor } from "@/lib/pos";
import { usePrefetchSpeech, usePronounce } from "@/lib/use-pronounce";
import { normalizeTargetLanguage } from "@/lib/target-lang";
import { useUiLang } from "@/lib/i18n";
import { Term } from "@/components/Term";
import { PronounceButton } from "@/components/PronounceButton";
import type { ChunkPart } from "@/lib/extras";
import { isSwappableSlot, swappedTranslation, tidyUsageParts } from "@/lib/chunk-grammar";

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
 * **形は「語ごとの四角を＋でつなぐ」に決定**（オーナー決定 2026-09-29「チャンクは規定の
 * ものから台を取り除いて、それで決定して」）。＋は小さく詰める。学ぶ語（`fixedText`）は
 * 縁を太く・色を濃くし、入れ替えさせない。入れ替えられる所は点線の四角と ▾。
 * 途中で出した案（1本のカプセル・台・学ぶ語だけ四角・蛍光ペン・括り線）は片付けた。
 */
export function ChunkPills({
  parts,
  size = "md",
  appearance = "pill",
  lang,
  onSpeak,
  onSlot,
  openSlot = null,
  fixedText,
}: {
  parts: ChunkPart[];
  size?: "sm" | "md" | "lg";
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
  // 品詞の名前（札の title）は表示言語で（2026-10-02「英語の表示でも品詞が日本語」）。
  const reader = useUiLang();
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
  return (
    // 札の型: 既定は**語ごとの四角を＋でつなぐ**。本文の型は字だけで並べる。
    <div className={pill ? "chunk-set chunk-set--boxes" : "flex flex-wrap gap-x-1.5 gap-y-1"}>
      {parts.map((c, i) => {
        const st = chunkStyle(c.pos, reader);
        // チャンク本体は**学習言語の語**。品詞ラベル(名詞など)は解説語なので、
        // こちらだけ言語を宣言して字形を固定する。
        // **`lang="zh-Hant"` の決め打ちにしない** — 英語の型に中国語の
        // フォントが当たる(`Term` の注)。
        // 記号(S/V/O…)は**帯から外した**。語のすぐ右に同じベースラインで
        // 置いていたので「我 s」が誤字に見えた。色と凡例で足りる。
        const target = isFixed(c.text);
        // 点線は**入れ替えられる具体物**（名詞・量詞で、ほかの語が在る所）だけ
        // （R17「加熱が点線になってる。点線は…入れ替え可能な具体的なもの」）。
        const slotLike = isSwappableSlot(c, lang) && !target;
        const swappable = !!onSlot && slotLike;
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
          : slotLike
            ? `chunk-slot font-semibold ${pad} ${posClass}`
            : `chunk-bubble font-semibold ${pad} ${st.pill}${target ? " chunk-target" : ""}`;
        const style = { "--i": i } as CSSProperties;
        const joint =
          pill && i > 0 ? (
            <span aria-hidden className="chunk-plus">
              +
            </span>
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
  // 凡例の名前も表示言語で（英語の人に「名詞 / 動詞」を出さない。2026-10-02）。
  const reader = useUiLang();
  const items = chunkLegendFor(
    (parts ?? []).map((p) => p.pos),
    reader,
  );
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
  parts: rawParts,
  translation,
  lang,
  speakText,
  onSpeak,
  headword,
}: {
  parts: ChunkPart[];
  /** 学んでいる語。この語の札は入れ替えない（R14）。 */
  headword?: string;
  translation?: string | null;
  lang?: string | null;
  /** 型ぜんぶをひと息で鳴らす文。無ければボタンを出さない。 */
  speakText?: string;
  /** 札を1つずつ鳴らす。渡さなければ、その言語の声でここが鳴らす。 */
  onSpeak?: (text: string) => void;
}) {
  const pronounce = usePronounce(lang ?? undefined);
  const reader = useUiLang();
  // ネイティブが言う形に正してから描く（「滷味＋入味」→「滷味＋很＋入味」、1語は1つの四角、
  // 程度の語は入れ替えられる札 — `chunk-grammar.ts`、チャンクの表示ルール C5/C7/C8）。
  const parts = useMemo(
    () => tidyUsageParts(rawParts, lang, { headword, reader }),
    [rawParts, lang, headword, reader],
  );
  /**
   * **入れ替える所の語を選ぶ**（オーナー指示 2026-09-27「汎用部分（人・もの）は
   * タップすると、ネイティブ頻出の具体的単語が出る（跟+男朋友+吵架 → 女朋友・
   * 朋友などをスクロールで表示）。音声も全部」）。
   *
   * 札（▾ 付き）を押すと、下に**縦に回せる語の輪**が開く（R17「タップして縦に
   * スクロールすると中の具体的なものが変更できて、音声もすべて聞けるように」）。
   * 輪が止まった所の語で型の中の札が入れ替わり、**入れ替えた型ぜんぶ**が鳴る。
   * 右端のボタンも、いま入れ替えている形を読む。
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
  const choices = slot ? [{ text: slot.text, ja: slot.ja ?? "" }, ...(slot.alts ?? [])] : [];
  // 開いた列の型ぜんぶを先に作っておく（押した瞬間に鳴る）。
  // 選んだ語だけ（輪を止めた時）と、型ぜんぶ（右端）の両方。
  usePrefetchSpeech(
    open != null ? choices.flatMap((c) => [c.text, phraseWith(open, c.text)]) : [],
    {
      language: lang ?? undefined,
      enabled: open != null,
    },
  );
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
          onSlot={(i) => {
            // 点線の札を押す: 輪を開け閉めし、**いま入っている語だけ**を鳴らす（R20）。
            setOpen((o) => (o === i ? null : i));
            void pronounce(shown[i]?.text ?? "");
          }}
          openSlot={open}
          fixedText={headword}
        />
        {/* 語を入れ替えても、元の語と同じように訳を出す（入れ替えた語の意味に差し替える。R20）。 */}
        {translation ? (
          <p className="chunk-line__translation">
            {hasPick ? swappedTranslation(translation, parts, pick) : translation}
          </p>
        ) : null}
        {slot && open != null && (
          <SlotWheel
            key={open}
            label={slot.text}
            lang={lang}
            choices={choices}
            selected={(pick[open] ?? -1) + 1}
            onPick={(k) => {
              // 選んだ語**だけ**を鳴らす。型ぜんぶは右端のボタン（R20「それ単体の発音も、
              // チャンクの右端の全体の発音も聞けるように」）。
              setPick((p) => ({ ...p, [open]: k - 1 }));
              void pronounce(choices[k].text);
            }}
            onClose={() => setOpen(null)}
          />
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
          sticky
          className="chunk-line__speak"
        />
      ) : null}
    </div>
  );
}

/** 輪の1行の高さ（px）。指の大きさ（44）。 */
const WHEEL_ROW = 44;

/**
 * **入れ替える語を縦に回して選ぶ輪**（iOS のピッカーと同じ形。R17）。
 *
 * 真ん中の帯に止まった語が選ばれ、止まるたびに型ぜんぶが鳴る。語を押すと
 * その語が帯まで回ってくる（止まった所で鳴る）。帯に居る語を押したら、その場で鳴らす。
 */
function SlotWheel({
  label,
  lang,
  choices,
  selected,
  onPick,
  onClose,
}: {
  label: string;
  lang?: string | null;
  choices: Array<{ text: string; ja: string }>;
  selected: number;
  onPick: (k: number) => void;
  /** 語を押した時に輪を閉じる。 */
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const at = useRef(selected);
  const timer = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = selected * WHEEL_ROW;
    // 開いた時の位置だけを合わせる（回している最中に引き戻さない）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const settle = () => {
    const el = ref.current;
    if (!el) return;
    const k = Math.max(0, Math.min(choices.length - 1, Math.round(el.scrollTop / WHEEL_ROW)));
    if (k !== at.current) {
      at.current = k;
      onPick(k);
    }
  };
  return (
    <div className="chunk-wheel" onClick={(e) => e.stopPropagation()}>
      <span aria-hidden className="chunk-wheel__band" />
      <div
        ref={ref}
        className="chunk-wheel__list"
        role="listbox"
        aria-label={label}
        onScroll={() => {
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(settle, 120);
        }}
      >
        {choices.map((c, k) => (
          <button
            key={`${c.text}-${k}`}
            type="button"
            role="option"
            aria-selected={k === at.current}
            className="chunk-wheel__item"
            onClick={() => {
              // 押した語をその場で選び、輪を閉じる（R20「スクロールしてあるものをタップしたら、
              // スクロールのほかの選択肢は閉じて」）。回して止めた時は開いたまま。
              window.clearTimeout(timer.current);
              at.current = k;
              onPick(k);
              onClose();
            }}
          >
            <Term lang={lang} className="chunk-wheel__word">
              {c.text}
            </Term>
            {c.ja ? <span className="chunk-wheel__ja">{c.ja}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
