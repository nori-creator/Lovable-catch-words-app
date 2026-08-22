import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { FilterOption } from "@/lib/dex-filter";
import { MENU_EDGE_MARGIN, pickMenuSide, type MenuSide } from "@/lib/menu-align";

/**
 * 「ボタンを押したら選択肢が出てくる」絞り込み。
 *
 * オーナー指摘 2026-08-21:
 * > 「図鑑のカテゴリーや日付の選択は、**選択肢をすべて表示するのではなく、
 * >  ボタンを押したら選択肢が出てきて選べる**ようにして。」
 *
 * ## 出来合いの部品を使わない
 * `src/components/ui/` に Radix の `popover` / `dropdown-menu` が置いて
 * あるが、**この app では1箇所も使っていない**(あるのは shadcn を入れた
 * ときの置き土産)。あれは中身を `<body>` の直下へ飛ばすので、
 * 検査の足場(`ui:audit`)からは**開いた絵が撮れない**。この app は
 * 「検査が通ったのに絵で見つけた不具合」を何度も踏んでいるので、
 * **撮れないものは作らない**。ここは素の相対配置で組む。
 *
 * ## 閉じ方を3つ用意する
 * 外を押す・Escape・もう一度ボタンを押す。1つでも欠けると、
 * 選び終わったのに閉じられない画面ができる。
 */
/** 札の幅(px)。揃える側を測るのに使うので、CSS と同じ数をここに置く。 */
const MENU_WIDTH = 224;

export function FilterMenu({
  /** 何を選ぶボタンか(「カテゴリー」「日付」)。 */
  name,
  /** いま選んでいる鍵。`null` は「すべて」。 */
  value,
  options,
  /** 「すべて」の行に出す言葉。 */
  allLabel,
  /** 鍵から画面に出す言葉を作る(絵文字も呼ぶ側が決める)。 */
  labelOf,
  onChange,
}: {
  name: string;
  value: string | null;
  options: readonly FilterOption[];
  allLabel: string;
  labelOf: (key: string) => string;
  onChange: (key: string | null) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const listId = useId();
  /**
   * 札をボタンのどちら側に揃えるか。
   *
   * **決め打ちにできない。** 右揃えで作ったら、行の左端にあるボタンで
   * 札が画面の左へはみ出して切れた。`position:absolute` は横スクロールを
   * 作らずに**ただ切れる**ので、数の検査では気づけない(絵で見つけた)。
   * 判断は `menu-align.ts` が持つ。
   */
  const [side, setSide] = useState<MenuSide>("left");

  // 外を押す / Escape で閉じる。**開いている間だけ**聞く。
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 開く直前にボタンの位置を測って側を決める。**描く前に**決めないと、
  // 一瞬だけ反対側に出てから飛ぶ。
  useLayoutEffect(() => {
    if (!open) return;
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    setSide(
      pickMenuSide({
        left: b.left,
        right: b.right,
        width: MENU_WIDTH,
        viewport: window.innerWidth,
      }),
    );
  }, [open]);

  // 選択肢が空(=絞る物が無い)ならボタンごと出さない。
  if (options.length === 0) return null;

  const chosen = value != null;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-label={t("dex.filterOpen", { name })}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-footnote font-medium transition ${
          chosen
            ? "bg-primary text-primary-foreground shadow-sm"
            : "bg-secondary text-muted-foreground"
        }`}
      >
        {/* 選んでいるときは**選んだ物の名前**を出す。ボタンの名前のままだと
            「絞り込み中かどうか」が色だけになり、色の差が読めない人には
            何も伝わらない。 */}
        <span className="max-w-[9rem] truncate">{chosen ? labelOf(value) : name}</span>
        <ChevronDown aria-hidden className={`h-3.5 w-3.5 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={name}
          // 揃える側は測って決める(上の `side`)。幅は画面より広くしない。
          className={`absolute z-50 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-border bg-card p-1 shadow-xl ${
            side === "right" ? "right-0" : "left-0"
          }`}
          style={{ width: MENU_WIDTH, maxWidth: `calc(100vw - ${MENU_EDGE_MARGIN * 2}px)` }}
        >
          <Row
            label={allLabel}
            selected={value === null}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          />
          {options.map((o) => (
            <Row
              key={o.key}
              label={labelOf(o.key)}
              count={o.count}
              selected={value === o.key}
              onClick={() => {
                onChange(o.key);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-footnote transition ${
        selected ? "bg-secondary font-semibold text-foreground" : "text-foreground"
      }`}
    >
      {/* 印は**場所を空けたまま**にする。選ぶたび行が左右に動かない。 */}
      <Check
        aria-hidden
        className={`h-4 w-4 shrink-0 ${selected ? "text-primary" : "text-transparent"}`}
      />
      <span className="flex-1 truncate">{label}</span>
      {count != null && (
        <span className="shrink-0 text-caption text-muted-foreground">{count}</span>
      )}
    </button>
  );
}
