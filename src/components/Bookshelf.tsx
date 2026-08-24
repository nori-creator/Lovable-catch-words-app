import { useT } from "@/lib/i18n";
import { Zh } from "@/components/Zh";
import {
  SPINE_CHAR_HEIGHT,
  SPINE_MAX_HEIGHT,
  spineHeight,
  spineInkVar,
  spineChars,
  spineLabel,
  spineTone,
  spineToneVar,
  spineWidth,
} from "@/lib/book-spine";

/**
 * **本物の本棚**。背表紙が立ち、題が縦に読める。
 *
 * オーナー指摘 2026-08-21:
 * > 「復習の単語帳の復習は上部に**リアルな本の本棚**を作って、
 * >  **背表紙のタイトルが見える**ようにし、いろんな単語帳を選択できる
 * >  ようにして。」
 *
 * ホーム側にも同じ注文がある(「壁紙を変更するところを本物の本の背表紙の
 * 本棚にして」)ので、**どちらからも呼べる形**にしてある。棚に何を並べるかは
 * 呼ぶ側が決め、ここは「棚らしく見せる」ことだけを持つ。
 *
 * ## 題は1文字ずつ積む
 * 背表紙の題は縦。ただし `writing-mode: vertical-rl` は**使わない** —
 * 載っている書体に縦組みの送り幅が無く、漢字が同じ点に重なって潰れた
 * (「旅」1文字の高さが 0px で返る)。書体に頼らず自分で積む。
 * 詳しくは `book-spine.ts` の `spineChars`。
 *
 * ## 選んだ本は手前に出る
 * 色を変えるだけだと、棚の中では隣の背表紙に紛れる。**少し引き出して**
 * 前に倒す — 本棚で1冊を選ぶときに手がすることと同じ動きにする。
 *
 * 通信も状態も持たない。検査の雛形から本物の見た目をそのまま撮れる。
 */
export type ShelfBook = {
  id: string;
  title: string;
  /** 背表紙の下に小さく出す一言(「12」など)。無ければ出さない。 */
  note?: string;
};

export function Bookshelf({
  books,
  selectedId,
  onSelect,
  label,
}: {
  books: readonly ShelfBook[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  /** 読み上げ用の棚の名前。 */
  label?: string;
}) {
  const t = useT();
  if (books.length === 0) return null;
  return (
    <div
      role="listbox"
      aria-label={label ?? t("shelf.books")}
      // 棚は**横に流す**。冊数は増える一方なので、詰め込んで小さくすると
      // 題が読めなくなる(背表紙の値打ちは題が読めることにある)。
      className="-mx-4 overflow-x-auto px-4 pb-1"
    >
      <div
        // **棚板は行いっぱいに伸ばす。** 本の幅ぴったりに縮めると、
        // 3冊のときに小さな箱が浮いているだけの絵になった(絵で見つけた)。
        className="relative flex w-max min-w-full items-end gap-1 rounded-2xl px-3 pt-3"
        style={{
          // 木の面はトークンから。素の16進を書かない。
          background: `linear-gradient(180deg, var(--shelf-back), var(--shelf-board))`,
          // 棚板の厚み。本の足元に影が落ちて、乗っているように見える。
          paddingBottom: "10px",
          boxShadow: "inset 0 -10px 12px -10px rgb(0 0 0 / 0.55)",
          minHeight: SPINE_MAX_HEIGHT + 26,
        }}
      >
        {books.map((b) => (
          <Spine
            key={b.id}
            book={b}
            selected={selectedId === b.id}
            onSelect={() => onSelect(b.id)}
          />
        ))}
      </div>
    </div>
  );
}

function Spine({
  book,
  selected,
  onSelect,
}: {
  book: ShelfBook;
  selected: boolean;
  onSelect: () => void;
}) {
  const tone = spineTone(book.title);
  const h = spineHeight(book.title);
  const w = spineWidth(book.title);
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      title={book.title}
      // 読み上げは**題を丸ごと**言う。積んだ1文字ずつを読ませると
      // 「た・い・わ・ん」と1字ずつ読まれて意味を成さない。
      aria-label={book.title}
      // 足場は **Tailwind の任意値ではなくインラインの `style`** で書く —
      // 検査の足場は `@source` の外なので、クラス名で寸法を作ると素の div が
      // 並ぶだけの絵になる。
      style={{
        width: `${w}px`,
        // 指で押せる大きさは背表紙そのもので足りている
        // (幅 44px 以上・高さ 148px 以上)。
        height: `${selected ? h + 12 : h}px`,
        background: spineToneVar(tone),
        color: spineInkVar(tone),
        borderRadius: "3px 3px 1px 1px",
        // 背表紙の丸み。左に光、右に影を入れて、平らな板に見せない。
        boxShadow: selected
          ? "inset 2px 0 3px rgb(255 255 255 / 0.28), inset -3px 0 5px rgb(0 0 0 / 0.35), 0 6px 10px rgb(0 0 0 / 0.35)"
          : "inset 2px 0 3px rgb(255 255 255 / 0.22), inset -3px 0 5px rgb(0 0 0 / 0.3)",
        transform: selected ? "translateY(-6px)" : undefined,
        transition: "height 160ms, transform 160ms",
        // 選んだ印は **`--primary`**。`--foreground` だと暗い棚の上で
        // 黒い箱にしか見えなかった(絵で見つけた)。
        outline: selected ? "2px solid var(--primary)" : undefined,
        outlineOffset: "2px",
      }}
      className="relative flex shrink-0 items-center justify-center"
    >
      {/* 天と地の帯。本物の背表紙にある箔押しの線。 */}
      <span
        aria-hidden
        className="absolute inset-x-1 top-2 h-px"
        style={{ background: "currentColor", opacity: 0.45 }}
      />
      <span
        aria-hidden
        className="absolute inset-x-1 bottom-2 h-px"
        style={{ background: "currentColor", opacity: 0.45 }}
      />
      {/* 題は**1文字ずつ積む**。`writing-mode` は載っている書体に縦組みの
          送り幅が無く、漢字が同じ点に重なって潰れた(絵で見つけた —
          詳しくは `book-spine.ts` の `spineChars`)。 */}
      <Zh
        aria-hidden
        className="flex max-h-full flex-col items-center overflow-hidden text-footnote font-semibold"
      >
        {spineChars(spineLabel(book.title, h)).map((ch, i) => (
          <span
            key={`${ch}-${i}`}
            style={{ height: `${SPINE_CHAR_HEIGHT}px`, lineHeight: `${SPINE_CHAR_HEIGHT}px` }}
          >
            {ch}
          </span>
        ))}
      </Zh>
      {book.note && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-3 text-center text-caption font-bold leading-none"
          style={{ opacity: 0.8 }}
        >
          {book.note}
        </span>
      )}
    </button>
  );
}
