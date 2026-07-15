# Save Scan-First MVP spec as the formal source of truth

## 1. Save the uploaded spec
- Copy `user-uploads://catchwords-master-spec-v2_1.md` → `docs/design/06-scan-first-mvp.md` (verbatim, no edits).

## 2. Update `docs/design/README.md`
- Add a prominent banner at the top: **「本プロジェクトの正式仕様は [`06-scan-first-mvp.md`](./06-scan-first-mvp.md)。`01`〜`05` と矛盾する場合は 06 を優先する。」**
- Add `06-scan-first-mvp.md` to the 目次 table as the first row, labeled as *Source of Truth (Scan-First MVP v2)*.

## 3. Update project memory (`mem://index.md`)
Bootstrap the index (no memories exist yet) with:
- **Core rule**: `docs/design/06-scan-first-mvp.md` is the formal source of truth for Catchwords; on conflict with `01`〜`05`, 06 wins. Scan-first (かざす=調べる/撮る=残す), MVP = 台湾在住日本人 (zh-TW × ja).
- **Memories reference entry**: link to `docs/design/06-scan-first-mvp.md` describing it as the Scan-First MVP v2 spec (scope, phases, acceptance criteria, Lovable prompt copy).

## 4. No implementation
No feature code, DB migrations, or component changes in this turn. Implementation happens later, one phase per message per the spec's §8.
