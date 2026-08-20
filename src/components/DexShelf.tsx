import { useMemo } from "react";
import { resolvePrefer, usePhotoPref } from "@/lib/photo-pref";
import { pickStickerPhoto, stickerPhotoUrl } from "@/lib/sticker-photo";
import { CachedImg } from "@/lib/image-cache";
import { useT } from "@/lib/i18n";
import { formatCount } from "@/lib/count";
import type { StickerWithWord } from "@/lib/stickers.functions";
import { buildShelfPlan, type UserShelf } from "@/lib/shelf-plan";

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
  /**
   * その人だけの棚(AI が語を分析して作ったもの)。
   * 渡さなければ今までどおり、既定の54棚だけで並ぶ。
   */
  userShelves?: readonly UserShelf[];
};

/**
 * 1段に並べる数。
 *
 * ## 見え方の選択肢をやめた
 * ここには「棚 / 書架 / 標本」の3通りがあり、板の素材・列数・モノの見せ方が
 * まとめて切り替わっていた。オーナーの指示で作り直した:
 *
 * > 違う方法を考えて。デザインやui uxを最高の品質を求めて。
 * > 私が達成したいのはapple やGoogleの公式のようなアプリのクオリティ。
 *
 * 出した答えは**着せ替えを配るのをやめること**。Apple も Google も、
 * 収集画面に「棚の素材」を選ばせない。1つに決めて、それを良くする。
 * 実際に3通りを並べて見ると答えははっきりしていた —
 * 木目は繰り返しグラデーションの安いテクスチャに見え、背表紙は
 * 濃い色のブロックが並ぶだけで本には見えず、標本は隙間だらけだった。
 * **3つの平凡より、1つの決定。**
 */
const PER_SHELF = 3;

/**
 * 棚1つのおおよその高さ(px)。`contain-intrinsic-size` に渡す。
 *
 * 見積もりであって正確な値ではない。ここが要るのは、画面外の棚を描かない
 * 代わりに「そこにどれだけの高さがあるか」を先に伝えるため — 伝えないと
 * 画面外の棚が高さ0に潰れ、スクロールバーが伸び縮みして掴めなくなる。
 *
 * ## 数値はビルド済みCSSでの実測値(390px幅、段を「箱」にしたあと)
 *
 * | 段1 | 段2 | 段3 |
 * |---|---|---|
 * | 153 | 302 | 451 |
 *
 * → 見出し 20px + 1段 133px + 段の間 16px。

 *
 * **空の棚を「段1つ分」で数えないこと。** 最初そうしていて 149px と
 * 見積もっていたが実測は 58px。棚は54個を常に全部描くので、まだ何も
 * 集めていない人ほどずれが積み上がり、**文書が4000px以上長く見積もられて
 * スクロールしながら縮んでいく**(掴んだスクロールバーが逃げる)。
 *
 * 段の作りを変えたら測り直すこと。`npm run shelf:perf` が全変種の
 * ずれを見て5%を超えたら落とす。
 */
function estimateShelfHeight(tiers: number): number {
  const HEAD = 20;
  // 段を「箱」にしたので測り直した(390px幅、ビルド済みCSS):
  // 見出し 19.5px + 1段 133px、2段目以降は段の間 16px が足される。
  return HEAD + tiers * 133 + Math.max(0, tiers - 1) * 16;
}


