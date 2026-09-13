import { useT } from "@/lib/i18n";
import { useMemo } from "react";
import { sceneGroups, type BubbleKind, type SceneGroup } from "@/lib/scene-bubbles";
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
 * いまは位置を**行に整列**し、奥行きは影と押した時の沈みで伝える。
 * 読んでいる間ずっと動かすと視線が散るため、常時の上下動は使わない。
 *
 * ## 散らばらせない
 * 軸（限定／どこで／いつ／どんな場面で／どんな物か／どんな気持ちで）ごとに
 * 見出しを付けて束ねる。どれがどの話なのかが、札を読む前に分かる。
 * 束の作り方は `lib/scene-bubbles.ts`（試験付き）。
 *
 * `prefers-reduced-motion` のときは押下の変形も止める。札はすべて残る。
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

  // この欄は「場面を素早く拾う」ための要約。軸ごとの全候補を並べると
  // スマホで何段にも膨らむため、異なる軸から重複を除いた先頭4件に絞る。
  const items = groups
    .flatMap((group) => group.items)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.label === item.label) === index)
    .slice(0, 4);

  return (
    <div className="usage-scenes">
      <p className="usage-scenes__title">{t("card.encounterLabels")}</p>
      <ul className="usage-scenes__items" aria-label={t("card.encounterLabels")}>
        {items.map((item, index) => (
          <li key={item.id}>
            <span
              title={item.label}
              className={`scene-chip scene-depth-${(index % 3) as 0 | 1 | 2} inline-flex select-none items-center justify-center rounded-lg px-2 py-2 text-caption font-semibold ring-1 ${SKIN[item.kind] ?? SKIN.place}`}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
