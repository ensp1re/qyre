# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-16.
- Branch: `feature/F146-grid-editing-ux-polish`; draft PR #160 contains F146.
- Queue: DF-10 through DF-12 are passing. F146 is active, continuing the same 0007 audit plan on
  the grid-editing surface. DF-13 (guided Add/Duplicate row composer) is next after F146.

## Completed

- DF-10 through DF-12 (audit, editing integrity, shared typed editors) are passing and merged.
- F146 rounds 1-5 (PR #160): whole-cell scalar editing, stable selection, keyboard/copy/paste/undo,
  staged commits, single-editor coordination, responsive controls, and Explain-only SQL behavior.
- Rounds 6-8: compact validated drawers for structured/binary/XML/interval values, lossless temporal
  editing, cross-engine byte handling, enum selectors, containment filters, and post-write refresh.
- Rounds 9-11: stable long-text geometry, plain substring SQL JSON/array filters, invalid-Apply
  blocking, legacy interval normalization, and insert-safe binary duplication.
- Rounds 12-16: shared MongoDB grid writes and BSON editors, stable ObjectId compatibility, and
  live-value click-away staging. Delivered to draft PR #160 as `b06a89d`; local and pre-push gates
  pass.

## In progress

- F146 remains active only because draft PR #160 cannot obtain hosted CI results while GitHub
  Actions credits are unavailable. The implementation is pushed as `b06a89d` and its local and
  pre-push verification is green.

## Known issues / blockers

- Repository verification must use Node 22; Node 24+ cannot load the current `better-sqlite3` native
  binding.
- UI Preview and E2E must rebuild `@qyre/ui` before `@qyre/web` because web consumes UI `dist/`; the
  CLI (`@qyre/qyre`) also bundles a copy of `apps/web/dist` into its own `dist/web` at build time
  (F010) - rebuild `@qyre/qyre` too after changing `apps/web`, or a running `qyre <target>` session
  will keep serving the stale bundled copy instead of the fresh one.
- Docker may require `/Applications/Docker.app/Contents/Resources/bin/docker` explicitly on macOS.
- GitHub Actions credits are exhausted, so PR #160 cannot currently obtain CI results; local
  `pnpm verify:pr` is the available verification evidence.
- Deferred by explicit scoping decision, not oversight: full column resize/reorder/frozen columns,
  a complete toolbar regroup into 4 sections with an overflow menu (only a light-touch separator was
  added), full drag-to-select multi-cell copy/paste (only single-cell and best-effort TSV-block
  paste from one anchor cell are implemented), and JSON syntax highlighting (kept plain monospace
  with inline validation errors instead). Revisit only if explicitly requested - the grid-editing
  interaction model was the higher-impact target per the audit's own prioritization.

## Next steps

- When GitHub Actions credits return, run CI on PR #160; after it passes, record the PR/commit, move
  F146 to `passing`, and run `pnpm features:prune`.
- Then return to `main` and activate DF-13, the guided Add/Duplicate row composer.
