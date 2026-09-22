<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## CatchWords source of truth

Before planning or implementing CatchWords product work, read these files in the repository root:

1. `PRODUCT.md` — current product concept and approved Web MVP behavior.
2. `ROADMAP.md` — authoritative execution order and resume procedure.
3. `ARCHITECTURE.md` — architecture/refactor/data/AI guardrails.
4. `QA.md` — behavior that must survive cleanup and release gates.

Files under `docs/design` may contain valuable historical context, but they are **not authoritative when they conflict with the four root source-of-truth files above**.

If the user starts a fresh ChatGPT/Codex/Work session and says **“CatchWords開発再開。ロードマップ通り進めて”**, do not ask them to reconstruct prior discussions. Read the source-of-truth files, inspect the latest `main` and open PRs, determine the earliest unfinished roadmap phase from repository evidence, and continue from there.

The repository has accumulated repeated vibe-coding iterations. Cleanup is desired, but preserving current implemented behavior is more important than deleting code. Characterize/test behavior before replacing or deleting uncertain legacy paths.

## UI / UX preview workflow

The user is a non-technical product owner. UI/UX review must therefore be visual and require as few manual developer steps as possible.

When a task changes UI, UX, layout, styling, motion, animation, transitions, camera/capture experiences, or other user-visible screens:

1. Do not merge the work merely to let the user inspect it.
2. Work on a feature branch and keep/open a pull request against `main`.
3. Ensure the changed experience is represented in `scripts/ui-harness` and can be built with:
   `npx vite build --config scripts/ui-harness/vite.config.ts`
4. Make the UI harness open the primary screen changed by the task by default whenever practical. Do not require the user to discover or manually type a `?scene=...` query parameter just to see the change.
5. If multiple design alternatives were requested, expose them together in the harness with an obvious A/B/C (or equivalent) selector so they can be compared from one Deploy Preview.
6. Keep preview fixtures deterministic and independent of production authentication/backend state whenever practical, so design review does not get blocked by login.
7. Before handing off, verify the harness build succeeds and push the branch so Netlify can generate/update the pull request Deploy Preview.
8. In the PR summary, identify the exact screen/interaction to review and mention that the Netlify Deploy Preview is the review target.
9. Do not merge until the user has visually approved the result.

Netlify is configured by `netlify.toml` to build the UI harness for deploy previews. A normal push to the PR branch should therefore refresh the same PR's Netlify Deploy Preview automatically.
