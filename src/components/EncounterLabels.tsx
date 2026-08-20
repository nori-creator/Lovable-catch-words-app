import { useT } from "@/lib/i18n";
import type { WordExtrasDTO } from "@/lib/extras";

/**
 * 「この語に、どこで・いつ・どんな気持ちのときに出会うか」の札。
 *
 * オーナー指摘(2026-08-20):
 * > 「頻度、使う場面の欄は、この単語に遭遇する確率が高い場所、状況、感情、
 * >  時刻、媒体、季節をラベルとして囲って複数挙げて。スーパー、ニュース、
 * >  看板、メニュー、道、駅、誕生日、夜、春みたいに」
 *
 * ## `scene_weights` とは別物
 * `scene_weights`(部屋8つの分布)は**数式のための材料**で、
 * 「出会う見込み」を計算するのに使う。人に読ませる言葉ではない。
 * こちらは読む側の札で、**具体名だけ**を並べる。
 *
 * ## 種類ごとに色を分ける
 * 「夜市」と「うれしい時」と「春」が同じ顔で並ぶと、何の一覧か分からない。
 * 印(絵文字)と色の**両方**で分ける — 色だけに頼らないのはこのアプリの決まり。
 *
 * 通信も状態も持たない。検査の雛形から本物の見た目をそのまま撮れる。
 */

type Label = NonNullable<WordExtrasDTO["encounter_labels"]>[number];
type Kind = Label["kind"];

/** 種類ごとの印と色。**並び順もここで決める** — 場所から時へ、と読ませる。 */
const KINDS: ReadonlyArray<{ kind: Kind; mark: string; chip: string }> = [
  { kind: "place", mark: "📍", chip: "bg-primary/10 text-primary-ink ring-primary/20" },
  { kind: "media", mark: "📰", chip: "bg-secondary text-foreground ring-border" },
  { kind: "situation", mark: "🗣", chip: "bg-secondary text-foreground ring-border" },
  { kind: "emotion", mark: "💭", chip: "bg-warn/15 text-warn-ink ring-warn/25" },
  { kind: "time", mark: "🕒", chip: "bg-secondary text-foreground ring-border" },
  { kind: "season", mark: "🌱", chip: "bg-ok/12 text-ok-ink ring-ok/25" },
];

export function EncounterLabels({ labels }: { labels: readonly Label[] }) {
  const t = useT();
  // **空の見出しを作らない。** 札が1つも無ければ、この区画ごと出さない。
  const clean = labels.map((l) => ({ ...l, label: (l.label ?? "").trim() })).filter((l) => l.label);
  if (clean.length === 0) return null;

  // 種類の順に並べ替える。**同じ種類が散らばらない**ようにするだけで、
  // 中の順は生成された順のまま(モデルが確からしい順に返している)。
  const order = new Map(KINDS.map((k, i) => [k.kind, i]));
  const sorted = [...clean].sort((a, b) => (order.get(a.kind) ?? 99) - (order.get(b.kind) ?? 99));
  const styleOf = (k: Kind) => KINDS.find((x) => x.kind === k) ?? KINDS[0];

  return (
    <div>
      <p className="mb-1 text-caption text-muted-foreground">{t("card.encounterLabels")}</p>
      <ul className="flex flex-wrap gap-1.5">
        {sorted.map((l, i) => {
          const s = styleOf(l.kind);
          return (
            <li
              key={`${l.kind}-${l.label}-${i}`}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium ring-1 ${s.chip}`}
            >
              {/* 印は飾りなので読み上げから外す。名前は種類ごとの言葉で添える。 */}
              <span aria-hidden>{s.mark}</span>
              <span className="sr-only">{t(`card.encKind.${l.kind}`)}: </span>
              {l.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
