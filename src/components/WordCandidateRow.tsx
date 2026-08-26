import { PronounceButton } from "@/components/PronounceButton";
import { Zh } from "@/components/Zh";
import { useT } from "@/lib/i18n";
import { usePhoneticPref, pickReading } from "@/lib/phonetic";

/**
 * 「どの語にするか」を選ぶ1行。
 *
 * ## なぜ1つに寄せたか(2026-08-20)
 * この札は2箇所にあった — 撮った写真の候補(`capture.tsx` の
 * `PickWordPanel`)と、打ち込んだ語の候補(`InputCatchSheet`)。
 * `InputCatchSheet` の注釈には**既にこう書いてあった**:
 *
 *   「撮った写真の候補と同じ形にする。片方だけ直すと、
 *     同じ役目の札が2つの見た目で残る。」
 *
 * 書いてあったのに写しのままだったので、実際に2つの見た目で残っていた —
 * 見出し語の大きさが違い(`text-body` と `text-title`)、
 * **撮った側は表記の設定(注音/拼音)を読んでいなかった**。
 * 注意書きは写しを1つにしない。だから部品にする。
 *
 * ## オーナー指定(2026-08-20)
 * 「台湾華語の文字を多くして、日本語訳は右に寄せて。
 *  デザインの青が暗い青のままだから明るい青に。
 *  デザインも淡白だから、青を使って候補の欄のデザインを工夫して。」
 *
 * - **台湾華語がこの行の主役**。いちばん大きく、いちばん強く。
 * - 訳は**右端**へ。左から順に「語 → 訳」で目が流れる。
 * - 青は**塗りとして**効かせる(左の帯・使い分けの札)。
 *   文字の青を明るくすると読めなくなるので、明るさは面で出す。
 *
 * 通信も状態も持たない。検査の雛形から本物の見た目をそのまま撮れる。
 */
export function WordCandidateRow({
  headword,
  zhuyin,
  pinyin,
  meaning,
  distinction,
  onPick,
  language,
}: {
  headword: string;
  zhuyin?: string | null;
  pinyin?: string | null;
  meaning: string;
  /** 他の候補との使い分け。**無い語のほうが多い**ので、空なら描かない。 */
  distinction?: string | null;
  onPick: () => void;
  /**
   * 読む語の学習言語。**渡さないと台湾華語として読む。**
   * 候補は学習言語の語なので、ここを落とすと英語の候補が
   * 中国語の声で読まれる(しかもその音は保存される)。
   */
  language?: string;
}) {
  const t = useT();
  const phonetic = usePhoneticPref();
  const reading = pickReading(phonetic, zhuyin ?? null, pinyin ?? null);
  return (
    <div className="lift relative flex items-center gap-2 overflow-hidden rounded-2xl border border-border bg-card pl-4 transition-colors hover:border-primary hover:bg-accent/40">
      {/* 左の青い帯。**淡白さはここで解く** — 面の青は明るいまま出せる。 */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-primary" />

      <button onClick={onPick} className="min-w-0 flex-1 py-3 text-left">
        <div className="flex items-baseline gap-3">
          {/* 主役。**縮ませない** — 長い訳に押されて語が割れるのが一番困る。 */}
          {/* **太字にしない**(オーナー指摘 2026-08-21「候補の文字太すぎる」)。
              大きさ(title=22px)だけで十分に主役になる。繁体字は画数が多いので、
              太らせると小さい画面で字が潰れる。 */}
          <Zh className="shrink-0 text-title leading-tight tracking-tight">{headword}</Zh>
          {/* 訳は右端へ。溢れるときは訳のほうを詰める。 */}
          <span className="min-w-0 flex-1 truncate text-right text-footnote text-muted-foreground">
            {meaning}
          </span>
        </div>
        {reading && <Zh className="mt-0.5 block text-footnote text-muted-foreground">{reading}</Zh>}
        {/* 使い分けは**札にする**。地の文で書くと訳と見分けが付かない。
            書かれるのは「母語では1語なのに台湾華語では割れる」語だけ
            (`ai.functions.ts` の指示)。 */}
        {distinction && (
          <span className="mt-1.5 inline-block rounded-lg bg-primary/12 px-2 py-0.5 text-footnote font-medium text-primary-ink">
            {distinction}
          </span>
        )}
      </button>

      {/* 選ぶ前に音で確かめられる。**入れ子のボタンにしない** —
          正しくない markup になり、押し分けも効かない。

          **鳴らせるようになってから出る**(オーナー指摘 2026-08-26)。
          この札が画面に出た瞬間に音を取りに行くので、人が候補を読んで
          いる数秒のあいだにそろう。押しても鳴らないボタンは出さない。 */}
      <PronounceButton text={headword} language={language} className="mr-3 self-center" />
    </div>
  );
}
