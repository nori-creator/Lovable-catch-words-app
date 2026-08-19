import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { Lock, Sparkles } from "lucide-react";
import {
  buildBranchPlan,
  parseBranchPlan,
  resolveBranches,
  type Branch,
  type BranchType,
} from "@/lib/wordtree";
import type { WordExtras } from "@/components/WordCard";
import { useT } from "@/lib/i18n";

/**
 * §6 word tree: the card is a tree — your photo at the center, one branch
 * growing per completed review. Locked branches show as 🔒 so the next
 * review has a visible reward. Sibling words (synonyms/antonyms) stay
 * locked until the 5th unlock to avoid semantic interference.
 *
 * Visual: soft radial "canopy" background, gradient branch lines that grow
 * from the trunk, and a gentle grow-in for the branch just unlocked.
 */

/**
 * 枝の札の色。**素の Tailwind の番号をやめてトークンにする。**
 *
 * `bg-sky-50 text-sky-900` のような番号は**明るい面の前提で固定**されていて、
 * 暗いテーマに一切追従しない(この repo で何度も潰してきた形)。実際、
 * 暗い面では木の上だけ near-white の札が光っていた。
 * `--tree-*` は明暗それぞれで定義してあり、塗りと文字は `.tree-pill` が
 * 1つの変数から導くので、片方だけずれることが無い(`.chunk-pill` と同じ形)。
 */
const TYPE_STYLE: Record<BranchType, string> = {
  collocation: "tree-pill tree-collocation",
  example: "tree-pill tree-example",
  synonym: "tree-pill tree-synonym",
  antonym: "tree-pill tree-antonym",
};

const TYPE_STROKE: Record<BranchType, string> = {
  collocation: "hsl(199 89% 55%)",
  example: "hsl(160 70% 45%)",
  synonym: "hsl(262 70% 60%)",
  antonym: "hsl(346 78% 60%)",
};

/** 枝の種類。表示言語に追従させるため翻訳キーを持つ。 */
const TYPE_LABEL_KEY: Record<BranchType, string> = {
  collocation: "tree.collocation",
  example: "tree.example",
  synonym: "tree.synonym",
  antonym: "tree.antonym",
};

type Props = {
  headword: string;
  photoUrl: string | null;
  emoji: string | null;
  branchPlanRaw: unknown;
  extras: WordExtras | null | undefined;
  reviewCount: number;
};

