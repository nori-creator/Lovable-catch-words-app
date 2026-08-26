import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  LEVEL_BANDS,
  LEVEL_OUT,
  TOCFL_SCALE,
  bandLabelKey,
  bandOf,
  examLabels,
  parseLevelStep,
  stepColorVar,
  stepHeight,
  stepLabel,
  stepWidth,
  stepsInBand,
  type LevelIndex,
  type LevelScale,
  type LevelStep,
} from "@/lib/level-scale";

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
  scale = TOCFL_SCALE,
  className = "",
}: {
  /** `"TOCFL-2"` `"B1"` `"3"` など。`null` なら何も描かない。 */
  level: string | number | null | undefined;
  /**
   * どの体系の目盛りか(2026-08-24 の二言語化)。
   *
   * **絵は変えない。** TOCFL も CEFR も「6段 + 3帯」で形が同じなので、
   * 変わるのは段に書く名前(`1`〜`6` か `A1`〜`C2`)と、左の見出しだけ。
   * 既定は TOCFL なので、渡さない呼び出しは今までと1ドットも変わらない。
   */
  scale?: LevelScale;
  className?: string;
}) {
  const t = useT();
  /**
   * **既定は畳んでおく。**
   *
   * オーナー指摘 2026-08-25:
   * > 「TOCFL、TOEFL、IELTS のバーが大きすぎる。**レベルとバンドだけ表示**して、
   * >  タップでバーを出して。」
   *
   * 段々は「6段のどこか」を一目で伝える良い絵だが、**毎回見たい物ではない**。
   * 撮った直後の面では画面の1/4を占めていた。ふだんは「A2（Band A）」の
   * 1行だけ出して、知りたい人がタップしたときに開く。
   */
  const [open, setOpen] = useState(false);
  const step = parseLevelStep(level);
  // 段の幅は**名前の長さから決める**。16px に決め打ちすると CEFR の
  // `A1 A2` がくっついて読めない(絵で見つけた)。TOCFL は1文字なので
  // これまでと同じ 16px。
  const width = stepWidth(scale);
  // **分からないときは描かない。** 全部灰色の段を出しても、
  // 「級が無い語」なのか「まだ調べていない」のか読めない。
  if (step == null) return null;

  // **級外と級を型で分ける。** `as number` で押し通すと、級外(`"out"`)を
  // `bandOf` に渡せてしまい、帯の判定が静かに壊れる。
  const lv: LevelIndex | null = step === LEVEL_OUT ? null : (step as LevelIndex);
  const isOut = lv == null;
  const exams = lv == null ? null : examLabels(scale, lv);
  const label = isOut
    ? t(scale.outKey)
    : t(scale.levelInBandKey, { n: stepLabel(scale, lv), band: t(bandLabelKey(bandOf(lv))) });

  // 畳んでいるとき。**級と帯だけ**を1行で。
  if (!open) {
    return (
      <div className={`inline-flex ${className}`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-label={`${scale.id} ${label} — ${t("tocfl.showLadder")}`}
          /**
           * **品詞の札と同じ寸法にする**(オーナー報告 2026-08-26、3度目
           * 「単語の欄の CEFR の欄が大きくて、品詞のカテゴリーとのバランスが
           * 悪いから、大きさを揃えて、横に並べて」)。
           *
           * ここは `min-h-11 px-3 py-1` で、見た目そのものが 44px あった。
           * 隣に並ぶ品詞の札は `px-2 py-0.5`(≒22px)なので、同じ行に置くと
           * **倍の高さの札が2つ並ぶ**。だから今までは行を分けていて、
           * 級だけが1行を丸ごと使っていた。
           *
           * 寸法は品詞と揃え、**指の当たり判定は `::before` で 44px** に
           * 広げる(このアプリの §11 の型。カードの発音ボタンや図鑑の札と
           * 同じ書き方)。触るのは1つの札なので、見えない枠でも指は届く。
           *
           * **`-inset-y-3`(12px)まで広げる。** 検査は直径 44px の円で
           * 撃つので、札の 21px に 10px ずつ足した 41px では**上下の点が
           * 円からはみ出して落ちる**(実際に落ちた)。12px なら 45px。
           *
           * TOEFL / IELTS は**開いたときだけ**出す。畳んだ札に足すと
           * 横幅が品詞の3倍になり、揃えた意味が無くなる
           * (オーナーの前の指示「レベルとバンドだけ表示して、タップで
           * バーを出して」とも、こちらのほうが合う)。
           */
          className="press-in relative inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-caption font-medium text-foreground ring-1 ring-border before:absolute before:-inset-x-1 before:-inset-y-3 before:content-['']"
        >
          <span className="font-semibold label-caps text-muted-foreground">{scale.id}</span>
          <span className="font-bold">{label}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className={`inline-flex flex-col gap-1 ${className}`}>
      <div className="flex items-end gap-2" role="img" aria-label={`${scale.id} ${label}`}>
        {/* 何の目盛りかを図の左に置く。数字だけだと読めない。 */}
        <span className="pb-3.5 text-caption font-semibold label-caps text-muted-foreground">
          {scale.id}
        </span>
        {LEVEL_BANDS.map((band) => (
          <span key={band} className="flex flex-col items-center gap-0.5">
            {/* 段の間は 4px。選ばれた段は 2px の枠が 1px 外側に出るので、
                2px だと**枠が隣の段に食い込む**(絵で見つけた)。 */}
            <span className="flex items-end gap-1">
              {stepsInBand(band).map((l) => (
                <Step
                  key={l}
                  step={l}
                  active={step === l}
                  height={stepHeight(l)}
                  label={stepLabel(scale, l)}
                  width={width}
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
          <Step
            step={LEVEL_OUT}
            active={isOut}
            height={0.4}
            label={t("tocfl.outShort")}
            width={width}
          />
          <span className="text-caption leading-none text-transparent">–</span>
        </span>
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-expanded
        className="press-in inline-flex min-h-11 items-center gap-1 self-start text-caption text-muted-foreground"
      >
        <span>{label}</span>
        <ChevronUp className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">{t("tocfl.hideLadder")}</span>
      </button>
      {/* TOEFL / IELTS は**この段に添える派生の目盛り**(オーナー承認済み
          「CEFR 換算でいい」)。TOCFL のときは何も返らないので出ない。
          **幅で出す** — 換算は1点に決まる物ではないので、1つの数字にすると
          「その点を取れば B2」と読まれてしまう。 */}
      {exams && (exams.toefl || exams.ielts) && (
        <p className="text-caption text-muted-foreground">
          {[
            exams.toefl ? `TOEFL ${exams.toefl}` : null,
            exams.ielts ? `IELTS ${exams.ielts}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

function Step({
  step,
  active,
  height,
  label,
  width,
}: {
  step: LevelStep;
  active: boolean;
  height: number;
  label: string;
  /** 段の横幅(px)。体系の名前の長さから決まる。 */
  width: number;
}) {
  return (
    // 段と名前の間も 4px。2px だと選ばれた段の枠が名前の上に乗る
    // (「外」で特にはっきり出ていた)。**選ばれていない段も同じだけ空ける** —
    // 選ばれたときだけ空けると、名前が上下に飛ぶ。
    <span className="flex flex-col items-center gap-1" style={{ width: `${width}px` }}>
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
