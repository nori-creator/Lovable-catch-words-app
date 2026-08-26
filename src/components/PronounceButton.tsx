import { useRef } from "react";
import { Volume2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { DEFAULT_TARGET_LANGUAGE } from "@/lib/target-lang";
import { usePronounce, useSpeechReady } from "@/lib/use-pronounce";

/**
 * **鳴らせるようになってから出る**発音ボタン。
 *
 * オーナー指摘 2026-08-26:
 * > 「新しく音声を生成する場合は、発音がでるようになってから
 * >  発音ボタンを表示して」
 *
 * ## なぜ「出さない」なのか
 * 押しても鳴らないボタンは、壊れているのと見分けが付かない。
 * 人は押して、待って、もう一度押す — そのあいだ何も起きないので、
 * 「このアプリは発音が鳴らない」という覚え方をする。
 * 出ていなければ、少なくとも**待たされたと感じない**。
 *
 * ## 場所は空けておく
 * ただし、出た瞬間に周りの文字がずれるのは別の不快さなので、
 * 支度中は**同じ大きさの空き**を置く。ボタンが現れても行が動かない。
 *
 * ## 端末の声しか無いときは出す
 * サーバの合成が使えない(圏外・鍵が無い)ときは `failed` になる。
 * そこで永久にボタンを消すと、端末の声で読む道まで閉じてしまう。
 * 正確さは落ちるが、**鳴らないよりは鳴るほうがいい**ので出す。
 */
export function PronounceButton({
  text,
  language = DEFAULT_TARGET_LANGUAGE,
  size = "md",
  tone = "primary",
  className = "",
  label,
  stopPropagation = false,
}: {
  text: string;
  /** 読む語の学習言語。渡さないと台湾華語として読む。 */
  language?: string;
  /** `md` = 44px(指の下限)。`sm` = 36px + 当たり判定を外に広げる。 */
  size?: "sm" | "md";
  /**
   * `hero`    … その画面でいちばん押されるもの(単語の詳細の見出し)。
   * `primary` … 主役の語(候補の札)。
   * `quiet`   … 一覧の中の脇役(関連語)。**同じ見た目にすると、
   *   どれを押せばいいのか分からない画面になる。**
   */
  tone?: "hero" | "primary" | "quiet";
  className?: string;
  /** 読み上げの名前。省くと「〜を再生」。 */
  label?: string;
  /**
   * 押せる札の中に置くとき。**押した先まで伝えない** —
   * 図鑑の一覧は札ごと押せるので、伝えるとカードが開いてしまう。
   */
  stopPropagation?: boolean;
}) {
  const t = useT();
  const pronounce = usePronounce(language);
  const state = useSpeechReady(text, language);
  /**
   * **一度出したボタンは引っ込めない**(オーナー指摘 2026-08-26
   * 「単語の候補の音声ボタン押したら消える」)。
   *
   * 押すと、その語の状態が一瞬 `loading` に戻ることがある
   * (端末に無い / 前に失敗した語を取り直しに行くとき)。素直に状態だけで
   * 描くと、**押した指の下でボタンが消える**。押した人には壊れて見えるし、
   * 二度押しもできない。
   *
   * 「まだ鳴らせないものを出さない」のが目的なので、**一度鳴らせた（か、
   * 端末の声に落ちると決まった）語はそのまま出し続ける**。
   */
  const shown = useRef(false);
  const shownFor = useRef(text);
  // **語が差し替わったら、描くより先に忘れる。** 一覧の中で同じ部品が
  // 使い回されるので、効果(useEffect)で消すと1回ぶん遅れ、まだ鳴らせない
  // 新しい語のボタンが一瞬出てしまう。
  if (shownFor.current !== text) {
    shownFor.current = text;
    shown.current = false;
  }
  if (state === "ready" || state === "failed") shown.current = true;
  const box = size === "sm" ? "h-9 w-9" : "h-11 w-11";
  const skin =
    tone === "quiet"
      ? // 36px は指の下限を割るので、当たり判定だけ外へ広げる。
        "bg-secondary text-primary shadow-sm ring-1 ring-border relative before:absolute before:-inset-1.5 before:content-['']"
      : tone === "hero"
        ? "lift bg-primary text-primary-foreground shadow-lg shadow-primary/30"
        : "bg-primary/12 text-primary-ink";
  const icon = tone === "hero" ? "h-5 w-5" : size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  // 支度中。**押せる物を出さない**が、場所は空けておく。
  if (!shown.current && (state === "none" || state === "loading")) {
    return <span aria-hidden className={`${box} shrink-0 ${className}`} />;
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        void pronounce(text);
      }}
      aria-label={label ?? t("common.playWord", { word: text })}
      className={`press-in grid ${box} ${skin} shrink-0 place-items-center rounded-full active:scale-95 motion-reduce:active:scale-100 ${className}`}
    >
      <Volume2 className={icon} />
    </button>
  );
}
