import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import {
  bubbleSize,
  layoutBubbles,
  stepBubbles,
  type Bubble,
  type World,
} from "@/lib/bubble-physics";
import { sceneBubbles, type BubbleKind, type SceneBubble } from "@/lib/scene-bubbles";
import type { WordExtrasDTO } from "@/lib/extras";

/**
 * 「この語にどこで出会うか」を、**浮いて跳ねる札**で出す。
 *
 * オーナー指示 2026-08-27 ⑤:
 * > 「カテゴリーを囲って色分けしてバブル（物理法則を適用した浮遊感のある
 * >  バウンスする）のように表示して。…ある場所でしか見かけないとか
 * >  ある場所や季節のものを 〇〇限定 とか表示したい（台南限定、台湾限定、
 * >  ポケモンの〇〇地方のポケモンみたいな）。」
 *
 * ## 判断はここに書かない
 * - どの札を出すか … `scene-bubbles.ts`（限定の組み立てもそちら）
 * - どう動くか     … `bubble-physics.ts`（枠から出ない・発散しない）
 *
 * ここは**枠の大きさを測って、1コマごとに位置を当てるだけ**。動きの計算を
 * この中に書くと確かめる手が無くなる（あの手の輪は静かに壊れる）。
 *
 * ## 動きを止めたい人には止めて出す
 * `prefers-reduced-motion` のときは輪を回さず、最初の置き方のまま静止する。
 * 札は全部そこに在るので、読める物は1つも減らない。
 */

/** 種類ごとの色と印。**色だけに頼らない** — 印でも種類が分かる。 */
const SKIN: Record<BubbleKind, { chip: string; mark: string }> = {
  // 限定は別格。ここだけ塗りを濃くして、いちばん目に入るようにする。
  limited: { chip: "bg-warn text-warn-foreground ring-warn/40", mark: "✨" },
  place: { chip: "scene-chip-place text-primary-ink ring-primary/25", mark: "📍" },
  media: { chip: "bg-secondary text-foreground ring-border", mark: "📰" },
  situation: { chip: "bg-secondary text-foreground ring-border", mark: "🗣" },
  emotion: { chip: "scene-chip-emotion text-warn-ink ring-warn/25", mark: "💭" },
  time: { chip: "bg-secondary text-foreground ring-border", mark: "🕒" },
  season: { chip: "scene-chip-season text-ok-ink ring-ok/25", mark: "🌱" },
};

/** 浮かべる面の高さ。札の数で少しだけ伸ばす（8つを1段には置けない）。 */
function stageHeight(count: number): number {
  return count <= 3 ? 104 : count <= 5 ? 132 : 164;
}

