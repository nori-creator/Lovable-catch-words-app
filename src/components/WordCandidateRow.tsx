import { PronounceButton } from "@/components/PronounceButton";
import { Term } from "@/components/Term";
import { useT } from "@/lib/i18n";
import { Reading } from "@/lib/phonetic";

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
 * ## 並び(オーナー指定 2026-08-20)
 * 「台湾華語の文字を多くして、日本語訳は右に寄せて。」
 *
 * - **学習言語の語がこの行の主役**。いちばん大きい。
 * - 訳は**右端**へ。左から順に「語 → 訳」で目が流れる。
 *
 * ## 色(オーナー指示 2026-08-26)
 * 「デザインは昔の色、変更して。配置は今の真ん中のままでいい。」
 *
 * 一度は「淡白だから青を使って工夫して」に応えて左に青い帯を足したが、
 * 並べると青が3つ（帯・使い分けの札・押したときの面）になり、
 * **候補そのものより飾りが強く出る**。面は地のまま、青は押せることを
 * 示すときだけ。並びは今のまま。
 *
 * 通信も状態も持たない。検査の雛形から本物の見た目をそのまま撮れる。
 */
export function WordCandidateRow({
  headword,
  zhuyin,
  pinyin,
  ipaUs,
  ipaUk,
  meaning,
  distinction,
  onPick,
  language,
}: {
  headword: string;
  zhuyin?: string | null;
  pinyin?: string | null;
  /** 英語の読み(IPA)。学習言語が英語のときはこちらが出る。 */
  ipaUs?: string | null;
  ipaUk?: string | null;
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
  return (
    /**
     * **昔の色に戻す**(オーナー指示 2026-08-26「デザインは昔の色、変更して。
     * 配置は今の真ん中のままでいい」)。
     *
     * 2026-08-20 に「淡白だから青を使って工夫して」と言われて、左に太い青の
     * 帯を足し、使い分けの一言を青い塗りの札にした。並べると**青が3つ**
     * （帯・札・押したときの面）になり、候補そのものより飾りのほうが強く出る。
     * 面は地のまま、青は**押せることを示すときだけ**に戻す。
     *
     * 並びは変えない — 「語 → 訳 → 読み」の今の形はそのまま。
     */
    <div className="lift flex items-center gap-2 rounded-2xl border border-border bg-card p-3 transition-colors hover:border-primary hover:bg-accent/40">
      <button onClick={onPick} className="min-w-0 flex-1 text-left">
        <div className="flex items-baseline gap-3">
          {/* 主役。**縮ませない** — 長い訳に押されて語が割れるのが一番困る。 */}
          {/* **太字にしない**(オーナー指摘 2026-08-21「候補の文字太すぎる」)。
              大きさ(title=22px)だけで十分に主役になる。繁体字は画数が多いので、
              太らせると小さい画面で字が潰れる。 */}
          {/* **その語の字で組む**(オーナー報告 2026-08-26「候補の字体が変」)。
              `Zh` は `lang="zh-Hant"` を決め打ちで付ける包みなので、英語の
              候補にも中国語のフォントが当たっていた(`Term` の注)。 */}
          <Term lang={language} className="shrink-0 text-title leading-tight tracking-tight">
            {headword}
          </Term>
          {/* 訳は右端へ。溢れるときは訳のほうを詰める。 */}
          <span className="min-w-0 flex-1 truncate text-right text-footnote text-muted-foreground">
            {meaning}
          </span>
        </div>
        {/* **読みは `Reading` だけが出す**(オーナー報告 2026-08-26
            「学習言語英語のとき、注音やピンインを決して表示しないで」)。
            ここは `pickReading` を直に呼んでいて、その関数は台湾華語の
            プロフィールで決め打ち(`phonetic.tsx` の `ZH_TW_PROFILE`)。
            だから英語の候補にも注音・拼音が出ていた。
            `Reading` は学習言語の `readings` に**在る表記しか返さない**。 */}
        <Reading
          lang={language}
          zhuyin={zhuyin}
          pinyin={pinyin}
          ipaUs={ipaUs}
          ipaUk={ipaUk}
          className="mt-0.5 block text-footnote text-muted-foreground"
        />
        {/* 使い分けは**札にする**。地の文で書くと訳と見分けが付かない。
            書かれるのは「母語では1語なのに台湾華語では割れる」語だけ
            (`ai.functions.ts` の指示)。 */}
        {/* 使い分けは**地の文で、色だけ変える**（昔の形）。塗りの札にすると
            候補そのものより強く出る。太らせないのも同じ理由。 */}
        {distinction && (
          <span className="mt-0.5 block text-footnote text-primary-ink">{distinction}</span>
        )}
      </button>

      {/* 選ぶ前に音で確かめられる。**入れ子のボタンにしない** —
          正しくない markup になり、押し分けも効かない。

          **鳴らせるようになってから出る**(オーナー指摘 2026-08-26)。
          この札が画面に出た瞬間に音を取りに行くので、人が候補を読んで
          いる数秒のあいだにそろう。押しても鳴らないボタンは出さない。 */}
      <PronounceButton text={headword} language={language} className="self-center" />
    </div>
  );
}
