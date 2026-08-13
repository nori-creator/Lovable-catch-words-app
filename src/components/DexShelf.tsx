import { useMemo } from "react";
import { CachedImg } from "@/lib/image-cache";
import { useT } from "@/lib/i18n";
import {
  ROOM_KEYS,
  ROOM_CATEGORIES,
  asCategoryKey,
  categoryEmoji,
  type CategoryKey,
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
 * その「同じ場所」を本当に成立させるため、**部屋も棚も常に全部描く**。
 * 中身のあるものだけ描くと、新しい語をキャッチした瞬間に上の棚が増えて、
 * 下にある語が全部ずり下がる — 集める行為そのものが記憶の手がかりを
 * 壊してしまう。空の棚は空のまま置いておく。「ここに入る」が先に見えるのは
 * 収集の動機にもなる。
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
  /** 検索で絞り込まれているか。空の棚の言い方を変えるのに使う。 */
  filtering?: boolean;
};

/**
 * 棚1つのおおよその高さ(px)。`contain-intrinsic-size` に渡す。
 *
 * 見積もりであって正確な値ではない。ここが要るのは、画面外の棚を描かない
 * 代わりに「そこにどれだけの高さがあるか」を先に伝えるため — 伝えないと
 * 画面外の棚が高さ0に潰れ、スクロールバーが伸び縮みして掴めなくなる。
 *
 * 数値はビルド済みCSSで実測した(390px幅):
 *   段が1〜4のとき 125 / 236 / 347 / 458px、空の一言でさらに +24px。
 *   → 見出し14px + 段111px/個。
 * 段の作りを変えたら測り直すこと。
 */
function estimateShelfHeight(tiers: number, bare: boolean): number {
  return 14 + tiers * 111 + (bare ? 24 : 0);
}

