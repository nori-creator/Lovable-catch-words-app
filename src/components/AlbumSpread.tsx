import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { localeOf, useT, useUiLang } from "@/lib/i18n";
import { Zh } from "@/components/Zh";
import { CachedImg } from "@/lib/image-cache";
import { AlbumSpanTabs } from "@/components/AlbumSpanTabs";
import { DayJournalPage } from "@/components/DayJournalPage";
import { stickerPhotoUrl } from "@/lib/sticker-photo";
import { spanHeading, keyToDate, localDayKey, type AlbumSpan } from "@/lib/album-span";
import { photoPages, rightPageIsJournal, tileLayout, type Spread } from "@/lib/album-spread";
import type { StickerWithWord } from "@/lib/stickers.functions";
import { formatCount } from "@/lib/count";

/**
 * **本物のアルバムを開いた見開き。**
 *
 * オーナー指摘 2026-08-21:
 * > 「本棚の背表紙を**タップすると本物のアルバムのページがめくれて**
 * >  日ごとのアルバムの写真、週ごとのアルバムの写真が見えるようにしたい。
 * >  **週ごとと月ごとは、画像の大きさを小さく調整して、多くの画像が
 * >  見えるようにして。**」
 * > 「**それぞれの画像をタップしたら、その画像が左側にその日の日記が
 * >  右側に見開きで**でる。」
 * > 「この見開きのページの**上側に日ごと週ごとと月ごとに変更**できるように」
 *
 * ## 縦に流さない
 * これまでは日ごとの塊が縦に何十個も続いていた。オーナーがメモに5回
 * 書いた「昔に撮ったもの見ない」「下にスクロールするモチベーションない」は
 * ここに効く。**1組ずつめくる**形にすれば、1回の指で1束が終わる。
 *
 * ## 紙の上の字は `--album-ink` に固定する
 * 台紙(`album-bg-*`)は**テーマに関わらず明るい面**で固定してある。そこに
 * `text-foreground` のようなテーマ追従の色を載せると、暗いテーマで
 * 「白い字を生成りの紙に」載せることになる — 最初の版がまさにそれで、
 * 検査がコントラスト 1.00 で弾いた。
 *
 * **薄いほうの `--album-ink-dim` も使わない。** あれは「いちばん明るい面
 * (白い印画紙)」に対して 4.5:1 になるよう決めた濃さで、生成りの台紙の上では
 * 4.29 まで落ちる(これも検査が弾いた)。しかも台紙はコルクにも変えられる。
 * 台紙が何色になっても保つのは濃いほうだけなので、**強弱は色ではなく
 * 太さと大きさ**で付ける。
 *
 * ## 何を左右に置くかは `album-spread.ts` が決める
 * 束ね方で絵の大きさも、右のページが日記か写真かも変わる。判断を
 * ここに散らすと、日と週で別々に壊れる(この app が何度も踏んだ形)。
 *
 * 通信を持たない。検査の雛形から本物の見た目をそのまま撮れる。
 */
export type SpreadGroup = {
  /** 束の鍵(`YYYY-MM-DD`。週なら月曜、月なら1日)。 */
  key: string;
  items: StickerWithWord[];
};

export type JournalByDay = Map<
  string,
  { body: string; note?: string | null; used_sticker_ids: string[] }
>;

