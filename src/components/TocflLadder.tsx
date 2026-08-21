import { useT } from "@/lib/i18n";
import {
  TOCFL_BANDS,
  TOCFL_OUT,
  bandOf,
  bandLabelKey,
  levelsInBand,
  parseTocflStep,
  stepHeight,
  stepColorVar,
  type TocflLevel,
  type TocflStep,
} from "@/lib/tocfl";

/**
 * TOCFL の級を、**段々の形**で見せる。
 *
 * オーナー指摘 2026-08-20: 「積み木のように TOCFL のレベル別に段々になって
 * いて、色分けさせていて、この単語がどのレベルか視覚的に分かるように。」
 *
 * オーナー指摘 2026-08-21:
 * > 「TOCFL の段階レベルの表示が大きすぎる。収まりが悪い。また下の
 * >  1.2.3.4.5.6.だけだとこれが TOCFL のレベルだと分かりづらい。
 * >  また Band A,B,C にも視覚的に分けて」
 *
 * ## 3つ直した
 * 1. **小さくした。** 段は最大 48px あって、カードの見出しの中で
 *    写真の次に高い塊になっていた。28px までに収める。
 * 2. **級だと分かるようにした。** 数字の列の左に `TOCFL` を置き、
 *    いま何級かを言葉でも書く。数字だけだと何の目盛りか読めない。
 * 3. **帯(Band)で区切った。** TOCFL は6級を2つずつ3つの帯にまとめる。
 *    帯の切れ目を空けて、下に A/B/C を書く。「6段のうちの3段目」ではなく
 *    「Bの下のほう」と読めるようにする。
 *
 * ## 数字は段の中に入れない
 * 段は色が濃く、その上に 10px の数字を置くと 4.5:1 を割る。数字は**下**の
 * 地の上に置いて、段は形と色だけを持つ。
 */
export function TocflLadder({
  level,
  className = "",
}: {
  /** `"TOCFL-2"` `"3"` など。`null` なら何も描かない。 */
  level: string | number | null | undefined;
  className?: string;
}) {
  const t = useT();
  const step = parseTocflStep(level);
  // **分からないときは描かない。** 全部灰色の段を出しても、
  // 「級が無い語」なのか「まだ調べていない」のか読めない。
  if (step == null) return null;

  // **級外と級を型で分ける。** `as number` で押し通すと、級外(`"out"`)を
  // `bandOf` に渡せてしまい、帯の判定が静かに壊れる。
  const lv: TocflLevel | null = step === TOCFL_OUT ? null : step;
  const isOut = lv == null;
  const label = isOut
    ? t("tocfl.out")
    : t("tocfl.levelInBand", { n: String(lv), band: t(bandLabelKey(bandOf(lv))) });

  return (
    <div className={`inline-flex flex-col gap-1 ${className}`}>
      <div className="flex items-end gap-2" role="img" aria-label={`TOCFL ${label}`}>
        {/* 何の目盛りかを図の左に置く。数字だけだと読めない。 */}
        <span className="pb-3.5 text-caption font-semibold label-caps text-muted-foreground">
          TOCFL
        </span>
        {TOCFL_BANDS.map((band) => (
          <span key={band} className="flex flex-col items-center gap-0.5">
            <span className="flex items-end gap-0.5">
              {levelsInBand(band).map((l) => (
                <Step
                  key={l}
                  step={l}
                  active={step === l}
                  height={stepHeight(l)}
                  label={String(l)}
                />
              ))}
            </span>
            {/* 帯の名前。段の下、数字のさらに下に置いて、まとまりを示す。 */}
            <span
              className={`w-full rounded-b-sm text-center text-caption leading-none ${
                lv != null && bandOf(lv) === band
                  ? "font-bold text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {band}
            </span>
          </span>
        ))}
        {/* 級外は3つの帯の**外側**に置く。難しさの順番の上に乗せられない語。 */}
        <span aria-hidden className="mx-0.5 mb-5 h-5 w-px bg-border" />
        <span className="flex flex-col items-center gap-0.5">
          <Step step={TOCFL_OUT} active={isOut} height={0.4} label={t("tocfl.outShort")} />
          <span className="text-caption leading-none text-transparent">–</span>
        </span>
      </div>
      <p className="text-caption text-muted-foreground">{label}</p>
    </div>
  );
}

function Step({
  step,
  active,
  height,
  label,
}: {
  step: TocflStep;
  active: boolean;
  height: number;
  label: string;
}) {
  return (
    <span className="flex w-4 flex-col items-center gap-0.5">
      {/* 足場は **Tailwind の任意値ではなくインラインの `style`** で書く —
          検査の足場は `@source` の外なので、クラス名で高さを作ると素の div が
          並ぶだけの絵になる。 */}
      <span
        className={`w-full transition-opacity ${active ? "" : "opacity-25"}`}
        style={{
          // 10px から 28px。前は 24〜48px で、カードの見出しの中で
          // 写真の次に高い塊になっていた(オーナー指摘「大きすぎる」)。
          height: `${Math.round(10 + height * 18)}px`,
          borderRadius: "2px 2px 0 0",
          background: stepColorVar(step),
          outline: active ? "2px solid var(--foreground)" : undefined,
          outlineOffset: active ? "1px" : undefined,
        }}
      />
      <span
        className={`text-caption leading-none ${active ? "font-bold text-foreground" : "text-muted-foreground"}`}
      >
        {label}
      </span>
    </span>
  );
}
