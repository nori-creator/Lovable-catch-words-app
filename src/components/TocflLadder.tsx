import { useT } from "@/lib/i18n";
import {
  TOCFL_LEVELS,
  TOCFL_OUT,
  parseTocflStep,
  stepHeight,
  stepColorVar,
  type TocflStep,
} from "@/lib/tocfl";

/**
 * TOCFL の級を、**段々の形**で見せる。
 *
 * オーナー: 「積み木のイメージではなく、かたちとして積み木のように
 * TOCFL のレベル別に段々になっていて、色分けさせていて、この単語が
 * どのレベルか視覚的に分かるようにして。」
 *
 * 前は `TOCFL-2` という文字の札が1つあるだけで、**2が6段のうちのどこか**が
 * 分からなかった。ここでは6段を全部描き、その語の段だけを立たせる。
 * 高さと色の両方で伝えるのは、色だけだと色が見えにくい人に何も届かないから。
 *
 * ## 数字は段の中に入れない
 * 段は色が濃く、その上に 10px の数字を置くと 4.5:1 を割る。数字は**下**の
 * 地の上に置いて、段は形と色だけを持つ(検査が文字の対比を測る所を、
 * 色の濃い図形の上に作らない)。
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

  const label =
    step === TOCFL_OUT ? t("tocfl.out") : t("tocfl.level", { n: String(step as number) });

  return (
    <div className={`inline-flex flex-col gap-1 ${className}`}>
      <p className="text-caption font-semibold text-muted-foreground">
        {t("tocfl.title")} <span className="text-foreground">{label}</span>
      </p>
      <div className="flex items-end gap-1" role="img" aria-label={`${t("tocfl.title")} ${label}`}>
        {TOCFL_LEVELS.map((l) => (
          <Step key={l} step={l} active={step === l} height={stepHeight(l)} label={String(l)} />
        ))}
        {/* 級外は6段の**外側**に置く。難しさの順番の上に乗せられない語なので、
            間を空けて、段の列とは別の物として並べる。 */}
        <span className="mx-0.5 h-6 w-px self-center bg-border" aria-hidden />
        <Step
          step={TOCFL_OUT}
          active={step === TOCFL_OUT}
          height={0.5}
          label={t("tocfl.outShort")}
        />
      </div>
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
    <span className="flex w-6 flex-col items-center gap-0.5">
      {/* 足場は **Tailwind の任意値ではなくインラインの `style`**
          で書く — 検査の足場は `@source` の外なので、クラス名で高さを
          作ると素の div が並ぶだけの絵になる。 */}
      <span
        className={`w-full transition-opacity ${active ? "" : "opacity-25"}`}
        style={{
          // 24px から 48px まで。**差を小さくすると段々に見えない** —
          // 最初は 15〜28px で描いて、絵にすると6段がほぼ同じ高さだった。
          height: `${Math.round(12 + height * 36)}px`,
          // 角丸も `style` で持つ。クラスで `rounded-t-sm` と書いたら、
          // 幅24pxの札が丸屋根になって「積み木」ではなく墓石に見えた。
          borderRadius: "3px 3px 0 0",
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
