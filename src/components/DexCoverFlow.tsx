import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type React from "react";
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
import { neutralReadings, useReadingText } from "@/lib/phonetic";
import { COVER_STEP, coverFlowPose, dotWindow, poseTransform, settleIndex } from "@/lib/cover-flow";
import { APPLE_SPRING, createSpring, rubberband, velocityFrom, type Spring } from "@/lib/spring";
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
  initialIndex = 0,
  onBrowse,
}: {
  stickers: StickerWithWord[];
  onOpen: (id: string) => void;
  /** 札の id → 記憶の印。雛形は通信できないので、こちらで渡す。 */
  memory?: Map<string, MemoryBadgeInfo>;
  /** 最初に真ん中へ置く札（雛形で送った途中の形を見るため）。 */
  initialIndex?: number;
  onBrowse?: () => void;
}) {
  const t = useT();
  const fetched = useMemoryBadges(memory === undefined);
  const memoryById = memory ?? fetched;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [center, setCenter] = useState(0);
  useEffect(() => {
    if (center > 0) onBrowse?.();
  }, [center, onBrowse]);
  const centerRef = useRef(0);
  centerRef.current = center;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const countRef = useRef(stickers.length);
  countRef.current = stickers.length;

  /**
   * **送りも傾きも、同じ1コマの中でこちらが決める。**（オーナー報告 2026-09-23
   * の3回目「図鑑の横スライドもっとなめらかにして」）
   *
   * 前はブラウザの横スクロールに任せ、スクロールの後から傾きを書いていた。
   * スクロールは別の糸（合成の糸）で先に進むので、**傾きがいつも1コマ遅れて**
   * 付いてくる — これが「カクカク」の残り。いまは:
   *  ・指の位置をそのまま「どこまで送ったか」（`offset`）にする（1:1 で吸い付く）
   *  ・離したら、指の速さから滑り着く先を見込み（Apple の減衰の式）、
   *    いちばん近い札へ**ばね**で着く（`APPLE_SPRING`、速さは引き継ぐ）
   *  ・位置と傾きは**同じ `transform` 1つ**で書く。遅れが生まれる隙が無い
   *  ・画面の外の札は描かない（`visibility`）。何百枚あっても書くのは十数枚
   */
  const step = useRef(1);
  const offset = useRef(0);
  const hidden = useRef<boolean[]>([]);
  const paint = useCallback((x: number) => {
    offset.current = x;
    const s = step.current;
    const reduced = motionReducedNow();
    cardRefs.current.forEach((el, i) => {
      if (!el) return;
      const rel = (i * s - x) / s;
      const far = Math.abs(rel) > 5;
      if (far) {
        if (!hidden.current[i]) {
          hidden.current[i] = true;
          el.style.visibility = "hidden";
        }
        return;
      }
      if (hidden.current[i]) {
        hidden.current[i] = false;
        el.style.visibility = "";
      }
      const pose = coverFlowPose(rel, reduced);
      el.style.transform = `translate3d(${(i * s - x).toFixed(2)}px,0,0) ${poseTransform(pose)}`;
      el.style.zIndex = String(pose.zIndex);
    });
    const c = Math.max(0, Math.min(countRef.current - 1, Math.round(x / s)));
    setCenter((prev) => (prev === c ? prev : c));
  }, []);
  const spring = useRef<Spring | null>(null);
  useEffect(() => {
    const sp = createSpring(0, paint);
    spring.current = sp;
    return () => sp.dispose();
  }, [paint]);

  const measure = useCallback(() => {
    const first = cardRefs.current.find(Boolean);
    step.current = Math.max(1, (first?.offsetWidth ?? 1) * COVER_STEP);
  }, []);
  useLayoutEffect(() => {
    // 絞り込みで札が変わったら、前の札の控えを残さず先頭（または指定の札）から。
    cardRefs.current.length = stickers.length;
    hidden.current = [];
    measure();
    const start = Math.max(0, Math.min(stickers.length - 1, initialIndex)) * step.current;
    spring.current?.set(start, 0);
    paint(start);
  }, [measure, paint, stickers, initialIndex]);
  useEffect(() => {
    const onResize = () => {
      measure();
      spring.current?.set(centerRef.current * step.current, 0);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure]);

  const bringToCenter = useCallback((i: number) => {
    const n = countRef.current;
    if (!n) return;
    const j = Math.max(0, Math.min(n - 1, i));
    if (motionReducedNow()) spring.current?.set(j * step.current, 0);
    else spring.current?.to(j * step.current, APPLE_SPRING.smooth);
  }, []);

  // ---- 指で送る -------------------------------------------------------------
  const drag = useRef<{
    id: number;
    x0: number;
    y0: number;
    from: number;
    on: boolean;
    history: { t: number; x: number }[];
  } | null>(null);
  const swallowClick = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swallowClick.current = false;
    spring.current?.stop();
    drag.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      from: offset.current,
      on: false,
      history: [{ t: e.timeStamp, x: e.clientX }],
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    if (!d.on) {
      // 縦に動かしたなら、送りではない（画面の縦の動きに譲る）。
      if (Math.abs(e.clientY - d.y0) > 10 && Math.abs(e.clientY - d.y0) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      if (Math.abs(dx) < 6) return;
      d.on = true;
      stageRef.current?.setPointerCapture(e.pointerId);
    }
    const max = (countRef.current - 1) * step.current;
    let x = d.from - dx;
    // 端では抵抗を付ける（硬く止めない）。
    if (x < 0) x = -rubberband(-x, step.current * 2);
    else if (x > max) x = max + rubberband(x - max, step.current * 2);
    d.history.push({ t: e.timeStamp, x: e.clientX });
    if (d.history.length > 6) d.history.shift();
    spring.current?.set(x, 0);
  };
  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !d.on) return;
    swallowClick.current = true;
    // 指の速さ（px/s）。送り（offset）は指と逆向きに進む。
    const v = -velocityFrom(d.history);
    const target = settleIndex(offset.current, v, step.current, countRef.current);
    if (motionReducedNow()) spring.current?.set(target * step.current, 0);
    else
      spring.current?.to(target * step.current, {
        // 勢いのある払いにだけ、わずかな行き過ぎ（Apple の snappy）。
        ...(Math.abs(v) > 600 ? APPLE_SPRING.snappy : APPLE_SPRING.smooth),
        velocity: v,
      });
  };

  // トラックパッドの横の払い。止まったら近い札へ着く。
  const wheelTimer = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
    if (!dx) return;
    const max = (countRef.current - 1) * step.current;
    spring.current?.set(Math.max(0, Math.min(max, offset.current + dx)), 0);
    window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(
      () => bringToCenter(Math.round(offset.current / step.current)),
      140,
    );
  };
  useEffect(() => () => window.clearTimeout(wheelTimer.current), []);

  // 札に渡す関数は作り直さない（作り直すと、真ん中が1枚動くたびに全部の札を
  // 描き直すことになり、送りの途中で引っかかる）。
  const pressCard = useCallback(
    (i: number, id: string) => {
      if (swallowClick.current) {
        swallowClick.current = false;
        return;
      }
      return i === centerRef.current ? onOpenRef.current(id) : bringToCenter(i);
    },
    [bringToCenter],
  );
  const setCardRef = useCallback((i: number, el: HTMLDivElement | null) => {
    cardRefs.current[i] = el;
  }, []);

  const current = stickers[center];
  return (
    <section aria-label={t("dex.cards")} className="dex-cf -mx-4">
      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") bringToCenter(centerRef.current + 1);
          else if (e.key === "ArrowLeft") bringToCenter(centerRef.current - 1);
          else return;
          e.preventDefault();
        }}
        tabIndex={0}
        className="dex-cf__stage"
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
  // **設定の表記だけ**（注音かピンイン。オーナー報告 2026-09-23「ピン音に設定して
  // いるのに、図鑑の横にスライドするやつが注音のまま」）。英語の語なら IPA。
  const reading = useReadingText(
    s.word.language,
    neutralReadings(s.word.language, s.word.reading_zhuyin, s.word.pinyin),
  );
  const date = new Date(s.taken_at);
  return (
    <div ref={(el) => setRef(i, el)} className="dex-cf__slot">
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
