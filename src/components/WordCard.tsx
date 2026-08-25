import { forwardRef, Fragment, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EncounterLabels } from "@/components/EncounterLabels";
import { TocflLadder } from "@/components/TocflLadder";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Volume2,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Flag,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { usePronounce } from "@/lib/use-pronounce";
import { searchImageCandidates, type ImageCandidate } from "@/lib/images.functions";
import { heroSearchQuery } from "@/lib/hero-image";
import { reportEntry } from "@/lib/reports.functions";
import { generateCard, regenerateCardSection } from "@/lib/ai.functions";
import { updateWordExtras } from "@/lib/stickers.functions";
import { posDisplay } from "@/lib/pos";
import { Reading } from "@/lib/phonetic";
import { useT, useUiLang } from "@/lib/i18n";
import { Prose } from "@/components/Prose";
import { refineUsageChunks } from "@/lib/extras";
import { splitAroundTerm } from "@/lib/mark-term";
import { realUsageLinks } from "@/lib/real-usage-links";
import { targetProfile } from "@/lib/target-profile";
import {
  REGISTER_MAX,
  REGISTER_MIN,
  registerLabelKey,
  registerScaleOf,
  type RegisterScale,
} from "@/lib/register-scale";
// 節の一覧は画面と生成側で**同じ出所**を見る(別々に書くと静かに食い違う)。
import {
  isRegenSection,
  missingSections,
  sectionHasContent,
  sectionsFor,
  type RegenSection,
  type SectionId,
} from "@/lib/card-sections";
import { DEFAULT_TARGET_LANGUAGE, TARGET_LANGUAGES } from "@/lib/target-lang";
import { nextAutoFillQueue, MAX_AUTO_FILL, MAX_FAILURES } from "@/lib/auto-fill";
import { ChunkPills, ChunkLegend } from "@/components/ChunkPills";
import type { WordExtrasDTO } from "@/lib/extras";

// 後方互換の別名(以前この型はここで定義されていた)。
export type WordExtras = Partial<WordExtrasDTO>;

export type WordCardData = {
  headword: string;
  /** 第一の読み（台湾華語=注音 / 英語=米式IPA）。無ければ古い列に落ちる。 */
  reading_primary?: string | null;
  /** 第二の読み（台湾華語=拼音 / 英語=英式IPA）。 */
  reading_alt?: string | null;
  /**
   * その語を**何語として覚えているか**。
   *
   * カードに出る節・読みの種類・級の目盛りが全部ここから決まる。
   * 空なら既定の学習言語(`targetProfile` が落とす) — 英語を選べる
   * ようにする前に入った149語はこの列を持っていない。
   */
  language?: string | null;
  reading_zhuyin?: string | null;
  pinyin?: string | null;
  meaning_ja: string;
  part_of_speech?: string | null;
  level?: string | null;
  example_sentence?: string | null;
  example_translation?: string | null;
  extras?: WordExtras | null;
};

/**
 * 2026-07-25 再構成: 似た項目を統合して「ネイティブがどう使うか」を
 * 視覚(チャンク色分け)で見せる構成に。
 *   コロケーション+語順・型      → usage_chunks(使い方チャンク)
 *   類義語・反義語+類義語との違い → related_words(にてる言葉)
 *   使う場面+頻度・どこで使う    → usage_context(頻度・使う場面)
 *   勉強のコツ                    → pronunciation_tips(発音のコツ)
 *   雑学+語法ノート              → taiwan_note(台湾メモ)
 */

/**
 * 並べ替えの一覧が拠り所にする、**節の全部**。
 *
 * ## なぜ手書きの写しをやめたか
 * ここには節の並びが**3つ目の写し**として手で書かれていた
 * (`target-profile.ts` の `sections`、`card-sections.ts` の `SECTION_IDS`、
 * そしてここ)。英語のカードの項目を足したとき、ここだけ足し忘れると
 * **設定の並べ替えに出てこない節**ができる — 型でもビルドでも落ちない。
 *
 * 並びは言語ごとに違うので、**両方の言語の並びを畳んで**作る。
 * `sectionsFor()` が出所で、ここは順序を混ぜているだけ。
 *
 * ## 畳み方
 * 台湾華語の並びを土台にして、英語にしか無い節を「**英語の並びで直前に
 * 来る共通の節のうしろ**」へ差し込む。こうすると、どちらの言語の人から
 * 見ても自分の節が自然な位置に並ぶ。
 */
const ALL_SECTIONS: { id: SectionId }[] = (() => {
  const base = [...sectionsFor(DEFAULT_TARGET_LANGUAGE)];
  for (const other of TARGET_LANGUAGES) {
    const list = sectionsFor(other);
    let at = -1;
    for (const id of list) {
      const found = base.indexOf(id);
      if (found >= 0) {
        at = found;
        continue;
      }
      // 共通の節がまだ1つも出ていなければ先頭へ。
      at = at < 0 ? 0 : at + 1;
      base.splice(at, 0, id);
    }
  }
  return base.map((id) => ({ id }));
})();

const PREF_KEY = "wordcard-prefs-v4";
const PREF_EVENT = "wordcard-prefs-changed";

type Prefs = { order: SectionId[]; hidden: SectionId[] };

function loadPrefs(): Prefs {
  if (typeof window === "undefined") return { order: ALL_SECTIONS.map((s) => s.id), hidden: [] };
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Prefs;
      const valid = (id: SectionId) => ALL_SECTIONS.some((s) => s.id === id);
      const missing = ALL_SECTIONS.map((s) => s.id).filter((id) => !p.order.includes(id));
      return {
        order: [...p.order.filter(valid), ...missing],
        hidden: (p.hidden ?? []).filter(valid),
      };
    }
  } catch {
    /* noop */
  }
  return { order: ALL_SECTIONS.map((s) => s.id), hidden: [] };
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
    window.dispatchEvent(new CustomEvent(PREF_EVENT));
  } catch {
    /* noop */
  }
}

function usePrefsSync(setPrefs: (p: Prefs) => void) {
  useEffect(() => {
    const h = () => setPrefs(loadPrefs());
    window.addEventListener(PREF_EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(PREF_EVENT, h);
      window.removeEventListener("storage", h);
    };
  }, [setPrefs]);
}