export function WordTreeView({
  headword,
  photoUrl,
  emoji,
  branchPlanRaw,
  extras,
  reviewCount,
}: Props) {
  const t = useT();
  const plan: Branch[] = parseBranchPlan(branchPlanRaw) ?? buildBranchPlan(extras ?? undefined);
  if (plan.length === 0) return null;

  const { unlocked, lockedCount } = resolveBranches(plan, reviewCount);
  const justUnlockedIndex = unlocked.length - 1; // latest branch — grows in with a flourish

  const slots = Math.min(8, unlocked.length + (lockedCount > 0 ? 1 : 0));
  const nodes: Array<{ kind: "branch"; branch: Branch } | { kind: "lock" }> = [
    ...unlocked
      .slice(0, lockedCount > 0 ? 7 : 8)
      .map((b) => ({ kind: "branch" as const, branch: b })),
    ...(lockedCount > 0 ? [{ kind: "lock" as const }] : []),
  ];

  const R = 40; // % radius from center

  /**
   * 枝の位置と、**札をどちらへ伸ばすか**。
   *
   * ## なぜ寄せ方まで決めるか
   * 以前は全部 `-translate-x-1/2 -translate-y-1/2` で点の上に中央合わせして
   * いた。枝が1本しか無いと真上(y=10%)に置かれ、**長い札は上へはみ出して
   * 「ワードツリー」の見出しと、その上のカードまで覆っていた**
   * (検査に入れて初めて写った。実測でも見出しのコントラストが 1.03 =
   * 完全に隠れている、と出た)。
   *
   * 円周上の点から**中心へ向かって伸ばす**ように寄せ方を決めれば、
   * 札の大きさが幾つでも枠から出ない。上の点なら上端を、下の点なら下端を、
   * 右の点なら右端を、その点に合わせる。
   */
  const pos = (i: number) => {
    const angle = (Math.PI * 2 * i) / slots - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: 50 + R * cos,
      y: 50 + R * sin,
      // cos=1(右) → -100%(右端を合わせる) / cos=-1(左) → 0%(左端)
      // cos=0(上下) → -50%(中央)
      tx: -50 - 50 * cos,
      ty: -50 - 50 * sin,
    };
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-body font-semibold tracking-tight">{t("tree.title")}</h2>
        <span className="text-caption text-muted-foreground">
          {t("tree.branches", { done: unlocked.length, total: plan.length })}
        </span>
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-sm">
        {/* soft canopy glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full opacity-70"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 10%, transparent), transparent 70%)",
          }}
        />

        {/* branch lines with a subtle gradient toward the tip */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden>
          <defs>
            {nodes.map((n, i) => {
              const stroke = n.kind === "branch" ? TYPE_STROKE[n.branch.type] : "hsl(0 0% 60%)";
              return (
                <linearGradient
                  key={i}
                  id={`branch-${i}`}
                  x1="50%"
                  y1="50%"
                  x2={`${pos(i).x}%`}
                  y2={`${pos(i).y}%`}
                >
                  <stop offset="0%" stopColor={stroke} stopOpacity="0.05" />
                  <stop offset="100%" stopColor={stroke} stopOpacity="0.75" />
                </linearGradient>
              );
            })}
          </defs>
          {nodes.map((n, i) => {
            const p = pos(i);
            const isLock = n.kind === "lock";
            const isJust = !isLock && i === justUnlockedIndex;
            return (
              <line
                key={i}
                x1="50"
                y1="50"
                x2={p.x}
                y2={p.y}
                stroke={`url(#branch-${i})`}
                strokeWidth={isJust ? 1.3 : 0.9}
                strokeLinecap="round"
                strokeDasharray={isLock ? "1.5 2" : undefined}
                style={
                  isJust
                    ? {
                        strokeDasharray: 60,
                        strokeDashoffset: 60,
                        animation: "wt-grow 900ms ease-out forwards",
                      }
                    : undefined
                }
              />
            );
          })}
        </svg>

        {/* center: your photo — soft ring pulse if there's a fresh unlock */}
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="relative mx-auto h-24 w-24">
            {justUnlockedIndex >= 0 && reviewCount > 0 && reviewCount <= plan.length && (
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-2 rounded-full"
                style={{
                  background:
                    "conic-gradient(from 0deg, color-mix(in oklab, var(--primary) 35%, transparent), transparent 60%, color-mix(in oklab, var(--primary) 35%, transparent))",
                  animation: "wt-spin 6s linear infinite",
                  filter: "blur(6px)",
                }}
              />
            )}
            <div className="relative grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-secondary shadow-lg ring-4 ring-background">
              {photoUrl ? (
                <img src={photoUrl} alt={headword} className="h-full w-full object-cover" />
              ) : (
                <span
                  lang="zh-Hant"
                  className="px-1 text-center text-body font-semibold text-muted-foreground"
                >
                  {emoji ?? headword}
                </span>
              )}
            </div>
          </div>
          <div lang="zh-Hant" className="mt-1 text-body font-bold tracking-tight">
            {headword}
          </div>
        </div>

        {/* branches */}
        {nodes.map((n, i) => {
          const p = pos(i);
          // 寄せ方は**変数で渡す**。登場の keyframes が `transform` を
          // 丸ごと上書きするので、`translate(-50%,-50%)` と書き込んで
          // あった間は、**いま生えたばかりの枝だけ寄せ方が消えて**
          // 中央合わせに戻り、上の「枝 1/1 本」に重なっていた。
          const style = {
            left: `${p.x}%`,
            top: `${p.y}%`,
            "--wt-tx": `${p.tx}%`,
            "--wt-ty": `${p.ty}%`,
            transform: `translate(${p.tx}%, ${p.ty}%)`,
          } as CSSProperties;
          if (n.kind === "lock") {
            return (
              <div key={i} style={style} className="absolute z-10 text-center">
                <div className="relative mx-auto grid h-10 w-10 place-items-center rounded-full border border-dashed border-border bg-secondary/70 text-muted-foreground backdrop-blur-sm">
                  <Lock className="h-4 w-4" />
                  <Sparkles className="absolute -right-1 -top-1 h-3 w-3 text-primary/70 animate-pulse" />
                </div>
                <div className="mt-0.5 whitespace-nowrap text-caption text-muted-foreground">
                  {t("tree.locked", { n: lockedCount })}
                </div>
              </div>
            );
          }
          const b = n.branch;
          const isJust = i === justUnlockedIndex;
          return (
            <Link
              key={i}
              to="/capture"
              search={{ word: b.zh }}
              style={{
                ...style,
                animation: isJust
                  ? "wt-bud 700ms cubic-bezier(0.34, 1.56, 0.64, 1) 300ms both"
                  : undefined,
              }}
              className={`absolute z-10 flex max-w-[38%] flex-col gap-0.5 rounded-2xl px-2.5 py-1.5 text-center shadow-sm ring-1 active:scale-95 ${TYPE_STYLE[b.type]}`}
            >
              {/* **行数を止める。** 札の高さが伸びるほど枠からはみ出しやすく
                  なるので、原文も訳も2行までにする(続きは開いた先で読む)。
                  中央揃えのまま折り返すと行頭が毎行ずれるので、
                  `text-balance` で行の長さを揃える。 */}
              <span
                lang="zh-Hant"
                className="line-clamp-2 text-balance text-footnote font-semibold leading-tight"
              >
                {b.zh}
              </span>
              {b.ja && <span className="line-clamp-2 text-balance text-caption">{b.ja}</span>}
              {/* 不透明度で薄くしない。**塗りと文字が一緒に薄くなって読めなく
                  なる**(押せないボタンで直したのと同じ話)。控えめさは
                  大きさと字間で出す。 */}
              <span className="text-caption tracking-wide">{t(TYPE_LABEL_KEY[b.type])}</span>
            </Link>
          );
        })}
      </div>

      <p className="mt-1 text-center text-caption text-muted-foreground">{t("tree.tapHint")}</p>

      <style>{`
        @keyframes wt-grow { to { stroke-dashoffset: 0; } }
        @keyframes wt-bud {
          0% { opacity: 0; transform: translate(var(--wt-tx), var(--wt-ty)) scale(0.4); }
          100% { opacity: 1; transform: translate(var(--wt-tx), var(--wt-ty)) scale(1); }
        }
        @keyframes wt-spin { to { transform: rotate(360deg); } }
      `}</style>
    </section>
  );
}