export function DexShelf({
  stickers,
  activeCategory,
  onOpen,
  justCaught,
  perShelf = 3,
  filtering = false,
}: Props) {
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
   * 描く部屋。**並べ替えない**。
   * 絞り込み中だけ、その棚のある部屋に寄る。
   */
  const rooms = useMemo(() => {
    if (activeCategory) {
      const room = ROOM_KEYS.find((r) =>
        ROOM_CATEGORIES[r].includes(asCategoryKey(activeCategory)),
      );
      return room ? [room] : [];
    }
    return ROOM_KEYS;
  }, [activeCategory]);

  /** 検索や絞り込みの最中か。空の棚の言い方を変えるのに使う。 */
  const narrowing = !!activeCategory || filtering;

  return (
    <div className="space-y-8">
      {rooms.map((room) => {
        // 棚も並べ替えない・間引かない。空でもその場所に在り続ける。
        const shelves = activeCategory
          ? ROOM_CATEGORIES[room].filter((c) => c === asCategoryKey(activeCategory))
          : ROOM_CATEGORIES[room];
        return (
          <section key={room} aria-labelledby={`room-${room}`}>
            <h3
              id={`room-${room}`}
              // 上のバーの高さは env(safe-area-inset-top) の分だけ伸びる。
              // 3.25rem 決め打ちだと、ノッチのある端末で見出しがヘッダーの
              // 裏に隠れて出てこない。
              className="room-head sticky top-[calc(3.25rem+env(safe-area-inset-top))] z-10 -mx-4 mb-1 bg-background/85 px-4 py-1.5 text-[13px] font-semibold tracking-[0.04em] text-muted-foreground backdrop-blur-sm"
            >
              {t(`room.${room}`)}
            </h3>

            <div className="space-y-6">
              {shelves.map((cat) => {
                const items = byCategory.get(cat) ?? [];
                const landing = items.some((s) => s.id === justCaught);
                // 1棚をN個ずつの段に割る。段ごとに棚板と題名を持つ。
                // 空でも1段は描く — その場所に棚が在ることを見せる。
                const tiers: StickerWithWord[][] = [];
                for (let i = 0; i < items.length; i += perShelf) {
                  tiers.push(items.slice(i, i + perShelf));
                }
                if (tiers.length === 0) tiers.push([]);
                const bare = items.length === 0;
                return (
                  <div
                    key={cat}
                    className={landing ? "shelf-tilt" : undefined}
                    // 画面の外にある棚は**中身を描かない**。棚は54個を常に
                    // 全部出す作りなので、持ち物が増えるほど「見えていない棚」の
                    // レイアウトに時間を使う。
                    //
                    // 高さは実測値から見積もって渡す(`auto` 付きなので、一度
                    // 描いたあとは実寸が使われる)。見積もりが無いと、画面外の
                    // 棚が高さ0に潰れてスクロールバーが暴れる。
                    //
                    // 着弾中の棚だけは外す — 描画を飛ばされた中では
                    // アニメーションが走らず、着地の見せ場が出ない。
                    style={
                      landing
                        ? undefined
                        : {
                            contentVisibility: "auto",
                            containIntrinsicSize: `auto ${estimateShelfHeight(tiers.length, bare)}px`,
                          }
                    }
                  >
                    {/* 棚の名前は段より上。段が複数あっても名前は1つ。
                        h4 なのは、部屋(h3)の下という構造を読み上げにも残すため
                        (以前は div で、見出しの階層から棚が消えていた)。 */}
                    <h4
                      className={`mb-1.5 flex items-baseline gap-1.5 px-0.5 ${bare ? "opacity-45" : ""}`}
                    >
                      <span aria-hidden className="text-sm leading-none">
                        {categoryEmoji(cat)}
                      </span>
                      <span className="text-[13px] font-semibold">{t(`cat.${cat}`)}</span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        {t("dex.shelfCount", { n: String(items.length) })}
                      </span>
                    </h4>

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
                        {/* 題名は棚板の下、モノと同じ列で揃える。
                            読み上げには要らない — ボタンが同じ語を名前として
                            持っているので、ここを読むと全部2回聞こえる。 */}
                        <div
                          aria-hidden
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

                    {bare && (
                      <p className="pt-2 text-[11px] text-muted-foreground">
                        {narrowing ? t("dex.shelfNoMatch") : t("dex.shelfEmpty")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
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
  // 棚に「立てる」のは切り抜き。切り抜きが無い行(古い行・文字/音声キャッチ・
  // スキャン経由)は素の写真を小さな額に入れて置く。
  const cutout = s.cutout_thumb_url ?? s.cutout_url;
  const photo = s.object_thumb_url ?? s.object_url ?? s.placeholder_url;

  return (
    <button
      id={`dex-cell-${s.id}`}
      onClick={() => onOpen(s.id)}
      className={`shelf-item ${landing ? "slam-in slot-ignite" : ""}`}
      // 読み上げの名前は繁体字として読ませる。lang を付けないと、日本語の
      // VoiceOver が同じ語を日本語の音で読み、すぐ下の表示名と食い違う。
      lang="zh-Hant"
      aria-label={s.word.headword}
    >
      {/* 再会の回数。ギャラリーには出ていたのに棚では消えていた —
          何度も出会った語ほど覚える、というこのアプリの芯にある印。 */}
      {s.encounter_count > 1 && (
        <span
          aria-hidden
          className="absolute right-0 top-0 rounded-full bg-amber-400/95 px-1 text-[9px] font-bold leading-[14px] text-amber-950 shadow"
        >
          ×{s.encounter_count}
        </span>
      )}
      {cutout ? (
        <CachedImg src={cutout} alt="" loading="lazy" decoding="async" className="shelf-stand" />
      ) : photo ? (
        <CachedImg
          src={photo}
          alt=""
          loading="lazy"
          decoding="async"
          className="shelf-stand shelf-framed"
        />
      ) : (
        // 画像がまだ無いカードは、単語そのものを立てる。
        <span
          aria-hidden
          className="shelf-fallback shelf-framed bg-secondary text-sm font-semibold text-muted-foreground"
        >
          {s.word.headword}
        </span>
      )}
    </button>
  );
}