export function SceneBubbles({
  extras,
}: {
  // 画面側の `word.extras ?? {}` は `Partial`。厳しく受けると呼ぶ側に
  // キャストを書かせることになる(`scene-bubbles.ts` の注)。
  extras: Partial<WordExtrasDTO> | null | undefined;
}) {
  const t = useT();
  const items = useMemo<SceneBubble[]>(
    () =>
      sceneBubbles({
        extras,
        limitedTo: (place) => t("card.limitedTo", { place }),
        seasonName: (key) => t(`card.season.${key}`),
      }),
    [extras, t],
  );

  const boxRef = useRef<HTMLDivElement | null>(null);
  const pillRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const [width, setWidth] = useState(0);
  const height = stageHeight(items.length);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  /**
   * **札の大きさは実測する。**
   *
   * 最初は字数から見積もっていたが、絵で見たら札が枠からはみ出して
   * 切れ、隣とも重なっていた。見積もりに入っていなかったのは印(絵文字)と
   * その間合いで、字数だけでは当てられない — 言語が変われば字の幅も変わる。
   * 一度描いて測れば当てずっぽうが要らなくなる。
   */
  const [measured, setMeasured] = useState<Record<string, { hw: number; hh: number }>>({});

  // 枠の幅を測る。**幅が 0 のまま置かない** — 全部が中央に重なる。
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const shape = items.map((b) => b.id).join("|");

  // 実測。描いた直後に測る（`useLayoutEffect` にすると、見積もりのまま
  // 1コマ描かれるちらつきが出ない）。
  useLayoutEffect(() => {
    const next: Record<string, { hw: number; hh: number }> = {};
    for (const b of items) {
      const el = pillRefs.current.get(b.id);
      if (!el) continue;
      const box = el.getBoundingClientRect();
      // **2px ずつ余らせる。** ぴったりに取ると、影と輪郭が隣に触れて
      // 「くっついている」ように見える。
      if (box.width > 0) next[b.id] = { hw: box.width / 2 + 2, hh: box.height / 2 + 2 };
    }
    setMeasured((cur) => {
      const same =
        Object.keys(next).length === Object.keys(cur).length &&
        Object.entries(next).every(
          ([k, v]) =>
            Math.abs((cur[k]?.hw ?? -1) - v.hw) < 0.5 && Math.abs((cur[k]?.hh ?? -1) - v.hh) < 0.5,
        );
      return same ? cur : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, width]);

  // 置き直し。札の顔ぶれか、枠の幅か、測った大きさが変わったときだけ。
  const sizeKey = items
    .map((b) => `${Math.round(measured[b.id]?.hw ?? 0)}x${Math.round(measured[b.id]?.hh ?? 0)}`)
    .join(",");
  useEffect(() => {
    if (width <= 0 || items.length === 0) {
      setBubbles([]);
      return;
    }
    const world: World = { width, height };
    setBubbles(
      layoutBubbles(
        // 測れていない札は見積もりで置く（1コマ目だけ）。
        items.map((b) => ({ id: b.id, ...(measured[b.id] ?? bubbleSize(b.label)) })),
        world,
        // 種は札の顔ぶれから作る。**毎回同じ語なら同じ置き方**になるので、
        // 開き直すたびに絵が変わらない。
        [...shape].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 7),
      ),
    );
    // `items` は毎回作り直されるので、顔ぶれの文字列で見る。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, width, height, sizeKey]);

  // 輪を回す。**動きを止めたい人には回さない。**
  useEffect(() => {
    if (typeof window === "undefined" || bubbles.length === 0 || width <= 0) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last = performance.now();
    const world: World = { width, height };
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setBubbles((cur) => stepBubbles(cur, world, dt));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // 位置そのものは依存に入れない（毎コマ効果を張り直すことになる）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbles.length, width, height]);

  if (items.length === 0) return null;
  const at = new Map(bubbles.map((b) => [b.id, b]));

  return (
    <div>
      <p className="mb-1 text-caption text-muted-foreground">{t("card.encounterLabels")}</p>
      <div
        ref={boxRef}
        style={{ height }}
        className="relative w-full overflow-hidden rounded-2xl bg-secondary/40"
      >
        {/* **読み上げは並びとして読ませる。** 浮いているのは見た目の話で、
            順番のある一覧であることは変わらない。 */}
        <ul className="contents">
          {items.map((b) => {
            const s = SKIN[b.kind] ?? SKIN.place;
            const pos = at.get(b.id);
            return (
              <li
                key={b.id}
                ref={(el) => {
                  if (el) pillRefs.current.set(b.id, el);
                  else pillRefs.current.delete(b.id);
                }}
                style={
                  pos
                    ? { left: pos.x, top: pos.y, transform: "translate(-50%, -50%)" }
                    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
                }
                // 位置は毎コマ変わるので `transition` を掛けない
                // （掛けると輪と喧嘩して、ぬるりと遅れて動く）。
                className={`absolute inline-flex select-none items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-caption font-semibold shadow-md ring-1 ${s.chip}`}
              >
                <span aria-hidden>{s.mark}</span>
                <span className="sr-only">{t(`card.encKind.${b.kind}`)}: </span>
                {b.label}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