export function AlbumSpread({
  span,
  onSpan,
  groups,
  journals,
  bgClass,
  onClose,
  onOpenSticker,
}: {
  span: AlbumSpan;
  onSpan: (s: AlbumSpan) => void;
  /** 新しい束が先。空なら「まだ何も無い」と言う。 */
  groups: readonly SpreadGroup[];
  journals?: JournalByDay;
  bgClass: string;
  onClose: () => void;
  /** 写真を長く見たあと、札の詳細へ行きたくなったとき。 */
  onOpenSticker?: (id: string) => void;
}) {
  const t = useT();
  const dateLocale = localeOf(useUiLang());
  /** 何束目を開いているか。 */
  const [groupIdx, setGroupIdx] = useState(0);
  /** その束の何組目の見開きか(月は1組に入りきらない)。 */
  const [pageIdx, setPageIdx] = useState(0);
  /** 1枚だけ選んでいるとき。左にその絵、右にその日の日記。 */
  const [picked, setPicked] = useState<string | null>(null);

  const group = groups[Math.min(groupIdx, Math.max(0, groups.length - 1))];
  const pages: Spread<StickerWithWord>[] = useMemo(
    () => photoPages(group?.items ?? [], span),
    [group, span],
  );
  const page = pages[Math.min(pageIdx, pages.length - 1)] ?? { left: [], right: [] };

  /** 束ね方や束を変えたら、選んだ1枚と組の位置を戻す。 */
  function goGroup(next: number) {
    setGroupIdx(Math.min(Math.max(0, next), Math.max(0, groups.length - 1)));
    setPageIdx(0);
    setPicked(null);
  }
  function changeSpan(s: AlbumSpan) {
    onSpan(s);
    setGroupIdx(0);
    setPageIdx(0);
    setPicked(null);
  }

  const pickedSticker = picked ? (group?.items.find((s) => s.id === picked) ?? null) : null;
  const pickedDayKey = pickedSticker ? localDayKey(new Date(pickedSticker.created_at)) : null;
  const pickedJournal = pickedDayKey ? journals?.get(pickedDayKey) : undefined;

  /** 日ごとの束では、右のページはその日の日記。 */
  const dayJournal = rightPageIsJournal(span) && group ? journals?.get(group.key) : undefined;

  return (
    <div
      className={`page-turn album-page relative rounded-2xl border border-border p-3 ${bgClass}`}
    >
      {/* 上の帯: 束ね方(オーナー指摘「見開きのページの上側に」)と閉じる。 */}
      <div className="mb-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <AlbumSpanTabs value={span} onChange={changeSpan} />
        </div>
        <button
          onClick={onClose}
          aria-label={t("common.close")}
          className="-m-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-album-ink"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {groups.length === 0 || !group ? (
        <p className="py-10 text-center text-footnote text-album-ink">{t("home.spreadEmpty")}</p>
      ) : (
        <>
          {/* 束の名前と、前後の束へ。週番号は読めないので始まりと終わりの日で言う。 */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <PageArrow
              dir="prev"
              // **新しい束が先**に入っているので、「前の束」は添字が大きいほう。
              disabled={groupIdx >= groups.length - 1}
              onClick={() => goGroup(groupIdx + 1)}
              label={t("home.olderSpread")}
            />
            <p className="min-w-0 truncate text-center text-footnote font-semibold text-album-ink">
              {span === "day"
                ? keyToDate(group.key).toLocaleDateString(dateLocale, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : spanHeading(group.key, span, dateLocale)}
              <span className="ml-1.5 font-normal text-album-ink">
                {t("home.spanCount", { n: formatCount(group.items.length) })}
              </span>
            </p>
            <PageArrow
              dir="next"
              disabled={groupIdx <= 0}
              onClick={() => goGroup(groupIdx - 1)}
              label={t("home.newerSpread")}
            />
          </div>

          {/* 見開き。綴じ目を挟んで左右。**画面が狭いときは縦に積む** —
              390px を2つに割ると1枚が指より小さくなる。 */}
          <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* 綴じ目。広い画面のときだけ引く(縦に積むときは意味が無い)。 */}
            <span
              aria-hidden
              className="absolute inset-y-2 left-1/2 hidden w-px -translate-x-1/2 bg-border sm:block"
            />
            {pickedSticker ? (
              <>
                <FocusPhoto sticker={pickedSticker} onOpen={onOpenSticker} />
                <JournalSide
                  journal={pickedJournal}
                  items={group.items}
                  emptyText={t("home.noJournalThatDay")}
                />
              </>
            ) : (
              <>
                <PhotoPage items={page.left} span={span} onPick={setPicked} />
                {rightPageIsJournal(span) ? (
                  // **写真はこぼさない。** 日ごとは左に全部載る
                  // (`photoPages`)ので、右は日記だけ。狭い画面で縦に積んだ
                  // とき「写真 → 日記 → 写真」にならない(絵で見つけた)。
                  <JournalSide
                    journal={dayJournal}
                    items={group.items}
                    emptyText={t("home.noJournalThatDay")}
                  />
                ) : (
                  <PhotoPage items={page.right} span={span} onPick={setPicked} />
                )}
              </>
            )}
          </div>

          {/* 束が1組に入りきらないとき(月ごと)。 */}
          {pages.length > 1 && !pickedSticker && (
            <div className="mt-2 flex items-center justify-center gap-3">
              <PageArrow
                dir="prev"
                disabled={pageIdx <= 0}
                onClick={() => setPageIdx((i) => i - 1)}
                label={t("home.prevPage")}
              />
              <span className="text-caption text-album-ink">
                {pageIdx + 1} / {pages.length}
              </span>
              <PageArrow
                dir="next"
                disabled={pageIdx >= pages.length - 1}
                onClick={() => setPageIdx((i) => i + 1)}
                label={t("home.nextPage")}
              />
            </div>
          )}

          {pickedSticker && (
            <button
              onClick={() => setPicked(null)}
              className="mt-2 min-h-11 w-full rounded-full text-footnote text-album-ink"
            >
              {t("home.backToSpread")}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** 片面ぶんの写真。大きさは束ね方で変わる(`album-spread.ts`)。 */
function PhotoPage({
  items,
  span,
  onPick,
}: {
  items: readonly StickerWithWord[];
  span: AlbumSpan;
  onPick: (id: string) => void;
}) {
  const t = useT();
  const { cols, rowHeight } = tileLayout(span);
  if (items.length === 0) return <div aria-hidden />;
  return (
    <div
      // 足場は **Tailwind の任意値ではなくインラインの `style`** で書く —
      // 検査の足場は `@source` の外なので、クラス名で列を作ると素の div が
      // 並ぶだけの絵になる。
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: "6px",
      }}
    >
      {items.map((s) => {
        // アルバムはネットの絵を貼らない(2026-08-21 の指摘。`home.tsx` に理由)。
        const url = stickerPhotoUrl(s, { thumb: true, exclude: ["placeholder"] });
        return (
          <button
            key={s.id}
            onClick={() => onPick(s.id)}
            aria-label={t("common.memoryOf", { word: s.word.headword })}
            // **`.photo-print` は使わない。** あの印画紙は下に 26px の帯を
            // 持っていて、見出し語を置くためのもの。見開きの小さなマスでは
            // 帯が絵より高くなり、月ごと(46px)では絵が 14px まで潰れた
            // (絵で見つけた)。ここは細い白フチだけにする。
            style={{
              height: `${rowHeight}px`,
              background: "#fdfbf6",
              padding: "2px",
              borderRadius: "2px",
              boxShadow: "0 1px 2px rgb(60 42 18 / 0.3)",
            }}
            className="album-tile relative overflow-hidden"
          >
            {url ? (
              <CachedImg
                src={url}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : (
              // 写真の無い札は語の字そのものを札にする(アルバムと同じ作法)。
              <Zh className="grid h-full w-full place-items-center px-0.5 text-center text-caption font-semibold leading-tight text-album-ink">
                {s.word.headword}
              </Zh>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 右のページ(日ごと)。日記があれば日記、無ければそう言う。
 * 束に写真が余っていれば、日記の下に小さく続ける — 捨てない。
 */
function JournalSide({
  journal,
  items,
  emptyText,
}: {
  journal?: { body: string; note?: string | null; used_sticker_ids: string[] };
  items: readonly StickerWithWord[];
  emptyText: string;
}) {
  const used = new Set(journal?.used_sticker_ids ?? []);
  return (
    <div className="min-w-0">
      {journal ? (
        <DayJournalPage
          body={journal.body}
          note={journal.note}
          usedWords={items.filter((s) => used.has(s.id)).map((s) => s.word.headword)}
          // **すでにアルバムの台紙の上に居る。** 台紙は明るい面で固定なので、
          // 中の字もテーマ追従をやめて `--album-ink` に揃える。
          onPaper
        />
      ) : (
        <p className="py-6 text-center text-caption text-album-ink">{emptyText}</p>
      )}
    </div>
  );
}

/** 選んだ1枚を大きく。 */
function FocusPhoto({
  sticker,
  onOpen,
}: {
  sticker: StickerWithWord;
  onOpen?: (id: string) => void;
}) {
  const t = useT();
  const url = stickerPhotoUrl(sticker, { exclude: ["placeholder"] });
  return (
    <button
      onClick={() => onOpen?.(sticker.id)}
      style={{
        background: "#fdfbf6",
        padding: "4px",
        borderRadius: "2px",
        boxShadow: "0 2px 6px rgb(60 42 18 / 0.3)",
      }}
      className="relative block aspect-square w-full overflow-hidden"
      aria-label={t("common.memoryOf", { word: sticker.word.headword })}
    >
      {url ? (
        <CachedImg src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <Zh className="grid h-full w-full place-items-center px-2 text-center text-title font-semibold text-album-ink">
          {sticker.word.headword}
        </Zh>
      )}
    </button>
  );
}

function PageArrow({
  dir,
  disabled,
  onClick,
  label,
}: {
  dir: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-album-ink disabled:opacity-30"
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
