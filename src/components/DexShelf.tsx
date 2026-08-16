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
import { spineColor, type ShelfDensity, type ShelfMaterial } from "@/lib/shelf-prefs";

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
  /** 1段に並べる数。密度切替でここが変わる。 */
  perShelf?: number;
  /** 棚板の素材。`none` なら線1本のまま。 */
  material?: ShelfMaterial;
  /** 並べ方。`spines` のときだけモノではなく背表紙を並べる。 */
  density?: ShelfDensity;
};

/**
 * 棚1つのおおよその高さ(px)。`contain-intrinsic-size` に渡す。
 *
 * 見積もりであって正確な値ではない。ここが要るのは、画面外の棚を描かない
 * 代わりに「そこにどれだけの高さがあるか」を先に伝えるため — 伝えないと
 * 画面外の棚が高さ0に潰れ、スクロールバーが伸び縮みして掴めなくなる。
 *
 * ## 数値はビルド済みCSSでの実測値(390px幅)
 *
 * | | 段1 | 段2 | 段3 | 空 |
 * |---|---|---|---|---|
 * | モノ・素材なし | 125 | 236 | 347 | 58 |
 * | 背表紙・素材なし | 104 | 194 | 284 | 52 |
 * | モノ・板あり | 134 | 254 | 374 | 67 |
 * | 背表紙・板あり | 113 | 212 | 311 | — |
 *
 * → 見出し14px + 段(モノ111 / 背表紙90)、板を敷くと段ごとに +9px。
 *
 * **空の棚を「段1つ分」で数えないこと。** 最初そうしていて 149px と
 * 見積もっていたが実測は 58px。棚は54個を常に全部描くので、まだ何も
 * 集めていない人ほどずれが積み上がり、**文書が4000px以上長く見積もられて
 * スクロールしながら縮んでいく**(掴んだスクロールバーが逃げる)。
 *
 * 段の作りを変えたら測り直すこと。`npm run shelf:perf` が全変種の
 * ずれを見て5%を超えたら落とす。
 */
function estimateShelfHeight(tiers: number, spines: boolean, thickPlank: boolean): number {
  const HEAD = 14;
  const plank = thickPlank ? 9 : 0;
  // 空の棚の枝は消した。**持っている棚しか描かないので届かない。**
  // 到達しない分岐を残すと、次に数字を直す人がそこも合わせようとする。
  return HEAD + tiers * ((spines ? 90 : 111) + plank);
}

