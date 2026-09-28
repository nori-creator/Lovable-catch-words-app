import { useState, type CSSProperties } from "react";
import { WordCandidateRow } from "@/components/WordCandidateRow";
import { PronounceButton } from "@/components/PronounceButton";
import { Term } from "@/components/Term";
import { photo } from "./peel-sticker";
import { readySpeech } from "../speech";

/**
 * **単語の候補のデザイン案**（オーナー指示 2026-09-27「単語の候補の UI の案を
 * 複数出して」）。
 *
 * 並びは4案とも同じで、この回で AI に入れた順（`candidate-order.ts`）:
 *   ふだんの呼び方 → 具体的な名前 → 固有名詞。
 * 柚子の写真なら「柚子」が上、「文旦」は下に残す。岩なら「奇岩」が上、
 * 「女王頭」は固有名詞なので一番下。**下にあっても消さない**。
 */
type Cand = {
  headword: string;
  zhuyin: string;
  pinyin: string;
  meaning: string;
  distinction?: string;
  register: "common" | "specific" | "proper";
};

const SETS: Record<"fruit" | "rock", { label: string; items: Cand[] }> = {
  fruit: {
    label: "柚子の写真",
    items: [
      {
        headword: "柚子",
        zhuyin: "ㄧㄡˋ ㄗ˙",
        pinyin: "yòu zi",
        meaning: "ぶんたん・ザボン",
        register: "common",
      },
      {
        headword: "文旦",
        zhuyin: "ㄨㄣˊ ㄉㄢˋ",
        pinyin: "wén dàn",
        meaning: "文旦（品種名）",
        distinction: "中秋節の贈り物の箱に書かれる名前",
        register: "specific",
      },
      {
        headword: "麻豆文旦",
        zhuyin: "ㄇㄚˊ ㄉㄡˋ ㄨㄣˊ ㄉㄢˋ",
        pinyin: "má dòu wén dàn",
        meaning: "麻豆産の文旦",
        register: "proper",
      },
    ],
  },
  rock: {
    label: "海辺の岩の写真",
    items: [
      {
        headword: "奇岩",
        zhuyin: "ㄑㄧˊ ㄧㄢˊ",
        pinyin: "qí yán",
        meaning: "変わった形の岩",
        register: "common",
      },
      {
        headword: "蕈狀岩",
        zhuyin: "ㄒㄩㄣˋ ㄓㄨㄤˋ ㄧㄢˊ",
        pinyin: "xùn zhuàng yán",
        meaning: "きのこ岩",
        distinction: "地形の説明板で見る言い方",
        register: "specific",
      },
      {
        headword: "女王頭",
        zhuyin: "ㄋㄩˇ ㄨㄤˊ ㄊㄡˊ",
        pinyin: "nǚ wáng tóu",
        meaning: "女王頭（野柳の岩）",
        register: "proper",
      },
    ],
  },
};

const VARIANTS = [
  { key: "a", label: "A 今の形" },
  { key: "b", label: "B 写真つきカード" },
  { key: "c", label: "C 1番を大きく" },
  { key: "d", label: "D 札を並べる" },
] as const;
type Key = (typeof VARIANTS)[number]["key"];

const REGISTER_LABEL: Record<Cand["register"], string> = {
  common: "ふだんの言い方",
  specific: "くわしい名前",
  proper: "固有名詞",
};

function Tag({ r }: { r: Cand["register"] }) {
  return (
    <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-caption text-muted-foreground">
      {REGISTER_LABEL[r]}
    </span>
  );
}

const pill = (on: boolean): CSSProperties => ({
  flex: "0 0 auto",
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: on ? "var(--primary)" : "var(--card)",
  color: on ? "var(--primary-foreground)" : "var(--foreground)",
  fontWeight: 600,
});

