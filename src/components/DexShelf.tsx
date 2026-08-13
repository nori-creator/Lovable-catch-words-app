import { useMemo } from "react";
import { CachedImg } from "@/lib/image-cache";
import { useT } from "@/lib/i18n";
import {
  ROOM_KEYS,
  ROOM_CATEGORIES,
  asCategoryKey,
  categoryEmoji,
  type CategoryKey,
  type RoomKey,
} from "@/lib/category";
import type { StickerWithWord } from "@/lib/stickers.functions";

/**
 * 図鑑の棚。
 *
 * 平らなグリッドをやめた理由は見た目ではなく**記憶の掛かり方**。
 * 人はモノを覚えるとき、その置き場所を一緒に覚えている。毎回並びが変わる
 * グリッドは、脳が単語を引っ掛ける場所を与えない。だから単語は
 * **毎回同じ部屋の同じ棚**に居る。
 *
 * 構造は 部屋 → 棚 → 段 の3層。1つの棚に入りきらない分は**折り返して
 * 次の段**になる(横スクロールにしたら右端で切れたものが存在ごと見えなく
 * なり、収集物としては筋が悪かった — 実際に描いて分かった)。
 *
 * 1段の作りは参考動画のとおり:
 *   [モノが下端で揃って立つ] → [棚板の線] → [題名の行(モノと同じ列)]
 *
 * 見た目の要は3つだけ。厚い板は作らない:
 *   1. 面    — 部屋の背景
 *   2. 線    — 棚板(.shelf-rule)
 *   3. 接地影 — モノが浮いていないこと
 * モノは高さが違うまま**下端で揃う**。それが「立っている」に見える正体で、
 * 大きさがまちまちなのは欠点ではなく本物らしさになる。
 */

type Props = {
  stickers: StickerWithWord[];
  /** 絞り込み中のカテゴリー(null = すべて)。 */
  activeCategory: string | null;
  onOpen: (id: string) => void;
  /** 着弾中のステッカー — その棚を揺らし、そのスロットを光らせる。 */
  justCaught?: string;
  /** 1段に並べる数。第3段の密度切替でここが変わる。 */
  perShelf?: number;
};