export function DexShelf({
  stickers,
  activeCategory,
  onOpen,
  justCaught,
  perShelf = 3,
  material = "none",
  density = "three",
}: Props) {
  const t = useT();
  const spines = density === "spines";

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

  /**
   * **持っている棚だけを描く。**
   *
   * ## なぜ変えたか
   * もとは 54 棚を常に全部出していた。単語が毎回同じ場所に居ることを
   * 記憶の手がかりにする、という狙いのためで、**その狙いは変えていない** —
   * 並び順は正規の順のままなので、持っている棚の相対位置は永久に動かない。
   *
   * 変えたのは「まだ持っていない棚」を出すのをやめたこと。独立監査に
   * 「図鑑の主役が『空いている棚 N』の反復になっている(画面の約6割)」と
   * 指摘され、実際に初期状態を描いて見たらそのとおりだった。
   * **同じ場所に在るという効用は、その場所に辿り着けて初めて発生する。**
   *
   * これで棚は「AIが語を分類した瞬間に生える」ものになる。最初の1語で
   * 棚が1つでき、集めるほど部屋が増える。空きを見せて動機づける代わりに、
   * **増えていくこと自体**が動機になる。
   */
  const roomShelves = useMemo(() => {
    const wanted = activeCategory ? asCategoryKey(activeCategory) : null;
    return rooms
      .map((room) => ({
        room,
        // 並べ替えない。正規の順から、中身のあるものだけを残す。
        shelves: ROOM_CATEGORIES[room].filter(
          (c) => (wanted ? c === wanted : true) && (byCategory.get(c)?.length ?? 0) > 0,
        ),
      }))
      .filter((r) => r.shelves.length > 0);
  }, [rooms, activeCategory, byCategory]);

  return (
    <div className="space-y-8" data-shelf-material={material}>
      {roomShelves.map(({ room, shelves }) => {
        return (
          <section key={room} aria-labelledby={`room-${room}`}>
            <h3
              id={`room-${room}`}
              // 上のバーの高さは env(safe-area-inset-top) の分だけ伸びる。
              // 決め打ちだと、ノッチのある端末で見出しがヘッダーの裏に隠れる。
              // 高さそのものも決め打ちにしない — `--app-header-h` から取る。
              // **親のほうを強くする。** 部屋(食べる)13px グレー中太に対し、
              // 棚(🍎 果物)は 13px 黒太字 + 絵文字で、**子のほうが重かった**
              // (独立監査「見出しの階層が逆転している」)。
              className="room-head sticky top-[calc(var(--app-header-h)+env(safe-area-inset-top))] z-10 -mx-4 mb-1.5 bg-background/85 px-4 py-1.5 text-[1.0625rem] font-semibold tracking-tight text-foreground backdrop-blur-sm"
            >
              {t(`room.${room}`)}
            </h3>

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
                            containIntrinsicSize: `auto ${estimateShelfHeight(
                              tiers.length,
                              spines,
                              material !== "none",
                            )}px`,
                          }
                    }
                  >
                    {/* 棚の名前は段より上。段が複数あっても名前は1つ。
                        h4 なのは、部屋(h3)の下という構造を読み上げにも残すため
                        (以前は div で、見出しの階層から棚が消えていた)。 */}
                    <h4 className="mb-1.5 flex items-baseline gap-1.5 px-0.5">
                      <span aria-hidden className="text-sm leading-none">
                        {categoryEmoji(cat)}
                      </span>
                      <span className="text-[0.8125rem] font-medium text-muted-foreground">
                        {t(`cat.${cat}`)}
                      </span>
                      <span // `/80` を掛けたら 3.74:1 まで落ちた(検査が即座に落とした)。
                        // 件数は小さいので、薄さを重ねる余地が無い。
                        className="ml-0.5 text-[0.6875rem] font-normal tabular-nums text-muted-foreground"
                      >
                        {t("dex.shelfCount", { n: String(items.length) })}
                      </span>
                    </h4>

                    {tiers.map((tier, ti) => (
                      <div key={ti} className={ti > 0 ? "mt-3" : undefined}>
                        <div
                          // 背表紙は隙間なく並べる。本は隣とくっついて立っている。
                          className={`shelf-row ${spines ? "shelf-row-tight" : ""}`}
                          style={{ gridTemplateColumns: `repeat(${perShelf}, minmax(0, 1fr))` }}
                        >
                          {tier.map((s) => (
                            <ShelfItem
                              key={s.id}
                              sticker={s}
                              onOpen={onOpen}
                              landing={s.id === justCaught}
                              spine={spines}
                            />
                          ))}
                        </div>
                        {/* 棚板 — 板ではなく線 */}
                        <div className="shelf-rule" aria-hidden />
                        {/* 題名は棚板の下、モノと同じ列で揃える。
                            読み上げには要らない — ボタンが同じ語を名前として
                            持っているので、ここを読むと全部2回聞こえる。
                            背表紙のときは語が背に書いてあるので出さない
                            (8列の下に語を並べても潰れて読めない)。 */}
                        {!spines && (
                          <div
                            aria-hidden
                            className="grid gap-3 pt-1.5"
                            style={{ gridTemplateColumns: `repeat(${perShelf}, minmax(0, 1fr))` }}
                          >
                            {tier.map((s) => (
                              <span
                                key={s.id}
                                lang="zh-Hant"
                                // 名前は**絵の左端に揃える**。絵を左詰めにしたのに名前だけ
                                // マスの中央のままだったので、絵の右にずれて見えていた。
                                className="truncate text-left text-xs font-medium leading-tight"
                              >
                                {s.word.headword}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
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
  spine = false,
}: {
  sticker: StickerWithWord;
  onOpen: (id: string) => void;
  landing: boolean;
  /** 背表紙として並べるか(密度 `spines`)。 */
  spine?: boolean;
}) {
  // 棚に「立てる」のは切り抜き。切り抜きが無い行(古い行・文字/音声キャッチ・
  // スキャン経由)は素の写真を小さな額に入れて置く。
  const cutout = s.cutout_thumb_url ?? s.cutout_url;
  const photo = s.object_thumb_url ?? s.object_url ?? s.placeholder_url;

  // 背表紙は写真を出さない見え方。並べたときの一覧性がいちばん高い代わりに、
  // 「自分が撮った写真」という、このアプリの芯にあるものが見えなくなる。
  // だから既定にはしない。
  if (spine) {
    return (
      <button
        id={`dex-cell-${s.id}`}
        onClick={() => onOpen(s.id)}
        className={`shelf-item ${landing ? "slam-in slot-ignite" : ""}`}
        lang="zh-Hant"
        aria-label={s.word.headword}
      >
        {/* 再会の回数は背表紙でも消さない。**このアプリの芯にある印**で、
            以前ギャラリーには出ていたのに棚では消えていて直したところ。
            見え方を1つ足すたびに落とすようでは意味がない。 */}
        {s.encounter_count > 1 && (
          <span
            aria-hidden
            className="absolute right-0 top-0 z-10 rounded-full bg-warn px-1 text-[0.625rem] font-bold leading-[1.4] text-background shadow"
          >
            ×{s.encounter_count}
          </span>
        )}
        <span className="shelf-spine" style={{ backgroundColor: spineColor(s.word.headword) }}>
          <span className="text-white">{s.word.headword}</span>
        </span>
      </button>
    );
  }

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
      {/* **印は絵に付ける。** 以前はセル(grid の1マス)の右上に置いていたので、
          絵より広いマスの端に**単独で浮いて**いた(2列のときは絵から
          本1冊ぶん離れる)。絵を包む箱を基準にする。 */}
      <span className="relative inline-flex">
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
        {/* 再会の回数。ギャラリーには出ていたのに棚では消えていた —
            何度も出会った語ほど覚える、というこのアプリの芯にある印。 */}
        {s.encounter_count > 1 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 rounded-full bg-warn px-1 text-[0.625rem] font-bold leading-[1.4] text-background shadow"
          >
            ×{s.encounter_count}
          </span>
        )}
      </span>
    </button>
  );
}
