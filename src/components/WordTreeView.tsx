import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
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
 */

const TYPE_STYLE: Record<BranchType, string> = {
  collocation: "bg-sky-50 text-sky-900 ring-sky-200",
  example: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  synonym: "bg-violet-50 text-violet-900 ring-violet-200",
  antonym: "bg-rose-50 text-rose-900 ring-rose-200",
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
  // Frozen plan preferred; legacy stickers derive one from extras on the fly.
  const plan: Branch[] = parseBranchPlan(branchPlanRaw) ?? buildBranchPlan(extras ?? undefined);
  if (plan.length === 0) return null;

  const { unlocked, lockedCount } = resolveBranches(plan, reviewCount);

  // Radial layout: up to 8 slots around the center.
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
        <h2 className="text-sm font-semibold">ワードツリー</h2>
        <span className="text-[11px] text-muted-foreground">
          枝 {unlocked.length}/{plan.length} 本 · 復習するたびに1本育つ
        </span>
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-sm">
        {/* branch lines */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden>
          {nodes.map((_, i) => {
            const p = pos(i);
            return (
              <line
                key={i}
                x1="50"
                y1="50"
                x2={p.x}
                y2={p.y}
                stroke="hsl(var(--border))"
                strokeWidth="0.8"
                strokeDasharray={nodes[i].kind === "lock" ? "2 2" : undefined}
              />
            );
          })}
        </svg>

        {/* center: your photo */}
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="mx-auto grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-secondary shadow-lg ring-4 ring-background">
            {photoUrl ? (
              <img src={photoUrl} alt={headword} className="h-full w-full object-cover" />
            ) : (
              <span className="text-4xl">{emoji ?? "📦"}</span>
            )}
          </div>
          <div className="mt-1 text-sm font-bold">{headword}</div>
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
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-full border border-dashed border-border bg-secondary/70 text-muted-foreground">
                  <Lock className="h-4 w-4" />
                </div>
                <div className="mt-0.5 whitespace-nowrap text-[10px] text-muted-foreground">
                  あと{lockedCount}本 · 復習で解禁
                </div>
              </div>
            );
          }
          const b = n.branch;
          return (
            <Link
              key={i}
              to="/capture"
              search={{ word: b.zh }}
              style={style}
              className={`absolute z-10 max-w-[38%] -translate-x-1/2 -translate-y-1/2 rounded-2xl px-2.5 py-1.5 text-center shadow-sm ring-1 transition-transform active:scale-95 ${TYPE_STYLE[b.type]}`}
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
    </section>
  );
}