export function DexShelf({ stickers, activeCategory, onOpen, justCaught, perShelf = 3 }: Props) {
  const t = useT();

  /** カテゴリー → そのカテゴリーのステッカー。 */
  const byCategory = useMemo(() => {
    const map = new Map<CategoryKey, StickerWithWord[]>();
    for (const s of stickers) {
      const k = asCategoryKey(s.word.category_key);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return map;
  }, [stickers]);

  /**
   * 描く部屋を決める。
   *
   * 空の棚が見えていること自体は収集の動機になる(「ここに入る」が先に
   * 分かる)。ただし54棚すべてを空で見せると圧が強すぎるので、
   * **中身がある部屋 + まだ手つかずの部屋を1つ**だけ出す。
   */
  const rooms = useMemo(() => {
    if (activeCategory) {
      const room = ROOM_KEYS.find((r) =>
        ROOM_CATEGORIES[r].includes(asCategoryKey(activeCategory)),
      );
      return room ? [room] : [];
    }
    const filled: RoomKey[] = [];
    const empty: RoomKey[] = [];
    for (const r of ROOM_KEYS) {
      const has = ROOM_CATEGORIES[r].some((c) => (byCategory.get(c)?.length ?? 0) > 0);
      (has ? filled : empty).push(r);
    }
    return [...filled, ...empty.slice(0, 1)];
  }, [byCategory, activeCategory]);

  return (
    <div className="space-y-8">
      {rooms.map((room) => {
        const shelves = ROOM_CATEGORIES[room].filter((c) => {
          if (activeCategory) return c === asCategoryKey(activeCategory);
          return (byCategory.get(c)?.length ?? 0) > 0;
        });
        const isEmptyRoom = shelves.length === 0;
        return (
          <section key={room} aria-labelledby={`room-${room}`}>
            <h3
              id={`room-${room}`}
              className="sticky top-[3.25rem] z-10 -mx-4 mb-1 bg-background/85 px-4 py-1.5 text-[13px] font-semibold tracking-[0.04em] text-muted-foreground backdrop-blur-sm"
            >
              {t(`room.${room}`)}
            </h3>

            {isEmptyRoom ? (
              <p className="px-1 py-3 text-xs text-muted-foreground">{t("dex.roomEmpty")}</p>
            ) : (
              <div className="space-y-6">
                {shelves.map((cat) => {
                  const items = byCategory.get(cat) ?? [];
                  const landing = items.some((s) => s.id === justCaught);
                  // 1棚をN個ずつの段に割る。段ごとに棚板と題名を持つ。
                  const tiers: StickerWithWord[][] = [];
                  for (let i = 0; i < items.length; i += perShelf) {
                    tiers.push(items.slice(i, i + perShelf));
                  }
                  return (
                    <div key={cat} className={landing ? "shelf-tilt" : undefined}>
                      {/* 棚の名前は段より上。段が複数あっても名前は1つ。 */}
                      <div className="mb-1.5 flex items-baseline gap-1.5 px-0.5">
                        <span aria-hidden className="text-sm leading-none">
                          {categoryEmoji(cat)}
                        </span>
                        <span className="text-[13px] font-semibold">{t(`cat.${cat}`)}</span>
                        <span className="text-[11px] text-muted-foreground">{items.length}</span>
                      </div>

                      {tiers.map((tier, ti) => (
                        <div key={ti} className={ti > 0 ? "mt-3" : undefined}>
                          <div
                            className="shelf-row"
                            style={{ gridTemplateColumns: `repeat(${perShelf}, minmax(0, 1fr))` }}
                          >
                            {tier.map((s) => (
                              <ShelfItem
                                key={s.id}
                                sticker={s}
                                onOpen={onOpen}
                                landing={s.id === justCaught}
                              />
                            ))}
                          </div>
                          {/* 棚板 — 板ではなく線 */}
                          <div className="shelf-rule" aria-hidden />
                          {/* 題名は棚板の下、モノと同じ列で揃える */}
                          <div
                            className="grid gap-3 pt-1.5"
                            style={{ gridTemplateColumns: `repeat(${perShelf}, minmax(0, 1fr))` }}
                          >
                            {tier.map((s) => (
                              <span
                                key={s.id}
                                lang="zh-Hant"
                                className="truncate text-center text-[12px] font-medium leading-tight"
                              >
                                {s.word.headword}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** 棚に立っている1つ。 */
function ShelfItem({
  sticker: s,
  onOpen,
  landing,
}: {
  sticker: StickerWithWord;
  onOpen: (id: string) => void;
  landing: boolean;
}) {
  const t = useT();
  // 棚に「立てる」のは切り抜き。切り抜きが無い行(古い行・文字/音声キャッチ・
  // スキャン経由)は素の写真を小さな額に入れて置く。
  const cutout = s.cutout_thumb_url ?? s.cutout_url;
  const photo = s.object_thumb_url ?? s.object_url ?? s.placeholder_url;

  return (
    <button
      id={`dex-cell-${s.id}`}
      onClick={() => onOpen(s.id)}
      className={`shelf-item ${landing ? "slam-in slot-ignite" : ""}`}
      aria-label={s.word.headword}
      title={s.word.headword}
    >
      {cutout ? (
        <CachedImg
          src={cutout}
          alt={t("common.photoOf", { word: s.word.headword })}
          loading="lazy"
          decoding="async"
          className="shelf-stand"
        />
      ) : photo ? (
        <CachedImg
          src={photo}
          alt={t("common.photoOf", { word: s.word.headword })}
          loading="lazy"
          decoding="async"
          className="shelf-stand shelf-framed"
        />
      ) : (
        // 画像がまだ無いカードは、単語そのものを立てる。
        <span
          lang="zh-Hant"
          className="shelf-fallback shelf-framed grid h-12 place-items-center bg-secondary px-1 text-center text-sm font-semibold text-muted-foreground"
        >
          {s.word.headword}
        </span>
      )}
    </button>
  );
}