export function DexShelf({
  stickers,
  activeCategory,
  onOpen,
  justCaught,
  userShelves = [],
}: Props) {
  const t = useT();

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
   *
   * ## 並びの決め方は `shelf-plan.ts`
   * その人だけの棚(AIが作ったもの)が混ざるので、順序の規則を画面から
   * 出して純粋な関数にした。**わざと壊して落ちるテストが書ける形**にする
   * ため — 画面の中に置くと、規則が正しいかを目でしか確かめられない。
   */
  const roomShelves = useMemo(
    () =>
      buildShelfPlan({
        items: stickers,
        userShelves,
        activeShelf: activeCategory,
        labelForCategory: (k) => t(`cat.${k}`),
        labelForRoom: (k) => t(`room.${k}`),
      }),
    [stickers, userShelves, activeCategory, t],
  );

  // 「×3」は**このアプリが勝手に決めた記号**で、どこにも説明が無かった
  // (独立監査)。かといって常設の凡例を置くと、印が1つも無い人にまで
  // 説明だけが居座る。**印が出ているときだけ**、一行だけ添える。
  const hasRepeats = useMemo(() => stickers.some((s) => s.encounter_count > 1), [stickers]);

  return (
    <div className="space-y-8">
      {hasRepeats && (
        <p className="flex items-center gap-1.5 px-0.5 text-caption text-muted-foreground">
          <span className="rounded-full bg-warn px-1 text-caption font-bold leading-[1.4] text-warn-foreground">
            ×2
          </span>
          {t("dex.metCountLegend")}
        </p>
      )}
      {roomShelves.map((room) => {
        return (
          <section key={room.key} aria-labelledby={`room-${room.key}`}>
            <h3
              id={`room-${room.key}`}
              // 上のバーの高さは env(safe-area-inset-top) の分だけ伸びる。
              // 決め打ちだと、ノッチのある端末で見出しがヘッダーの裏に隠れる。
              // 高さそのものも決め打ちにしない — `--app-header-h` から取る。
              // **親のほうを強くする。** 部屋(食べる)13px グレー中太に対し、
              // 棚(🍎 果物)は 13px 黒太字 + 絵文字で、**子のほうが重かった**
              // (独立監査「見出しの階層が逆転している」)。
              className="room-head sticky top-[calc(var(--app-header-h)+env(safe-area-inset-top))] z-10 -mx-4 mb-1.5 bg-background/85 px-4 py-1.5 text-headline font-semibold tracking-tight text-foreground backdrop-blur-sm"
            >
              {room.label}
            </h3>

            <div className="space-y-6">
              {room.shelves.map((shelf) => {
                const items = shelf.items;
                const landing = items.some((s) => s.id === justCaught);
                // 1棚をN個ずつの段に割る。段ごとに棚板と題名を持つ。
                const tiers: StickerWithWord[][] = [];
                for (let i = 0; i < items.length; i += PER_SHELF) {
                  tiers.push(items.slice(i, i + PER_SHELF));
                }
                return (
                  <div
                    key={shelf.key}
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
                            containIntrinsicSize: `auto ${estimateShelfHeight(tiers.length)}px`,
                          }
                    }
                  >
                    {/* 棚の名前は段より上。段が複数あっても名前は1つ。
                        h4 なのは、部屋(h3)の下という構造を読み上げにも残すため
                        (以前は div で、見出しの階層から棚が消えていた)。 */}
                    <h4 className="mb-1.5 flex items-baseline gap-1.5 px-0.5">
                      {/* `cat-emoji` は暗い面で彩度を落とすため(styles.css)。
                          絵文字は黒地でいちばん彩度が高くなり、集めた語より
                          先に目に入っていた。 */}
                      <span aria-hidden className="cat-emoji text-body leading-none">
                        {shelf.emoji}
                      </span>
                      <span className="text-footnote font-medium text-muted-foreground">
                        {shelf.label}
                      </span>
                      <span // `/80` を掛けたら 3.74:1 まで落ちた(検査が即座に落とした)。
                        // 件数は小さいので、薄さを重ねる余地が無い。
                        className="ml-0.5 text-caption font-normal tabular-nums text-muted-foreground"
                      >
                        {t("dex.shelfCount", { n: String(items.length) })}
                      </span>
                    </h4>

                    {tiers.map((tier, ti) => (
                      <div key={ti} className={ti > 0 ? "mt-4" : undefined}>
                        {/* 段は「箱」— 奥まった面の中にモノが立ち、
                            手前に小口のある板が来る(.shelf-bay + .shelf-rule)。 */}
                        <div className="shelf-bay">
                          <div className="shelf-row">
                            {tier.map((s) => (
                              <ShelfItem
                                key={s.id}
                                sticker={s}
                                onOpen={onOpen}
                                landing={s.id === justCaught}
                              />
                            ))}
                          </div>
                        </div>
                        {/* 棚板 — 小口のある板 */}
                        <div className="shelf-rule" aria-hidden />

                        {/* 題名は棚板の下、モノと同じ列で揃える。
                            読み上げには要らない — ボタンが同じ語を名前として
                            持っているので、ここを読むと全部2回聞こえる。 */}
                        <div aria-hidden className="shelf-row pt-1.5">
                          {tier.map((s) => (
                            <span
                              key={s.id}
                              lang="zh-Hant"
                              // 名前は**絵の左端に揃える**。絵を左詰めにしたのに名前だけ
                              // マスの中央のままだったので、絵の右にずれて見えていた。
                              className="truncate text-left text-footnote font-medium leading-tight"
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
  // 設定で主役を選んでいれば、棚の意図(切り抜きを立てる)より優先する。
  const photoPref = usePhotoPref();
  // 棚に「立てる」のは切り抜き。切り抜きが無い行(古い行・文字/音声キャッチ・
  // スキャン経由)は素の写真を小さな額に入れて置く。
  // **切り抜きが在るかどうかで置き方が変わる**ので、URLだけでなく
  // どの役が選ばれたかも見る(`sticker-photo.ts` が役を返す)。
  const picked = pickStickerPhoto(s, {
    prefer: s.hero_role ?? resolvePrefer(photoPref, "cutout"),
    thumb: true,
  });
  const cutout = picked?.role === "cutout" ? picked.url : null;
  const photo = cutout ? null : (picked?.url ?? null);

  return (
    <button
      id={`dex-cell-${s.id}`}
      onClick={() => onOpen(s.id)}
      className={`shelf-item ${landing ? "slam-in slot-ignite" : ""}`}
      // 読み上げの名前は繁体字として読ませる。lang を付けないと、日本語の
      // VoiceOver が同じ語を日本語の音で読み、すぐ下の表示名と食い違う。
      lang="zh-Hant"
      aria-label={
        s.encounter_count > 1
          ? t("dex.metCountAria", { word: s.word.headword, n: formatCount(s.encounter_count) })
          : s.word.headword
      }
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
            className="shelf-fallback shelf-framed bg-secondary text-body font-semibold text-muted-foreground"
          >
            {s.word.headword}
          </span>
        )}
        {/* 再会の回数。ギャラリーには出ていたのに棚では消えていた —
            何度も出会った語ほど覚える、というこのアプリの芯にある印。 */}
        {s.encounter_count > 1 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 rounded-full bg-warn px-1 text-caption font-bold leading-[1.4] text-warn-foreground shadow"
          >
            ×{s.encounter_count}
          </span>
        )}
      </span>
    </button>
  );
}
