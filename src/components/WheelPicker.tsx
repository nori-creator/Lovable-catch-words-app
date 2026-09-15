import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { haptic } from "@/lib/haptics";

/**
 * 指で転がして選ぶ輪（オーナー指示 2026-09-15「設定のレベルや言語を選ぶ、
 * 縦に選択肢が並んでるもの。タップではなく Apple のスクロールして選択する
 * ような美しいものに変更して」）。
 *
 * ## 何を作り直したか
 * これまでは素の `<select>` だった。iOS では OS の輪が開くが、Android と
 * ブラウザでは**ただの一覧**が落ちてくる。同じアプリなのに端末で別物になる。
 *
 * ## 転がすのは自分で書かない — ブラウザの巻き取りに任せる
 * 指の速度・慣性・端でのゴムの返り。これを自前で書くと、必ずどこかが
 * 本物と違う。**縦スクロールをそのまま使い**、`scroll-snap` で1行に吸わせる。
 * 慣性も端の抵抗も OS の物がそのまま出る（apple-design §5「掴んだ物が
 * そのまま動く」）。
 *
 * 自分で書くのは**見た目だけ**:
 *   ・真ん中から離れた行ほど寝かせて薄くする（円筒に見せる）
 *   ・真ん中に選択の帯を置く（動かない。動くのは行のほう）
 *   ・上下を地の色で溶かす
 *
 * ## 読み上げと鍵盤
 * 見た目は輪だが、中身は一覧。`role="listbox"` と `role="option"` を持ち、
 * ↑↓・Home/End・PageUp/Down で動く。`aria-activedescendant` で「いまどれ」を
 * 伝えるので、読み上げでも輪であることに気づかずに使える。
 */

/** 1行の高さ(px)。 */
const ITEM_H = 40;
/** 見せる行の上限。**奇数**でなければ真ん中が決まらない。 */
const MAX_VISIBLE = 5;

/**
 * 何行ぶんの窓にするか。
 *
 * **選択肢が2つしか無い輪に5行ぶんの窓を開けない。** 上下が空っぽの箱に
 * なり、何も無い所を転がしているように見える（検査の絵でそうなった）。
 * 選択肢の数に合わせ、真ん中が決まるように必ず奇数へ寄せる。
 */
function visibleRows(count: number): number {
  const odd = count % 2 === 1 ? count : count + 1;
  return Math.max(3, Math.min(MAX_VISIBLE, odd));
}

export function WheelPicker({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  const listId = useId();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();
  /** いま真ん中に来ている行。巻き取りの最中も動く（見た目のため）。 */
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      options.findIndex((o) => o.value === value),
    ),
  );
  /** 自分で位置を入れ直している最中か。**その間の巻き取りは「人の操作」ではない。** */
  const settingRef = useRef(false);
  const commitTimer = useRef(0);
  /** 最後に触覚を鳴らした行。**行をまたいだ時だけ**鳴らす。 */
  const lastTick = useRef(active);

  const visible = visibleRows(options.length);
  const pad = ITEM_H * ((visible - 1) / 2);

  /** 行ごとの見た目（真ん中から離れるほど寝かせて薄く）。 */
  const paint = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const center = el.scrollTop / ITEM_H;
    const rows = el.querySelectorAll<HTMLElement>("[data-wheel-item]");
    rows.forEach((row, i) => {
      const d = i - center;
      const a = Math.min(Math.abs(d), 3);
      if (reduced) {
        // 寝かせない。**選んでいる所が分かればよい。**
        row.style.transform = "";
        row.style.opacity = a < 0.5 ? "1" : "0.45";
        return;
      }
      row.style.transform = `rotateX(${d * -22}deg) scale(${1 - a * 0.06})`;
      row.style.opacity = String(Math.max(0.18, 1 - a * 0.34));
    });
  }, [reduced]);

  /** その行へ位置を入れる。`smooth` は人の操作の後始末にだけ使う。 */
  const scrollToIndex = useCallback((i: number, behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    settingRef.current = true;
    el.scrollTo({ top: i * ITEM_H, behavior });
    // `auto` はその場で終わるが、`smooth` は続く。少し待ってから手を離す。
    window.setTimeout(
      () => {
        settingRef.current = false;
      },
      behavior === "smooth" ? 320 : 0,
    );
  }, []);

  // 外から値が変わったら合わせる（言語を変えると級の一覧ごと入れ替わる等）。
  useEffect(() => {
    const i = options.findIndex((o) => o.value === value);
    if (i < 0) return;
    setActive(i);
    lastTick.current = i;
    scrollToIndex(i);
    // 位置を入れた直後に描かないと、開いた1枚目だけ平らに写る。
    requestAnimationFrame(paint);
  }, [value, options, scrollToIndex, paint]);

  const onScroll = () => {
    paint();
    const el = scrollRef.current;
    if (!el) return;
    const i = Math.max(0, Math.min(options.length - 1, Math.round(el.scrollTop / ITEM_H)));
    setActive(i);
    // **行をまたいだ時だけ**短い触覚。輪を回している手応え。
    if (i !== lastTick.current) {
      lastTick.current = i;
      if (!settingRef.current) haptic("selection");
    }
    if (settingRef.current) return;
    // 止まってから決める。転がっている途中の行をいちいち保存しない。
    window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      const o = options[i];
      if (o && o.value !== value) onChange(o.value);
    }, 120);
  };

  const move = (delta: number) => {
    const i = Math.max(0, Math.min(options.length - 1, active + delta));
    if (i === active) return;
    scrollToIndex(i, "smooth");
    setActive(i);
    haptic("selection");
    const o = options[i];
    if (o && o.value !== value) onChange(o.value);
  };

  return (
    <div>
      <span id={`${id}-label`} className="text-field font-medium text-foreground">
        {label}
      </span>
      <div className="wheel mt-1" style={{ height: ITEM_H * visible }}>
        {/* 選択の帯。**動かない** — 動くのは行のほう。 */}
        <span className="wheel__band" aria-hidden style={{ height: ITEM_H }} />
        <div
          ref={scrollRef}
          id={listId}
          role="listbox"
          aria-labelledby={`${id}-label`}
          aria-activedescendant={`${listId}-${active}`}
          tabIndex={0}
          onScroll={onScroll}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              move(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              move(-1);
            } else if (e.key === "PageDown") {
              e.preventDefault();
              move(3);
            } else if (e.key === "PageUp") {
              e.preventDefault();
              move(-3);
            } else if (e.key === "Home") {
              e.preventDefault();
              move(-options.length);
            } else if (e.key === "End") {
              e.preventDefault();
              move(options.length);
            }
          }}
          className="wheel__scroll"
        >
          <div aria-hidden style={{ height: pad }} />
          {options.map((o, i) => (
            <div
              key={o.value}
              data-wheel-item
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                // 押した行も選べる。**転がすだけが入口ではない。**
                scrollToIndex(i, "smooth");
                setActive(i);
                if (o.value !== value) onChange(o.value);
              }}
              className="wheel__item"
              style={{ height: ITEM_H }}
            >
              {o.label}
            </div>
          ))}
          <div aria-hidden style={{ height: pad }} />
        </div>
        <span className="wheel__fade" aria-hidden />
      </div>
    </div>
  );
}