function List({ v, items, onPick }: { v: Key; items: Cand[]; onPick: (w: string) => void }) {
  if (v === "a")
    return (
      <ul className="space-y-2">
        {items.map((c) => (
          <li key={c.headword}>
            <WordCandidateRow {...c} onPick={() => onPick(c.headword)} />
          </li>
        ))}
      </ul>
    );

  if (v === "b")
    // 撮った写真の切り抜きを左に。どの候補も「この写真の物」だと一目で分かる。
    return (
      <ul className="space-y-2">
        {items.map((c) => (
          <li
            key={c.headword}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2 pr-3"
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              onClick={() => onPick(c.headword)}
            >
              <img src={photo} alt="" className="h-16 w-16 flex-none rounded-xl object-cover" />
              <span className="min-w-0 flex-1">
                <Term className="block text-title font-medium leading-tight">{c.headword}</Term>
                <span className="block text-footnote text-muted-foreground">
                  {c.zhuyin} · {c.meaning}
                </span>
                <span className="mt-1 block">
                  <Tag r={c.register} />
                </span>
              </span>
            </button>
            <PronounceButton text={c.headword} tone="hero" />
          </li>
        ))}
      </ul>
    );

  if (v === "c") {
    // いちばん使う言い方を大きく1つ。残りは「ほかの言い方」として小さく。
    const [first, ...rest] = items;
    return (
      <div className="space-y-3">
        <div className="rounded-3xl border border-border bg-card p-4">
          <p className="text-caption font-semibold text-muted-foreground">いちばん使う言い方</p>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => onPick(first.headword)}
            >
              <Term className="block text-hero font-medium leading-tight">{first.headword}</Term>
              <span className="block text-body text-muted-foreground">
                {first.zhuyin} · {first.meaning}
              </span>
            </button>
            <PronounceButton text={first.headword} tone="hero" />
          </div>
          <button
            type="button"
            className="mt-3 min-h-11 w-full rounded-full bg-primary text-body font-semibold text-primary-foreground"
            onClick={() => onPick(first.headword)}
          >
            この語で図鑑に入れる
          </button>
        </div>
        <p className="px-1 text-caption font-semibold text-muted-foreground">ほかの言い方</p>
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {rest.map((c) => (
            <li key={c.headword} className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                className="flex min-h-11 min-w-0 flex-1 items-baseline gap-2 text-left"
                onClick={() => onPick(c.headword)}
              >
                <Term className="text-headline font-medium">{c.headword}</Term>
                <span className="truncate text-footnote text-muted-foreground">{c.meaning}</span>
              </button>
              <Tag r={c.register} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // D: 札を並べ、押した1つの詳しい中身を下に出す。
  return <Chips items={items} onPick={onPick} />;
}

function Chips({ items, onPick }: { items: Cand[]; onPick: (w: string) => void }) {
  const [sel, setSel] = useState(items[0]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {items.map((c) => (
          <button
            key={c.headword}
            type="button"
            aria-pressed={sel.headword === c.headword}
            onClick={() => setSel(c)}
            className={`min-h-11 rounded-full border px-4 text-headline font-medium ${
              sel.headword === c.headword
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card"
            }`}
          >
            <Term>{c.headword}</Term>
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <Term className="block text-title font-medium">{sel.headword}</Term>
            <span className="block text-footnote text-muted-foreground">
              {sel.zhuyin} · {sel.pinyin}
            </span>
          </div>
          <PronounceButton text={sel.headword} tone="hero" />
        </div>
        <p className="mt-2 text-body">{sel.meaning}</p>
        {sel.distinction && (
          <p className="mt-1 text-footnote text-primary-ink">{sel.distinction}</p>
        )}
        <div className="mt-2">
          <Tag r={sel.register} />
        </div>
        <button
          type="button"
          className="mt-3 min-h-11 w-full rounded-full bg-primary text-body font-semibold text-primary-foreground"
          onClick={() => onPick(sel.headword)}
        >
          この語で図鑑に入れる
        </button>
      </div>
    </div>
  );
}

export function CandidateDesignsScene({ q }: { q: URLSearchParams }) {
  const [v, setV] = useState<Key>(VARIANTS.find((o) => o.key === q.get("v"))?.key ?? "a");
  const [set, setSet] = useState<"fruit" | "rock">(q.get("set") === "rock" ? "rock" : "fruit");
  const [picked, setPicked] = useState<string | null>(null);
  const items = SETS[set].items;
  readySpeech(items.map((c) => c.headword));
  return (
    <div className="space-y-3 pb-28">
      <div role="radiogroup" aria-label="候補の案" className="flex flex-wrap gap-1.5">
        {VARIANTS.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={v === o.key}
            onClick={() => setV(o.key)}
            style={pill(v === o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="例の写真" className="flex gap-1.5">
        {(Object.keys(SETS) as Array<keyof typeof SETS>).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={set === k}
            onClick={() => setSet(k)}
            style={pill(set === k)}
          >
            {SETS[k].label}
          </button>
        ))}
      </div>
      <List key={`${v}-${set}`} v={v} items={items} onPick={setPicked} />
      {picked && (
        <p role="status" className="text-footnote text-muted-foreground">
          選んだ語: {picked}
        </p>
      )}
      <p className="text-caption leading-relaxed text-muted-foreground">
        並びは4案とも同じ: ふだんの言い方 → くわしい名前 →
        固有名詞。固有名詞も消さずに下に残します。B の写真は見本です（本番は撮った写真の切り抜き）。
      </p>
    </div>
  );
}
