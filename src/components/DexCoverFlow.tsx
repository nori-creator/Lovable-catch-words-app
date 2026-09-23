import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import type { StickerWithWord } from "@/lib/stickers.functions";
import { stickerPhotoUrl } from "@/lib/sticker-photo";
import { CachedImg } from "@/lib/image-cache";
import { Zh } from "@/components/Zh";
import { MemoryBadge } from "@/components/MemoryBadge";
import type { MemoryBadgeInfo } from "@/lib/memory-badge";
import { useMemoryBadges } from "@/lib/use-memory-map";
import { asCategoryKey, categoryEmoji } from "@/lib/category";
import { localeOf, useT, useUiLang } from "@/lib/i18n";
import { coverFlowPose, dotWindow, poseTransform } from "@/lib/cover-flow";
import { focusedIndex } from "@/lib/scan-layout";
import { motionReducedNow } from "@/hooks/use-reduced-motion";

/**
 * 図鑑の**カード表示**。1語1枚のカードを横に送る（カバーフロー）。
 *
 * （オーナー指示 2026-09-22「図鑑の種類をもう一つ追加する。添付した
 *  バブルティーのカードを動画のように横にスライドできるようにする。
 *  もちろん表示するカードのカテゴリーや日付の設定によって表示されるもの
 *  を絞れるように」）
 *
 *  ・絞り込みは図鑑の上の欄（カテゴリー・日付）がそのまま効く — ここは
 *    絞った後の `stickers` を受け取るだけ。
 *  ・真ん中の1枚は正面・手前、左右は真ん中へ顔を向けて奥へ下がる
 *    （`lib/cover-flow.ts`）。傾きは**送った位置から毎フレーム**決めるので、
 *    指に吸い付いて動き、途中で止めても崩れない。
 *  ・真ん中のカードを押すと詳細、脇のカードを押すとそのカードが真ん中へ来る。
 *  ・動きを減らす設定では傾けない。
 */
export function DexCoverFlow({
  stickers,
  onOpen,
  memory,
}: {
  stickers: StickerWithWord[];
  onOpen: (id: string) => void;
  /** 札の id → 記憶の印。雛形は通信できないので、こちらで渡す。 */
  memory?: Map<string, MemoryBadgeInfo>;
}) {
  const t = useT();
  const fetched = useMemoryBadges();
  const memoryById = memory ?? fetched;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const frame = useRef(0);
  const [center, setCenter] = useState(0);
  const centerRef = useRef(0);
  centerRef.current = center;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  /**
   * **滑らかさのために、測るのは1回・書くのは変わった札だけ。**（オーナー報告
   * 2026-09-23「カクカクしてるからもっと滑らかにスライドできるように」）
   *
   * 前は1コマごとに**全部の札**の `offsetLeft` を読み、その合間に傾きを
   * 書いていた。書いた直後に読むと、ブラウザは毎回レイアウトをやり直す
   * （札の数だけ）。さらに全部の札に鏡映り（`-webkit-box-reflect`）が付いて
   * いて、傾きが変わるたびに描き直していた。
   *  ・位置と幅は**大きさが変わった時だけ**測る（`measure`）。傾きは
   *    `offsetLeft` を変えないので、送っている間は測り直さなくてよい。
   *  ・傾きの文字列が前と同じ札には書かない（4枚より先はずっと同じ）。
   *  ・鏡映りはやめた（styles.css の `.dex-cf__card`）。
   */
  const boxes = useRef<Array<{ left: number; width: number }>>([]);
  const written = useRef<string[]>([]);
  const measure = useCallback(() => {
    boxes.current = cardRefs.current.map((el) =>
      el ? { left: el.offsetLeft, width: el.offsetWidth || 1 } : { left: 0, width: 1 },
    );
    written.current = [];
  }, []);
  const layout = useCallback(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const reduced = motionReducedNow();
    const mid = sc.scrollLeft + sc.clientWidth / 2;
    const bx = boxes.current;
    cardRefs.current.forEach((el, i) => {
      const b = bx[i];
      if (!el || !b) return;
      const pose = coverFlowPose((b.left + b.width / 2 - mid) / (b.width * 0.62), reduced);
      const key = `${poseTransform(pose)}|${pose.zIndex}`;
      if (written.current[i] === key) return;
      written.current[i] = key;
      el.style.transform = poseTransform(pose);
      el.style.zIndex = String(pose.zIndex);
    });
    const i = focusedIndex(bx, {
      scrollLeft: sc.scrollLeft,
      width: sc.clientWidth,
      scrollWidth: sc.scrollWidth,
    });
    if (i >= 0) setCenter((c) => (c === i ? c : i));
  }, []);

  const onScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(layout);
  };
  useLayoutEffect(() => {
    // 絞り込みで札が減ったとき、前の札の控えを残さない。
    cardRefs.current.length = stickers.length;
    measure();
    layout();
  }, [measure, layout, stickers]);
  useEffect(() => {
    const h = () => {
      measure();
      layout();
    };
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("resize", h);
      cancelAnimationFrame(frame.current);
    };
  }, [measure, layout]);
  // 絞り込みを変えたら先頭へ戻す（前の位置のままだと、無いカードの位置で止まる）。
  useEffect(() => {
    scrollerRef.current?.scrollTo({ left: 0 });
  }, [stickers.length]);

  const bringToCenter = useCallback((i: number) => {
    const sc = scrollerRef.current;
    const el = cardRefs.current[i];
    if (!sc || !el) return;
    sc.scrollTo({
      left: el.offsetLeft + el.offsetWidth / 2 - sc.clientWidth / 2,
      behavior: motionReducedNow() ? "auto" : "smooth",
    });
  }, []);
  // 札に渡す関数は作り直さない（作り直すと、真ん中が1枚動くたびに全部の札を
  // 描き直すことになり、送りの途中で引っかかる）。
  const pressCard = useCallback(
    (i: number, id: string) => (i === centerRef.current ? onOpenRef.current(id) : bringToCenter(i)),
    [bringToCenter],
  );
  const setCardRef = useCallback((i: number, el: HTMLDivElement | null) => {
    cardRefs.current[i] = el;
  }, []);

  const current = stickers[center];
  return (
    <section aria-label={t("dex.cards")} className="dex-cf -mx-4">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="dex-cf__scroller flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain pb-6 pt-6"
      >
        {stickers.map((s, i) => (
          <CoverCard
            key={s.id}
            sticker={s}
            index={i}
            isCenter={i === center}
            mem={memoryById.get(s.id)}
            onPress={pressCard}
            setRef={setCardRef}
          />
        ))}
      </div>
      {/* **青い点**（オーナー指示 2026-09-23）。いまの1枚のまわりだけ出す
          （`dotWindow`）。押すとその札へ送る。数は読み上げにだけ言う。 */}
      {current && (
        <div className="dex-cf__dots" aria-hidden="true">
          {dotWindow(stickers.length, center).map((d) => (
            <button
              key={d.i}
              type="button"
              tabIndex={-1}
              onClick={() => bringToCenter(d.i)}
              className="dex-cf__dot-hit"
            >
              <span className="dex-cf__dot" data-size={d.size} />
            </button>
          ))}
        </div>
      )}
      {current && (
        <p className="sr-only" aria-live="polite">
          {center + 1} / {stickers.length}
        </p>
      )}
    </section>
  );
}

