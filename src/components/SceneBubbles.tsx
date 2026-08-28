import { useT } from "@/lib/i18n";
import { useMemo } from "react";
import { floatStyle } from "@/lib/bubble-float";
import { sceneGroups, type BubbleKind, type SceneAxis, type SceneGroup } from "@/lib/scene-bubbles";
import type { WordExtrasDTO } from "@/lib/extras";

/**
 * 「この語にどこで・いつ出会うか」を、**整列した札**で出す。
 *
 * ## オーナー指示 2026-08-28 ①②
 * > 「カテゴリーがランダムに並んでいるから修正して。私が浮遊感と言ったのは、
 * >  影や奥行きタップした時のバウンス感など物理法則によってそのカテゴリーが
 * >  浮遊してるようにふわふわしてるいう意味です。カテゴリーはちゃんと
 * >  整列させて。」
 * > 「それぞれのカテゴライズを同じように表示すると混乱するから、学習者が
 * >  混乱しないようにカテゴリーの表示を工夫して。」
 *
 * ## 前は位置そのものを飛ばしていた
 * 物理の輪で札を面の中に泳がせていたので、開くたびに並びが変わり、
 * 読む順が無かった。求められていたのは「浮いて**見える**」ことだった。
 *
 * いまは:
 *   ・位置は**行に整列**（軸ごとに束ね、束の中は左から順）
 *   ・浮遊感は**影・わずかな高さの差・ゆっくりした上下・押した時の沈み**
 *
 * ## 散らばらせない
 * 軸（限定／どこで／いつ／どんな場面で／どんな物か／どんな気持ちで）ごとに
 * 見出しを付けて束ねる。どれがどの話なのかが、札を読む前に分かる。
 * 束の作り方は `lib/scene-bubbles.ts`（試験付き）。
 *
 * ## 動きを止めたい人には止めて出す
 * `prefers-reduced-motion` のときは上下の揺れを止める（CSS 側で止める）。
 * 札は全部そこに在るので、読める物は1つも減らない。
 */

/** 種類ごとの地の色。**限定だけ別格** — その語を持っていること自体が珍しい。 */
const SKIN: Record<BubbleKind, string> = {
  limited: "bg-warn text-warn-foreground ring-warn/40",
  place: "scene-chip-place text-primary-ink ring-primary/25",
  media: "bg-secondary text-foreground ring-border",
  situation: "bg-secondary text-foreground ring-border",
  emotion: "scene-chip-emotion text-warn-ink ring-warn/25",
  time: "bg-secondary text-foreground ring-border",
  season: "scene-chip-season text-ok-ink ring-ok/25",
  trait: "scene-chip-trait text-ok-ink ring-ok/25",
};

/** 軸の見出しの鍵。 */
const AXIS_KEY: Record<SceneAxis, string> = {
  limited: "card.axis.limited",
  where: "card.axis.where",
  when: "card.axis.when",
  scene: "card.axis.scene",
  trait: "card.axis.trait",
  feeling: "card.axis.feeling",
};

export function SceneBubbles({
  extras,
}: {
  // 画面側の `word.extras ?? {}` は `Partial`。厳しく受けると呼ぶ側に
  // キャストを書かせることになる(`scene-bubbles.ts` の注)。
  extras: Partial<WordExtrasDTO> | null | undefined;
}) {
  const t = useT();
  const groups = useMemo<SceneGroup[]>(
    () =>
      sceneGroups({
        extras,
        limitedTo: (place) => t("card.limitedTo", { place }),
        seasonName: (key) => t(`card.season.${key}`),
      }),
    [extras, t],
  );

  if (groups.length === 0) return null;

  return (
    <div>
      <p className="mb-1.5 text-caption text-muted-foreground">{t("card.encounterLabels")}</p>
      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.axis}>
            {/* 束の見出し。**札と同じ形にしない** — 見出しまで札にすると、
                どれが中身なのか分からなくなる。素の小さな字で置く。

                **薄めを掛けない。** 一度 `/80` を足したら、11px の字で
                コントラストが 4.50 → 3.74 に落ちて絵の検査が7件で落ちた。
                この見出しは「何の一覧か」を言う唯一の言葉なので、
                いちばん読めなくてはいけない所だった。 */}
            <p className="mb-1 text-caption font-medium text-muted-foreground">
              {t(AXIS_KEY[g.axis])}
            </p>
            <ul className="flex flex-wrap items-center gap-1.5">
              {g.items.map((b, i) => {
                const f = floatStyle(b.id, i);
                return (
                  <li key={b.id}>
                    <span
                      className={`scene-chip scene-depth-${f.depth} inline-flex select-none items-center whitespace-nowrap rounded-full px-3 py-1.5 text-caption font-semibold ring-1 ${SKIN[b.kind] ?? SKIN.place}`}
                      style={
                        {
                          "--float-delay": `${f.delayMs}ms`,
                          "--float-duration": `${f.durationMs}ms`,
                          "--float-lift": `${f.liftPx}px`,
                        } as React.CSSProperties
                      }
                    >
                      {b.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