export function WordCardSectionsEditor() {
  const t = useT();
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  usePrefsSync(setPrefs);
  const isVisible = (id: SectionId) => !prefs.hidden.includes(id);
  const toggle = (id: SectionId) => {
    const next = {
      ...prefs,
      hidden: prefs.hidden.includes(id)
        ? prefs.hidden.filter((x) => x !== id)
        : [...prefs.hidden, id],
    };
    setPrefs(next);
    savePrefs(next);
  };
  const move = (id: SectionId, dir: -1 | 1) => {
    const i = prefs.order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= prefs.order.length) return;
    const o = [...prefs.order];
    [o[i], o[j]] = [o[j], o[i]];
    const next = { ...prefs, order: o };
    setPrefs(next);
    savePrefs(next);
  };
  return (
    <ul className="space-y-1">
      {prefs.order.map((id, idx) => {
        const meta = ALL_SECTIONS.find((s) => s.id === id);
        if (!meta) return null;
        const visible = isVisible(id);
        return (
          <li
            key={id}
            className="flex items-center justify-between rounded-lg bg-secondary/60 px-2 py-1 text-footnote"
          >
            <span className={visible ? "" : "text-muted-foreground line-through"}>
              {t(`card.${meta.id}`)}
            </span>
            <span className="flex gap-1">
              <button
                className="lift-soft rounded-md p-1"
                onClick={() => move(id, -1)}
                disabled={idx === 0}
                aria-label={t("card.moveUp")}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                className="lift-soft rounded-md p-1"
                onClick={() => move(id, 1)}
                disabled={idx === prefs.order.length - 1}
                aria-label={t("card.moveDown")}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                className="lift-soft rounded-md p-1"
                onClick={() => toggle(id)}
                aria-label={t("card.toggleShow")}
              >
                {visible ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 節の見分け方は**絵だけ**にする。
 *
 * ここには節ごとに淡い背景・縁・丸印の色が13色ぶん直書きされていた
 * (`bg-sky-50` `ring-cyan-200` … 39個)。2つの理由でやめる。
 *
 * ① **明るい面の前提で固定されている。** 暗いテーマでは、ほぼ白い面の上に
 *    テーマ追従の明るい文字が載る。実測で見出し語 1.07:1、意味 1.02:1、
 *    例文 1.03:1 — つまり**暗いテーマでは単語カードが読めない**。
 *    テーマは6つあるので、13色 × 6面を手で合わせ続けるのは無理がある。
 *
 * ② **13色は覚えられない。** 色分けは「色を見ただけで種類が分かる」ときだけ
 *    働く。3〜4種なら覚えられるが、13種になると誰も「水色=意味」を
 *    覚えないので、残るのは賑やかさだけになる。区別はすでに**絵**が
 *    やっている(📖 💬 🧩 …)ので、色は同じ仕事を二重にしているだけだった。
 *
 * だから面はカードと同じ1種類にして、節の区別は絵と見出しに任せる。
 * これは色を付け替えたのではなく、**色分けをやめる**という判断。
 */
const SECTION_ICON: Record<SectionId, string> = {
  meaning: "\u{1F4D6}",
  web_images: "\u{1F310}",
  usage_context: "\u{1F4CA}",
  example: "\u{1F4AC}",
  examples_extra: "\u{2795}",
  usage_chunks: "\u{1F9E9}",
  measure_words: "\u{1F522}",
  related_words: "\u{1FA9E}",
  pronunciation_tips: "\u{1F5E3}\u{FE0F}",
  etymology: "\u{1F3DB}\u{FE0F}",
  mnemonic: "\u{1F4A1}",
  taiwan_note: "\u{1F1F9}\u{1F1FC}",
  real_usage: "\u{1F3AC}",
  // --- 英語のカードだけの節 ------------------------------------------------
  forms: "\u{1F504}",
  countability: "\u{1F9FA}",
  stress: "\u{1F941}",
  phrasal_verbs: "\u{1F517}",
  culture_note: "\u{1F30D}",
};

export type WordCardHandle = { toggleEditing: () => void; isEditing: () => boolean };

export const WordCard = forwardRef<
  WordCardHandle,
  {
    word: WordCardData;
    autoplay?: boolean;
    /** 指定すると Pro の項目別ワンタッチ再生成が有効になる。 */
    wordId?: string;
    isPro?: boolean;
    /**
     * 「今週出会う見込み」。**呼ぶ側が取ってきて渡す。**
     * 全利用者を数える問い合わせなので、カードの中から勝手に走らせない。
     * 届いていなければ節そのものを出さない。
     */
    /** ネット画像を「この画像にする」で選んだとき(カードの写真に採用)。 */
    onPickImage?: (url: string) => void | Promise<void>;
    /**
     * 撮った直後の面。**意味と発音だけを出す**(オーナー指摘 2026-08-21)。
     * 図鑑の詳細では使わない — そちらは全部出るのが正しい。
     */
    minimal?: boolean;
  }
>(function WordCard(
  { word, autoplay = true, wordId, isPro = false, onPickImage, minimal = false },
  ref,
) {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  usePrefsSync(setPrefs);

  // Kept for API compatibility — the editor now lives outside the card.
  useImperativeHandle(
    ref,
    () => ({
      toggleEditing: () => {},
      isEditing: () => false,
    }),
    [],
  );

  const ex = word.extras ?? {};
  const isVisible = (id: SectionId) => !prefs.hidden.includes(id);

  /**
   * 中身があるか。**判定は `card-sections.ts` の1つだけ**を使う。
   *
   * ここに写しを置いていたときは、server 側が「まだ空だ」と考えて作り直し、
   * 画面は「埋まっている」と考える、という食い違いが起こり得た
   * (裏で順に作る仕組みでは、それが止まらない生成になる)。
   */
  const contentInput = {
    headword: word.headword,
    meaning_ja: word.meaning_ja,
    example_sentence: word.example_sentence,
    extras: (word.extras ?? null) as WordExtrasDTO | null,
  };
  /**
   * **撮った直後は「訳と発音」だけ。**
   *
   * オーナー指示 2026-08-25:
   * > 「単語の候補をユーザーが選択したあとは**絶対に**母語での訳と発音、
   * >  感想の入力以外の単語の詳細の項目は表示しないで。裏で同時に項目の
   * >  生成をするだけにして。」
   *
   * 前の版はここが甘かった。伏せていたのは「何も生成できていなくても
   * 描けてしまう3つ」(ネットの画像・実際の使われ方・出会う見込み)だけで、
   * **中身が届いた節は片端から現れていた** — 級の段々も、例文も、
   * チャンクも。撮った直後に見たいのは「これは何という語で、どう読んで、
   * 自分は何を感じたか」だけなので、そこに他の物を並べない。
   *
   * 生成は止めない。下の `missing` は `minimal` を見ていないので、
   * **裏では全部の節を作り続ける**(「裏で同時に生成するだけ」)。
   */
  const MINIMAL_SECTIONS: readonly SectionId[] = ["meaning"];
  const hasContent = (id: SectionId): boolean => sectionHasContent(id, contentInput);

  // まだ作られていない節。**隠したうえで、数だけ上でまとめて言う。**
  // 並びは**画面の並びそのまま**。`missingSections` はその順を崩さない
  // (裏で作る順もこれ = オーナーの「項目の上から順に」)。
  /**
   * **この語の言語に在る節だけを並べる。**
   *
   * 並べ替えの設定(`prefs.order`)は言語をまたいだ全部の節を持っている
   * — 台湾華語の語と英語の語を両方持っている人が、1つの一覧で並びを
   * 決められるようにするため。そのまま描くと、英語のカードに**量詞と
   * 台湾メモ**が出て、台湾華語のカードに**冠詞と強勢**が出る。
   *
   * さらに大事なのは `missing` の側で、ここを絞らないと**英語の語の
   * 量詞を AI に作らせ続ける**ことになる。「英語に量詞は無い」ので
   * 何を作っても `sectionHasContent` は満たされず、上限に当たるまで
   * 呼び続けて、待ち時間もお金も払う。
   */
  const inThisLanguage = new Set<SectionId>(sectionsFor(word.language));
  const order = prefs.order.filter((id) => inThisLanguage.has(id));
  // **`missing` は `minimal` を見ない。** 見えていない節も裏では作る。
  const missing = missingSections(order.filter(isVisible), contentInput);
  const shown = minimal
    ? order.filter((id) => MINIMAL_SECTIONS.includes(id) && isVisible(id))
    : order.filter((id) => isVisible(id) && !(missing as readonly SectionId[]).includes(id));

  return (
    <div className="space-y-3">
      <HeaderRow word={word} autoplay={autoplay} minimal={minimal} />
      {wordId && missing.length > 0 && <AutoFillSections wordId={wordId} missing={missing} />}
      <div className="grid gap-3">
        {shown.map((id) => (
          <SectionCard
            key={id}
            id={id}
            word={word}
            wordId={wordId}
            isPro={isPro}
            empty={!hasContent(id)}
            onPickImage={onPickImage}
          />
        ))}
      </div>
    </div>
  );
});

/**
 * 「このカードを仕上げる」。空の節を全部まとめて1つの行動にする。
 *
 * **1回の生成で全項目が埋まる。** 節ごとの生成を11回押させると、11回
 * 待たされたうえに11回ぶんの費用がかかる。ここは既にある
 * `generateCard` → `updateWordExtras` の道を通す(手動の作り直しと同じ道)。
 */
/**
 * まだ作られていない項目を、**裏で、上から順に**作る。
 *
 * オーナー: 「候補を選択した瞬間から裏で単語の詳細のすべての項目を
 * 作り始めてる。項目の上から順に。また単語の詳細の項目は未生成の場合は
 * ユーザーに項目自体を見せない。生成されたら項目を表示するようにする。」
 *
 * ## ボタンをやめた
 * ここには「カードを仕上げる」ボタンが在って、押すまで何も起きなかった。
 * 押さない人のカードは意味だけのまま残る。**待たせない代わりに、押させない。**
 * 失敗したときだけボタンに戻す — 押しても直らない物を黙って再試行し続けない。
 *
 * ## 1節ずつ、順番どおりに
 * 1節できるたびに札を読み直すので、**上の項目から順に現れる**。
 * まとめて作って一度に出すと、順番は見えないし、途中で失敗したら
 * 全部が無くなる。
 *
 * ## 暴走させない蓋
 * 節ごとに1回 AI を呼ぶので、上限(`MAX_AUTO_FILL`)と連続失敗の打ち切り
 * (`MAX_FAILURES`)を `src/lib/auto-fill.ts` に置いてテストしてある。
 */
function AutoFillSections({
  wordId,
  missing,
}: {
  wordId: string;
  missing: readonly RegenSection[];
}) {
  const t = useT();
  const qc = useQueryClient();
  const fillFn = useServerFn(regenerateCardSection);
  const [state, setState] = useState<{ done: number; total: number; failed: boolean }>({
    done: 0,
    total: 0,
    failed: false,
  });
  /** もう一度押されたら作り直す合図。 */
  const [retryNonce, setRetryNonce] = useState(0);

  /**
   * **最新の「足りない節」を ref で持つ。**
   *
   * ここを効果の依存に入れると、1節できるたびに札を読み直す → 一覧が変わる
   * → 効果が作り直される → **走っている途中の輪が中断される**。
   * 進む数も毎回 0 に戻って、進み具合が読めなくなる。
   * 効果は語が変わったときだけ作り直し、中身は毎回 ref から読む。
   */
  const missingRef = useRef<readonly RegenSection[]>(missing);
  missingRef.current = missing;
  /** この語で試した節。**失敗した節も入れる**(入れないと同じ節を回り続ける)。 */
  const attemptedRef = useRef<Set<string>>(new Set());
  const wordRef = useRef(wordId);
  if (wordRef.current !== wordId) {
    wordRef.current = wordId;
    attemptedRef.current = new Set();
  }

  useEffect(() => {
    let cancelled = false;
    const attempted = attemptedRef.current;
    // 1回開いたときに作る数の上限。**この画面ぶんの合計**で数える —
    // 1周ごとに数え直すと、周を重ねて何節でも作れてしまう。
    const budget = MAX_AUTO_FILL - attempted.size;
    if (budget <= 0) return;
    const planned = nextAutoFillQueue(missingRef.current, attempted, budget).length;
    if (planned === 0) return;

    void (async () => {
      let failures = 0;
      let done = 0;
      setState({ done: 0, total: planned, failed: false });
      while (!cancelled) {
        const left = MAX_AUTO_FILL - attempted.size;
        const [section] = nextAutoFillQueue(missingRef.current, attempted, Math.max(0, left));
        if (!section) break;
        attempted.add(section);
        try {
          await fillFn({ data: { word_id: wordId, section, only_if_empty: true } });
          failures = 0;
          // できた節をすぐ出す。ここで読み直すから「上から順に現れる」。
          await qc.invalidateQueries({ queryKey: ["sticker"] });
          await qc.invalidateQueries({ queryKey: ["stickers"] });
        } catch {
          failures += 1;
          // **同じ失敗を繰り返さない。** 上限に当たった / 鍵が無い、のような
          // 直らない失敗で AI を叩き続けない。
          if (failures >= MAX_FAILURES) {
            if (!cancelled) setState({ done, total: planned, failed: true });
            return;
          }
        }
        done += 1;
        if (!cancelled) setState({ done, total: planned, failed: false });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordId, retryNonce]);

  if (state.failed) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          onClick={() => {
            attemptedRef.current = new Set();
            setState({ done: 0, total: 0, failed: false });
            setRetryNonce((n) => n + 1);
          }}
          className="press-in inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-body font-semibold text-primary-foreground"
        >
          {t("card.fillRetry")}
        </button>
        <p className="ja-phrase text-footnote text-destructive-ink">{t("card.fillFailed")}</p>
      </div>
    );
  }

  // **進み具合を出さない**(オーナー指摘 2026-08-21)。
  //
  // > 「実際に生成するときに解説を上から順に作っていますと単語の詳細に
  // >  表示させないで。」
  //
  // 項目は**できた順に現れる**ので、それ自体が進み具合になっている。
  // その上に「3/8」と書くと、読む物が増えるだけで、待つ理由が増える。
  // 失敗したときだけボタンに戻る(上の分岐)。
  return null;
}

function HeaderRow({
  word,
  autoplay,
  minimal = false,
}: {
  word: WordCardData;
  autoplay: boolean;
  /**
   * 撮った直後。**級の段々も品詞も出さない** — オーナー指示
   * 「母語での訳と発音、感想の入力以外の項目は表示しないで」。
   * 級は「訳」でも「発音」でもないし、撮った直後にいちばん邪魔になる
   * (絵の3枚目で TOCFL の段々が画面の1/4を占めていた)。
   */
  minimal?: boolean;
}) {
  const t = useT();
  const autoplayedRef = useRef(false);
  // **その語の言語で読む。** 渡さないと台湾華語として合成されるので、
  // 英語の語が中国語の声で読まれ、しかもその音は保存される。
  const pronounce = usePronounce(word.language ?? undefined);

  // その言語の声(サーバ合成)で読む。端末の声は控え。
  function play() {
    void pronounce(word.headword);
  }

  useEffect(() => {
    if (!autoplay || autoplayedRef.current) return;
    autoplayedRef.current = true;
    // 変数名 t は翻訳関数と紛らわしいので timer にする。
    const timer = setTimeout(play, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.headword]);

  return (
    // 見出しの箱。`from-white to-sky-50` の直書きグラデーションだったので、
    // 暗いテーマでは**白い箱の上に明るい文字**になっていた(見出し語 1.07:1)。
    // 主色をごく薄く敷いて「ここが主役」を出しつつ、面はテーマに追従させる。
    <div className="rounded-3xl border border-border bg-card bg-gradient-to-br from-primary/[0.06] to-transparent p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <h1 lang="zh-Hant" className="text-hero font-bold tracking-tight">
              {word.headword}
            </h1>
            <button
              onClick={play}
              aria-label={t("card.playPron")}
              // 40px だった。この画面でいちばん押されるボタンなので、
              // 当たり判定を広げるのではなく**見た目ごと 44px** にする。
              className="lift inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30"
            >
              <Volume2 className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-1 text-body text-muted-foreground">
            {/* **学習言語を渡す。** 渡さないと `Reading` は既定の台湾華語の
                プロフィールで考えるので、英語の語に注音/拼音を探しに行き、
                IPA を持っていても読みが空になる。 */}
            <Reading
              lang={word.language ?? undefined}
              zhuyin={word.reading_zhuyin}
              pinyin={word.pinyin}
              ipaUs={word.reading_primary}
              ipaUk={word.reading_alt}
            />
          </div>
          {!minimal && (word.part_of_speech || word.level) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {word.part_of_speech && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-caption font-medium text-foreground ring-1 ring-border">
                  {posDisplay(word.part_of_speech)}
                </span>
              )}
              <ReportButton headword={word.headword} />
            </div>
          )}
          {/* 級は札1つではなく**段々**で見せる(オーナー指摘)。
              `TOCFL-2` とだけ書かれても、2が6段のどこなのか分からない。 */}
          {/* **目盛りを渡す。** 渡さないと既定の TOCFL で描くので、
              英語の語(CEFR A2)の上に「TOCFL 1 2 3 4 5 6 / 2級(Band A)」が
              出る — 絵で見つけた。段々の形は同じなので、変わるのは
              名前だけ(`level-scale.ts`)。 */}
          {!minimal && (
            <TocflLadder
              level={word.level}
              scale={targetProfile(word.language).levels}
              className="mt-2"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 辞書エラー報告(A8): 発音・意味・品詞の誤りをその場で通報。監査の
 * ランダム抜き打ちだけでは拾えない実利用者の指摘を集める恒久ルート。
 */
function ReportButton({ headword }: { headword: string }) {
  const t = useT();
  const reportFn = useServerFn(reportEntry);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const kinds: { kind: "pronunciation" | "meaning" | "pos" | "other"; label: string }[] = [
    { kind: "pronunciation", label: t("card.pronZhuyin") },
    { kind: "meaning", label: t("card.meaning") },
    { kind: "pos", label: t("card.posLabel") },
    { kind: "other", label: t("card.otherLabel") },
  ];
  async function send(kind: "pronunciation" | "meaning" | "pos" | "other") {
    setOpen(false);
    try {
      await reportFn({ data: { headword, kind, note: "" } });
      setSent(true);
    } catch {
      /* 報告失敗は致命的でない */
    }
  }
  if (sent) {
    return <span className="text-caption text-muted-foreground">{t("card.reportThanks")}</span>;
  }
  return (
    <span className="relative ml-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        // §11: 見た目は小さいまま、当たり判定だけを 44px へ広げる
        // (`::before` を伸ばす)。文字は `/70` をやめる — 薄めた結果
        // 明るい面 3.04:1 / 暗い面 1.76:1 だった。
        className="relative inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption text-muted-foreground transition-colors before:absolute before:-inset-x-2 before:-inset-y-3 before:content-[''] hover:text-foreground"
        aria-label={t("card.reportError")}
      >
        <Flag className="h-3 w-3" /> {t("card.report")}
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 w-40 rounded-xl border border-border bg-card p-1.5 shadow-xl">
          <p className="px-2 py-1 text-caption text-muted-foreground">{t("card.reportWhat")}</p>
          {kinds.map((k) => (
            <button
              key={k.kind}
              onClick={() => send(k.kind)}
              className="block w-full rounded-lg px-2 py-1.5 text-left text-footnote hover:bg-secondary"
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function SectionCard({
  id,
  word,
  wordId,
  isPro,
  empty,
  onPickImage,
}: {
  id: SectionId;
  word: WordCardData;
  wordId?: string;
  isPro?: boolean;
  /** 中身がまだ無い(AIが未生成)。枠は出し、生成ボタンを見せる。 */
  empty?: boolean;
  onPickImage?: (url: string) => void | Promise<void>;
}) {
  const icon = SECTION_ICON[id];
  const t = useT();
  const label = t(`card.${id}`);
  const ex = word.extras ?? {};
  const regenFn = useServerFn(regenerateCardSection);
  const qc = useQueryClient();
  const [regenerating, setRegenerating] = useState(false);
  const canRegen = !!wordId && !!isPro && isRegenSection(id);

  // Pro: この項目だけをワンタッチで作り直す。
  async function regen() {
    if (!wordId || regenerating) return;
    setRegenerating(true);
    try {
      await regenFn({ data: { word_id: wordId!, section: id as RegenSection } });
      await qc.invalidateQueries({ queryKey: ["sticker"] });
      await qc.invalidateQueries({ queryKey: ["stickers"] });
    } catch (e) {
      console.warn("Section regen failed", e);
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <section
      className={[
        // **どの節も同じ札に入れる(NORI指定)。**
        // 一時期、語源・部首 / 覚え方 / 台湾メモ の3つだけ札をやめて地の上に
        // 直接置いていた(「同じ箱が14枚並ぶと目の着地点が無くなる」という
        // 独立監査の指摘への答え)。だが実際に見ると、**その3つだけ枠が
        // 抜け落ちて崩れて見える** — 重さの差ではなく、作りかけに見える。
        //
        // 重さは箱の有無ではなく、**間合い**で付ける(下の `mb-3`)。
        "lift rounded-2xl border border-border bg-card p-4 shadow-sm",
        // **意味の下だけ間合いを空ける。** 節がすべて等間隔だと、
        // 14枚がひと続きの壁になる。ここで一度切ると「答え」と
        // 「それ以外」に割れる(近いものほど近く、の原則)。
        id === "meaning" ? "mb-3" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="mb-2 flex items-center gap-2">
        {/* 絵は節の目印。色の付いた丸は外した — 色で区別していないので、
            丸そのものが何も言わなくなる。絵だけを地の上に置く。 */}
        <span aria-hidden className="text-body leading-none">
          {icon}
        </span>
        {/* 大文字化と広い字間はラテン文字の作法。見出しは日本語なので素で組む
            (ホームの「Past Pages」と同じ穴)。 */}
        <h3 className="text-footnote font-semibold text-foreground">{label}</h3>
        {canRegen && (
          <button
            onClick={regen}
            disabled={regenerating}
            aria-label={`${label}: ${t("card.regen")}`}
            title={t("card.regen")}
            // **Pro の人にしか出ないので、今まで一度も測られていなかった。**
            // 節ごとに1つ、14個並ぶ小さな印。見た目は 32px のままでいい
            // (節の見出しより重くすると、どれが中身か分からなくなる)。
            // 当たり判定だけ 44px へ広げる。押せない間は薄くせず、色を落とす。
            className="relative ml-auto grid h-8 w-8 place-items-center rounded-full text-muted-foreground/60 transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-secondary hover:text-foreground disabled:text-muted-foreground/40"
          >
            {regenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>
      {empty ? (
        <EmptySection t={t} />
      ) : (
        <Body id={id} word={word} ex={ex} t={t} onPickImage={onPickImage} />
      )}
    </section>
  );
}

/**
 * まだ中身が無い項目。
 *
 * ## 「作る」ボタンはここに置かない
 * **AI で作れる節は、空なら並べない**(上の「カードを仕上げる」に畳む)。
 * つまりここへ来るのは `web_images` / `real_usage` のような
 * **生成物ではない節**だけで、`canGenerate` は構造上いつも false だった。
 * 押せないボタンの分岐を残しておくと、次に読む人が
 * 「ここから作れる」と誤解する。到達しない道は置かない。
 */
function EmptySection({ t }: { t: (k: string) => string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-secondary px-3 py-2.5">
      <span className="text-caption text-muted-foreground">{t("card.notYet")}</span>
    </div>
  );
}

/** 頻度メーター(1〜5)。 */
function FrequencyMeter({ level }: { level: number }) {
  const t = useT();
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={t("card.freqAria", { n: level })}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`h-2 w-3.5 rounded-sm ${i <= level ? "bg-cyan-500" : "bg-cyan-200/60"}`}
        />
      ))}
    </span>
  );
}

/**
 * 話し言葉 ⇄ 書き言葉のメーター。
 *
 * ## 色だけに頼らない
 * 針の**位置**・**文字**・色の3つが同じことを言う。色覚の違う人にも、
 * 明るい屋外で色が飛んでいる人にも、同じだけ伝わる必要がある
 * (このアプリは街を歩きながら使う)。
 *
 * ## 「分からない」を真ん中に置かない
 * 目盛りが無い語ではこの区画そのものを出さない。真ん中に針を置くと
 * 「どちらでも使う」と言い切ったことになる(`lib/register-scale.ts`)。
 */
export function RegisterMeter({
  scale,
  compact = false,
}: {
  scale: RegisterScale;
  /**
   * 頻度の札の**横に並べる**形(オーナー指摘 2026-08-20)。
   *
   * > 「話し言葉と書き言葉のメーターが横長すぎるが、コンパクトにして
   * >  頻度のバーの横に並べて」
   *
   * 幅いっぱいに置くと、たった5段しかない目盛りのために1行を丸ごと使う。
   * 短い帯にして、名前は帯の左に置く。**両端の言葉(口語/書面)は落とす** —
   * 帯そのものが左右の向きを示しているし、名前がどちら寄りかを言う。
   */
  compact?: boolean;
}) {
  const t = useT();
  const label = t(registerLabelKey(scale));
  // -2..+2 を 0..100% に。真ん中(0)がちょうど 50%。
  const pct = ((scale - REGISTER_MIN) / (REGISTER_MAX - REGISTER_MIN)) * 100;
  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-1 text-caption font-medium text-foreground ring-1 ring-border"
        role="img"
        aria-label={`${t("card.register")}: ${label}`}
        title={`${t("card.regSpoken")} ⇄ ${t("card.regWritten")}`}
      >
        {label}
        <span className="relative block h-2 w-14 rounded-full bg-gradient-to-r from-warn/45 via-background to-primary/45">
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
          {/* 針の半径ぶん内側で動かす(端で切れて見えるのを避ける)。 */}
          <span className="pointer-events-none absolute inset-y-0 left-[6px] right-[6px] block">
            <span
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow"
              style={{ left: `${pct}%` }}
            />
          </span>
        </span>
      </span>
    );
  }
  return (
    <div className="w-full" role="img" aria-label={`${t("card.register")}: ${label}`} title={label}>
      <div className="flex items-baseline justify-between text-caption text-muted-foreground">
        <span>{t("card.regSpoken")}</span>
        <span className="font-semibold text-foreground">{label}</span>
        <span>{t("card.regWritten")}</span>
      </div>
      <div className="relative mt-1.5 h-2 rounded-full bg-gradient-to-r from-warn/45 via-secondary to-primary/45">
        {/* 中立の位置に薄い目印。針がそこに在るのか、たまたま近いのかを分ける。 */}
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
        {/* **針の通り道を内側に寄せる。** 帯の端に置くと針が半分はみ出して
            切れて見え、両端の2段だけ別物のように見えた(検査の絵で気づいた)。
            針の半径(7px)ぶん狭めた中を 0〜100% で動かす。 */}
        <span className="pointer-events-none absolute inset-y-0 left-[7px] right-[7px] block">
          <span
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow"
            style={{ left: `${pct}%` }}
          />
        </span>
      </div>
    </div>
  );
}

/**
 * 例文の中の見出し語に印を付ける。
 *
 * 印の見た目は**地の文の解説と同じ**(`Prose` の `term`)。同じ「この語だ」を
 * 指す印が画面の中で2通りあると、別の意味だと読まれる。
 *
 * **語の途中で折り返させない。** 和文・中文は文字単位で折り返すので、
 * 印を付けた語も「珍珠 / 奶茶」と割れる。塗りが2行にちぎれると、
 * どこからどこまでが1語なのかが読めなくなる — 印を付けた意味が消える。
 */
function MarkedSentence({
  text,
  term,
  className = "",
}: {
  text: string | null | undefined;
  term: string;
  className?: string;
}) {
  const spans = splitAroundTerm(text, term);
  if (spans.length === 0) return null;
  return (
    <p lang="zh-Hant" className={className}>
      {spans.map((s, i) =>
        s.hit ? (
          <span
            key={i}
            // **地の上に重ねない色で塗る。**
            // `bg-primary/10` は透ける塗りなので、節の地が青みを帯びている
            // 所では青が二重になり、同じ指定でも他より濃く出る
            // (検査: ここだけ 4.36 で下限割れ、他は 4.39〜4.49 で通った)。
            // 下に何が在っても同じ濃さになるよう、カードの地と混ぜた
            // **不透明な色**にする。
            className="inline-block whitespace-nowrap rounded px-1 font-semibold text-primary-ink [background:color-mix(in_oklab,var(--primary)_10%,var(--card))]"
          >
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
}

function Body({
  id,
  word,
  ex,
  t,
  onPickImage,
}: {
  id: SectionId;
  word: WordCardData;
  ex: WordExtras;
  t: (k: string) => string;
  onPickImage?: (url: string) => void | Promise<void>;
}) {
  switch (id) {
    case "meaning":
      // **この画面を開く理由がこの一行。** これまで注釈と同じ 15px で置いて
      // いたので、2800px スクロールするカードの中で「答え」と「脚注」が
      // 寸法上まったく同じだった(独立監査が実測で指摘)。
      // 6段の階調の title(22px)に上げて、二番目の着地点を作る。
      // **太字にしない**(オーナー指摘 2026-08-21「日本語の意味の文字が
      // 太すぎる」)。大きさで着地点は作れているので、太さは足さない。
      return <p className="text-title leading-snug text-foreground">{word.meaning_ja}</p>;

    case "usage_context": {
      // 統合表示: 頻度メーター + 口語⇄書面のメーター + どこで見て使うかの説明。
      const text =
        ex.usage_context || [ex.register_note, ex.common_situation].filter(Boolean).join(" ");
      const registerScale = registerScaleOf(ex);
      const hasFreq = ex.frequency_level != null && ex.frequency_level > 0;
      return (
        <div className="space-y-2">
          {/* **頻度と口語⇄書面は同じ行に並べる**(オーナー指摘 2026-08-20)。
              どちらも「この語がどういう語か」の目盛りで、別々の行に置くと
              縦に伸びるだけで読みやすくならない。 */}
          {(hasFreq || registerScale !== null) && (
            <div className="flex flex-wrap items-center gap-2">
              {hasFreq && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-1 text-caption font-medium text-foreground ring-1 ring-border">
                  {t("card.frequency")} <FrequencyMeter level={ex.frequency_level!} />
                </span>
              )}
              {registerScale !== null && <RegisterMeter scale={registerScale} compact />}
            </div>
          )}
          {/* 出会いやすい所を具体的な札で。**種類ごとに色を分ける** —
              「夜市」と「うれしい時」が同じ顔で並ぶと、何の一覧か分からない。 */}
          <EncounterLabels labels={ex.encounter_labels ?? []} />
          {text && <Prose text={text} />}
        </div>
      );
    }

    case "example":
      // 品詞ごとの色分けは外してある(色分けは「使い方チャンク」だけ)。
      // 代わりに**その語がどこに出ているか**だけを印で示す。
      return (
        <div className="space-y-1">
          <MarkedSentence text={word.example_sentence} term={word.headword} className="text-body" />
          <p className="text-footnote text-muted-foreground">{word.example_translation}</p>
        </div>
      );

    case "examples_extra":
      return (
        <ul className="space-y-2">
          {(ex.examples_extra ?? []).map((e, i) => (
            <li key={i} className="rounded-xl bg-secondary p-2">
              {e.scene && (
                <p className="mb-1 text-caption font-medium text-muted-foreground">🎬 {e.scene}</p>
              )}
              <MarkedSentence text={e.zh} term={word.headword} className="text-body" />
              <p className="text-caption text-muted-foreground">{e.ja}</p>
            </li>
          ))}
        </ul>
      );

    case "usage_chunks": {
      // ネイティブがこの単語をどう組み合わせるか — 型をパーツ色分けで。
      // 量詞は真下の「量詞」の欄で読むので、そこと重なるだけの型は落とす。
      const chunks = refineUsageChunks(ex.usage_chunks, ex.measure_words, word.headword);
      if (chunks.length > 0) {
        return (
          <div className="space-y-2">
            {chunks.map((c, i) => (
              <div key={i} className="rounded-xl bg-secondary p-2.5">
                <ChunkPills parts={c.parts} size="sm" />
                {c.ja && <p className="mt-1 text-caption text-muted-foreground">{c.ja}</p>}
              </div>
            ))}
            {/* 凡例は**全部の札をまとめて**見る。かたまりごとに出すと
                同じ丸が何度も並ぶ。 */}
            <ChunkLegend parts={chunks.flatMap((c) => c.parts)} />
            {/* 一緒に使う語の一覧は、コーパスのほうが桁違いに詳しい。 */}
          </div>
        );
      }
      // 旧データ: コロケーション+語順テキストのフォールバック。
      return (
        <div className="space-y-2">
          {(ex.collocations?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {ex.collocations!.map((c, i) => (
                <span
                  key={i}
                  className="rounded-full bg-secondary px-2.5 py-1 text-footnote font-medium shadow-sm ring-1 ring-border"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
          {ex.word_order && <Prose text={ex.word_order} />}
        </div>
      );
    }

    case "measure_words":
      // 名詞の量詞。複数あるときは使い分けを添え、読み+発音ボタンをつける。
      return (
        <ul className="space-y-1.5">
          {(ex.measure_words ?? []).map((m, i) => (
            <li key={i} className="flex items-start gap-2 rounded-xl bg-secondary px-3 py-2">
              <MeasureWordRow word={m.word} zhuyin={m.zhuyin} pinyin={m.pinyin} note={m.note} />
            </li>
          ))}
        </ul>
      );

    case "related_words": {
      const rel = ex.related_words ?? [];
      const groups: Array<{ kind: "syn" | "ant" | "rel"; label: string; tone: string }> = [
        { kind: "syn", label: t("card.synonym"), tone: "bg-secondary text-foreground" },
        { kind: "ant", label: t("card.antonym"), tone: "bg-rose-100 text-rose-900" },
        { kind: "rel", label: t("card.relatedTag"), tone: "bg-indigo-100 text-indigo-900" },
      ];
      const legacySyn = (ex.synonyms ?? []).map((w) => ({
        word: w,
        kind: "syn" as const,
        note: "",
      }));
      const legacyAnt = (ex.antonyms ?? []).map((w) => ({
        word: w,
        kind: "ant" as const,
        note: "",
      }));
      const all = rel.length > 0 ? rel : [...legacySyn, ...legacyAnt];
      return (
        <div className="space-y-2.5 text-body">
          {groups.map(({ kind, label, tone }) => {
            const items = all.filter((r) => r.kind === kind);
            if (items.length === 0) return null;
            return (
              <div key={kind}>
                <span className="mr-2 text-caption text-muted-foreground">{label}</span>
                <div className="mt-1 space-y-1">
                  {items.map((r, i) => (
                    <div key={i} className="flex flex-wrap items-baseline gap-x-2">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-footnote font-medium shadow-sm ring-1 ring-border ${tone}`}
                      >
                        {r.word}
                      </span>
                      {r.note && (
                        <span className="text-caption text-muted-foreground">{r.note}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {ex.synonym_diff && rel.length === 0 && (
            <p className="rounded-xl bg-secondary p-2 text-footnote leading-relaxed">
              {ex.synonym_diff}
            </p>
          )}
          {/* 類義語の違いは、いまは AI の当て推量だけ。研究の定義で
              確かめられる場所へ渡す。 */}
        </div>
      );
    }

    case "pronunciation_tips":
      return <Prose text={ex.pronunciation_tips || ex.study_tips || ""} />;

    case "etymology":
      return (
        <div className="space-y-1 text-body leading-relaxed">
          {ex.etymology && <Prose text={ex.etymology} />}
          {/* **部首は華語の話。** 英語の語に部首の行が出るのは、
              古いデータか AI の勇み足のどちらか。どちらでも出さない
              (指示は `target-profile.ts` の `radicalsRule` で空にさせている)。 */}
          {ex.radicals && targetProfile(word.language).capture.hasRadicals && (
            <p className="text-footnote text-muted-foreground">
              {/* **約物で繋がない。** 「部首: 珍(王+参)」と半角コロンで
                  繋いでいたが、和文の中の半角約物は字面が浮く。
                  見出しと中身は余白で分ければ足りる。 */}
              <span className="mr-2 font-medium">{t("card.radicals")}</span>
              {ex.radicals}
            </p>
          )}
        </div>
      );

    case "mnemonic":
      // 斜体は当てない。**和文に斜体の字面は無い**ので、ブラウザが字を
      // 傾けて偽造する(日付のセリフ斜体で直したのと同じ話の兄弟)。
      // 覚え方は本文と同じ組みで読ませる。
      return <Prose text={ex.mnemonic ?? ""} />;

    case "taiwan_note":
      return (
        <div className="space-y-1.5 text-body leading-relaxed">
          {ex.taiwan_note ? (
            <Prose text={ex.taiwan_note} />
          ) : (
            <>
              {ex.trivia && <Prose text={ex.trivia} />}
              {ex.usage_note && (
                <p className="text-footnote text-muted-foreground">⚠️ {ex.usage_note}</p>
              )}
            </>
          )}
        </div>
      );

    // --- 英語のカードだけの節 ------------------------------------------
    case "forms": {
      // **AI を1回も呼ばずに埋まる唯一の節。** 中身は ECDICT の `exchange`
      // 欄から取り込みのときに入る。だから「作る」のボタンも出ない
      // (`REGEN_SECTIONS` に入れていない)。
      const f = ex.forms;
      if (!f) return null;
      const rows: Array<[string, string]> = [
        [t("card.formPlural"), f.plural],
        [t("card.formPast"), f.past],
        [t("card.formPastParticiple"), f.pastParticiple],
        [t("card.formIng"), f.ing],
        [t("card.formThird"), f.third],
        [t("card.formComparative"), f.comparative],
        [t("card.formSuperlative"), f.superlative],
      ].filter(([, v]) => !!v) as Array<[string, string]>;
      if (rows.length === 0) return null;
      return (
        // 語形は**表で読む物**。左に名前、右に形。行が短いので
        // 2列に折り返して、縦に伸びるのを抑える。
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-body sm:grid-cols-[auto_1fr_auto_1fr]">
          {rows.map(([label, value]) => (
            <Fragment key={label}>
              <dt className="text-caption text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </Fragment>
          ))}
        </dl>
      );
    }

    case "countability": {
      const c = ex.countability;
      if (!c) return null;
      const KIND_KEY: Record<"countable" | "uncountable" | "both", string> = {
        countable: "card.countable",
        uncountable: "card.uncountable",
        both: "card.countBoth",
      };
      return (
        <div className="space-y-2 text-body">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="inline-block rounded-full bg-secondary px-2.5 py-0.5 text-footnote font-medium shadow-sm ring-1 ring-border">
              {t(KIND_KEY[c.kind])}
            </span>
            {c.article && (
              <span className="text-caption text-muted-foreground">
                {/* 冠詞は**その語に実際に付く形**を出す。「a/an のどちらか」
                    ではなく "an" と書いてあることに意味がある。 */}
                <span className="mr-1.5">{t("card.article")}</span>
                <span className="font-medium text-foreground">{c.article}</span>
              </span>
            )}
          </div>
          {c.note && <Prose text={c.note} />}
        </div>
      );
    }

    case "stress": {
      const st = ex.stress;
      const syl = st?.syllables ?? [];
      if (syl.length === 0) return null;
      return (
        <div className="space-y-2">
          {/* 強勢は**大きさで見せる**。記号(ˈ)を打っても、声調の言語の
              話者には「印が付いている」以上のことが伝わらない。
              強い音節を大きく濃く、弱い音節を小さく薄くして、
              **見た目がそのまま読み方**になるようにする。 */}
          <p className="flex flex-wrap items-baseline gap-x-0.5">
            {syl.map((sy, i) => {
              const primary = st?.primary === i;
              const secondary = st?.secondary === i;
              return (
                <span key={i} className="flex items-baseline">
                  {i > 0 && <span className="mx-0.5 text-muted-foreground">·</span>}
                  <span
                    className={
                      primary
                        ? "text-title font-semibold text-foreground"
                        : secondary
                          ? "text-body font-medium text-foreground"
                          : "text-body text-muted-foreground"
                    }
                  >
                    {sy}
                  </span>
                </span>
              );
            })}
          </p>
          {st?.note && <Prose text={st.note} />}
        </div>
      );
    }

    case "phrasal_verbs":
      return (
        <ul className="space-y-1.5">
          {(ex.phrasal_verbs ?? []).map((pv, i) => (
            <li key={i} className="rounded-xl bg-secondary px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-body font-semibold">{pv.phrase}</span>
                {pv.meaning && (
                  <span className="text-footnote text-muted-foreground">{pv.meaning}</span>
                )}
              </div>
              {pv.example && (
                <p className="mt-1 text-footnote leading-relaxed text-muted-foreground">
                  {pv.example}
                </p>
              )}
            </li>
          ))}
        </ul>
      );

    case "culture_note":
      // 台湾華語のカードの `taiwan_note` にあたる欄。組みは合わせる —
      // 同じ位置の同じ役割の節が、言語で違う見た目になる理由が無い。
      return <Prose text={ex.culture_note ?? ""} />;

    case "web_images":
      return (
        <WebImagesBody
          headword={word.headword}
          meaningJa={word.meaning_ja}
          onPickImage={onPickImage}
        />
      );
    case "real_usage":
      return (
        <>
          <RealUsageBody headword={word.headword} language={word.language} />
        </>
      );
  }
}

/** 量詞1件: 「一張」+読み+発音ボタン+使い分けノート。 */
function MeasureWordRow({
  word,
  zhuyin,
  pinyin,
  note,
}: {
  word: string;
  zhuyin?: string;
  pinyin?: string;
  note?: string;
}) {
  const t = useT();
  const pronounce = usePronounce();
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span lang="zh-Hant" className="text-body font-semibold">
            {word}
          </span>
          <Reading zhuyin={zhuyin} pinyin={pinyin} className="text-caption text-muted-foreground" />
        </span>
        {note && <span className="mt-0.5 block text-caption text-muted-foreground">{note}</span>}
      </span>
      <button
        onClick={() => void pronounce(word)}
        aria-label={t("card.pronOfWord", { word })}
        className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-primary shadow-sm ring-1 ring-border before:absolute before:-inset-1.5 before:content-[''] active:scale-95"
      >
        <Volume2 className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

/**
 * ネットの画像(A10): その単語を最もよく表すWeb画像を**開いた瞬間に**表示する
 * (以前はStickerSheetの折りたたみで、タップしないと出なかった)。
 * 結果は24hキャッシュされるので実コストは初回検索のみ。
 */
function WebImagesBody({
  headword,
  meaningJa,
  onPickImage,
}: {
  headword: string;
  meaningJa: string;
  onPickImage?: (url: string) => void | Promise<void>;
}) {
  const t = useT();
  const searchFn = useServerFn(searchImageCandidates);
  // 「別の画像」を押すたびに検索し直す(seed をキーに入れてキャッシュを外す)。
  const [seed, setSeed] = useState(0);
  const [picking, setPicking] = useState<string | null>(null);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["web-images", headword, seed],
    queryFn: async () =>
      (
        await searchFn({
          data: {
            // **探す言葉の作り方は1箇所**(`hero-image.ts`)。詳細が自動で
            // あてがう絵と、ここで選び直せる絵が別の検索から来ていると、
            // 「変えたのに似た絵しか出ない」の理由が読めなくなる。
            query:
              seed === 0
                ? heroSearchQuery({ headword, meaning: meaningJa })
                : `${heroSearchQuery({ headword, meaning: meaningJa })} ${headword}`,
          },
        })
      ).candidates,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const all: ImageCandidate[] = data ?? [];
  // 再検索のたびに違う3枚を見せる(候補は最大6件返る)。
  const offset = seed % Math.max(1, Math.ceil(all.length / 3));
  const candidates = all.slice(offset * 3, offset * 3 + 3);
  const shown = candidates.length > 0 ? candidates : all.slice(0, 3);

  async function pick(url: string) {
    if (!onPickImage || picking) return;
    setPicking(url);
    try {
      await onPickImage(url);
    } finally {
      setPicking(null);
    }
  }

  return (
    <div>
      {isLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-secondary" />
          ))}
        </div>
      ) : shown.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {shown.map((c, i) => (
            <figure
              key={`${c.url}-${i}`}
              className="relative aspect-square overflow-hidden rounded-xl bg-secondary"
            >
              <img
                src={c.url}
                alt={`${headword} ${i + 1}`}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              {onPickImage && (
                <button
                  onClick={() => void pick(c.url)}
                  disabled={picking !== null}
                  className="absolute inset-0 grid place-items-center bg-black/0 text-caption font-semibold text-white opacity-0 transition-opacity active:bg-black/45 active:opacity-100"
                  aria-label={t("card.useThisImage")}
                >
                  {picking === c.url ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("card.useThisImage")
                  )}
                </button>
              )}
              {c.credit?.name && (
                <figcaption className="pointer-events-none absolute bottom-0 inset-x-0 truncate bg-black/50 px-1 text-caption text-white">
                  📷 {c.credit.name}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      ) : (
        <p className="text-footnote text-muted-foreground">{t("card.noImages")}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          onClick={() => setSeed((v) => v + 1)}
          disabled={isFetching}
          className="relative inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-caption font-medium shadow-sm ring-1 ring-border before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[''] active:scale-95 disabled:opacity-60"
        >
          {isFetching ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {t("card.otherImages")}
        </button>
        <a
          href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(headword)}`}
          target="_blank"
          rel="noreferrer"
          className="relative inline-flex items-center gap-1 text-footnote text-primary-ink underline before:absolute before:-inset-x-1 before:-inset-y-3.5 before:content-['']"
        >
          {t("card.searchGoogle")} <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      {onPickImage && (
        <p className="mt-1 text-caption text-muted-foreground">
          {t("card.useThisImage")} — {t("card.changePhoto")}
        </p>
      )}
    </div>
  );
}

/**
 * 実際の使われ方(A10): 動画・SNS・辞書・ニュースの中で本当に使われている
 * 「生きた用例」へ直接ジャンプ。全部外部リンクなのでコストゼロ。
 *
 * **行き先の一覧はここに書かない**(`real-usage-links.ts`)。以前は
 * 台湾向けの URL 7本がこの中に直に書いてあり、英語を学習言語に足した日に
 * **英語の語を調べるボタンが台湾のサイトへ飛ぶ**状態になった
 * (絵で見つけた: 「台湾の若者のSNS」「台湾教育部の公式辞書」が
 * 英語のカードに7本並んでいた)。
 */
function RealUsageBody({ headword, language }: { headword: string; language?: string | null }) {
  const t = useT();
  const uiLang = useUiLang();
  const links = realUsageLinks(headword, language, uiLang);
  return (
    <ul className="grid grid-cols-1 gap-1.5">
      {links.map((l) => (
        <li key={l.id}>
          <a
            href={l.href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2.5 rounded-xl bg-secondary px-3 py-2 text-body shadow-sm ring-1 ring-border transition-colors active:bg-secondary"
          >
            <span className="text-body">{l.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{t(l.labelKey)}</span>
              <span className="block truncate text-caption text-muted-foreground">
                {t(l.hintKey)}
              </span>
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </a>
        </li>
      ))}
    </ul>
  );
}