/**
 * 1枚のカード。**真ん中が動いても、変わるのは前後の2枚だけ**になるよう
 * `memo` で包む（何百枚あっても、送りの途中で全部を描き直さない）。
 */
const CoverCard = memo(function CoverCard({
  sticker: s,
  index: i,
  isCenter,
  mem,
  onPress,
  setRef,
}: {
  sticker: StickerWithWord;
  index: number;
  isCenter: boolean;
  mem: MemoryBadgeInfo | undefined;
  onPress: (i: number, id: string) => void;
  setRef: (i: number, el: HTMLDivElement | null) => void;
}) {
  const t = useT();
  const locale = localeOf(useUiLang());
  const photo = stickerPhotoUrl(s);
  const cat = asCategoryKey(s.word.category_key);
  const reading = s.word.reading_zhuyin || s.word.pinyin;
  const date = new Date(s.taken_at);
  return (
    <div ref={(el) => setRef(i, el)} className="dex-cf__slot shrink-0 snap-center">
      <button
        type="button"
        onClick={() => onPress(i, s.id)}
        aria-label={`${s.word.headword} ${s.word.meaning_ja}`}
        aria-current={isCenter || undefined}
        className="dex-cf__card flex h-full w-full flex-col overflow-hidden rounded-[22px] bg-card text-left ring-1 ring-border"
      >
        <span className="relative block h-[64%] w-full overflow-hidden bg-secondary">
          {photo ? (
            <CachedImg
              src={photo}
              alt=""
              loading={i < 4 ? "eager" : "lazy"}
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <Zh className="grid h-full w-full place-items-center text-hero font-bold text-muted-foreground">
              {s.word.headword}
            </Zh>
          )}
          <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-caption font-semibold text-white">
            {categoryEmoji(cat)} {t(`cat.${cat}`)}
          </span>
          {mem && <MemoryBadge info={mem} className="absolute right-2 top-2" />}
        </span>
        <span className="flex min-h-0 flex-1 flex-col justify-between p-3.5">
          <span className="block min-w-0">
            <Zh className="block truncate text-title font-bold leading-tight">{s.word.headword}</Zh>
            {reading && (
              <span className="mt-0.5 block truncate text-footnote text-muted-foreground">
                {reading}
              </span>
            )}
            <span className="mt-1 block truncate text-body">{s.word.meaning_ja}</span>
          </span>
          <span className="mt-2 flex items-center gap-1.5 truncate text-caption text-muted-foreground">
            <span className="shrink-0 tabular-nums">
              {Number.isNaN(date.getTime())
                ? ""
                : date.toLocaleDateString(locale, { month: "short", day: "numeric" })}
            </span>
            {s.location_name && (
              <>
                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{s.location_name}</span>
              </>
            )}
          </span>
        </span>
      </button>
    </div>
  );
});
