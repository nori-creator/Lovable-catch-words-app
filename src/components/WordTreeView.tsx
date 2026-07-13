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

/**
 * §6 word tree: the card is a tree — your photo at the center, one branch
 * growing per completed review. Locked branches show as 🔒 so the next
 * review has a visible reward. Sibling words (synonyms/antonyms) stay
 * locked until the 5th unlock to avoid semantic interference.
 *
 * Visual: soft radial "canopy" background, gradient branch lines that grow
 * from the trunk, and a gentle grow-in for the branch just unlocked.
 */

const TYPE_STYLE: Record<BranchType, string> = {
  collocation: "bg-sky-50 text-sky-900 ring-sky-200/70 shadow-sky-500/10",
  example:     "bg-emerald-50 text-emerald-900 ring-emerald-200/70 shadow-emerald-500/10",
  synonym:     "bg-violet-50 text-violet-900 ring-violet-200/70 shadow-violet-500/10",
  antonym:     "bg-rose-50 text-rose-900 ring-rose-200/70 shadow-rose-500/10",
};

const TYPE_STROKE: Record<BranchType, string> = {
  collocation: "hsl(199 89% 55%)",
  example:     "hsl(160 70% 45%)",
  synonym:     "hsl(262 70% 60%)",
  antonym:     "hsl(346 78% 60%)",
};

const TYPE_LABEL: Record<BranchType, string> = {
  collocation: "つながり",
  example: "例文",
  synonym: "類義",
  antonym: "反義",
};

type Props = {
  headword: string;
  photoUrl: string | null;
  emoji: string | null;
  branchPlanRaw: unknown;
  extras: WordExtras | null | undefined;
  reviewCount: number;
};

export function WordTreeView({ headword, photoUrl, emoji, branchPlanRaw, extras, reviewCount }: Props) {
  const plan: Branch[] = parseBranchPlan(branchPlanRaw) ?? buildBranchPlan(extras ?? undefined);
  if (plan.length === 0) return null;

  const { unlocked, lockedCount } = resolveBranches(plan, reviewCount);
  const justUnlockedIndex = unlocked.length - 1; // latest branch — grows in with a flourish

  const slots = Math.min(8, unlocked.length + (lockedCount > 0 ? 1 : 0));
  const nodes: Array<{ kind: "branch"; branch: Branch } | { kind: "lock" }> = [
    ...unlocked.slice(0, lockedCount > 0 ? 7 : 8).map((b) => ({ kind: "branch" as const, branch: b })),
    ...(lockedCount > 0 ? [{ kind: "lock" as const }] : []),
  ];

  const R = 40; // % radius from center
  const pos = (i: number) => {
    const angle = (Math.PI * 2 * i) / slots - Math.PI / 2;
    return { x: 50 + R * Math.cos(angle), y: 50 + R * Math.sin(angle) };
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-tight">ワードツリー</h2>
        <span className="text-[11px] text-muted-foreground">
          枝 {unlocked.length}/{plan.length} 本 · 復習ごとに1本育つ
        </span>
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-sm">
        {/* soft canopy glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full opacity-70"
          style={{
            background:
              "radial-gradient(closest-side, hsl(var(--primary) / 0.10), transparent 70%)",
          }}
        />

        {/* branch lines with a subtle gradient toward the tip */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden>
          <defs>
            {nodes.map((n, i) => {
              const stroke = n.kind === "branch" ? TYPE_STROKE[n.branch.type] : "hsl(0 0% 60%)";
              return (
                <linearGradient key={i} id={`branch-${i}`} x1="50%" y1="50%" x2={`${pos(i).x}%`} y2={`${pos(i).y}%`}>
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
                    "conic-gradient(from 0deg, hsl(var(--primary) / 0.35), transparent 60%, hsl(var(--primary) / 0.35))",
                  animation: "wt-spin 6s linear infinite",
                  filter: "blur(6px)",
                }}
              />
            )}
            <div className="relative grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-secondary shadow-lg ring-4 ring-background">
              {photoUrl ? (
                <img src={photoUrl} alt={headword} className="h-full w-full object-cover" />
              ) : (
                <span className="text-4xl">{emoji ?? "📦"}</span>
              )}
            </div>
          </div>
          <div className="mt-1 text-sm font-bold tracking-tight">{headword}</div>
        </div>

        {/* branches */}
        {nodes.map((n, i) => {
          const p = pos(i);
          const style = { left: `${p.x}%`, top: `${p.y}%` };
          if (n.kind === "lock") {
            return (
              <div
                key={i}
                style={style}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2 text-center"
              >
                <div className="relative mx-auto grid h-10 w-10 place-items-center rounded-full border border-dashed border-border bg-secondary/70 text-muted-foreground backdrop-blur-sm">
                  <Lock className="h-4 w-4" />
                  <Sparkles className="absolute -right-1 -top-1 h-3 w-3 text-primary/70 animate-pulse" />
                </div>
                <div className="mt-0.5 whitespace-nowrap text-[10px] text-muted-foreground">
                  あと{lockedCount}本 · 復習で解禁
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
              className={`absolute z-10 max-w-[38%] -translate-x-1/2 -translate-y-1/2 rounded-2xl px-2.5 py-1.5 text-center shadow-sm ring-1 backdrop-blur-sm transition-transform hover:-translate-y-[calc(50%+1px)] active:scale-95 ${TYPE_STYLE[b.type]}`}
            >
              <span className="block text-[13px] font-semibold leading-tight">{b.zh}</span>
              {b.ja && <span className="block text-[9px] opacity-80">{b.ja}</span>}
              <span className="block text-[8px] uppercase tracking-wide opacity-60">{TYPE_LABEL[b.type]}</span>
            </Link>
          );
        })}
      </div>

      <p className="mt-1 text-center text-[10px] text-muted-foreground">
        枝をタップすると、その言葉を新しい木としてキャッチできます
      </p>

      <style>{`
        @keyframes wt-grow { to { stroke-dashoffset: 0; } }
        @keyframes wt-bud {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes wt-spin { to { transform: rotate(360deg); } }
      `}</style>
    </section>
  );
}
