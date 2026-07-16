# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-16.
- Branch: `feature/F147-table-qa-keyboard-fixes`.
- Queue: DF-10 through DF-12 and F146 are passing. F147 is active for defects found by the
  post-merge Tables UX smoke QA. DF-13 remains next after F147.

## Completed

- DF-10 through DF-12 (audit, editing integrity, shared typed editors) are passing and merged.
- F146 merged in PR #160 as `ed44633`. Rounds 1-5 added whole-cell scalar editing, stable
  selection, keyboard/copy/paste/undo,
  staged commits, single-editor coordination, responsive controls, and Explain-only SQL behavior.
- Rounds 6-8: compact validated drawers for structured/binary/XML/interval values, lossless temporal
  editing, cross-engine byte handling, enum selectors, containment filters, and post-write refresh.
- Rounds 9-11: stable long-text geometry, plain substring SQL JSON/array filters, invalid-Apply
  blocking, legacy interval normalization, and insert-safe binary duplication.
- Rounds 12-16: shared MongoDB grid writes and BSON editors, stable ObjectId compatibility, and
  live-value click-away staging. Local and pre-push gates passed; hosted jobs could not start
  because GitHub Actions credits were exhausted.

## In progress

- F147 is reproducing and fixing the smoke-QA findings: render-lagged keyboard staging in inline
  cells and filter inputs, top-level filter Escape behavior, and SQLite declared-BOOLEAN display.
  UI tests pass 426/426, five focused PostgreSQL browser journeys pass, and the Node 22 full local
  PR gate passes with 34/34 package tasks, smoke E2E (11 passed, 4 skipped), and full E2E (32
  passed, 55 skipped). Draft PR #161 is pushed as `e1eff8d`; both hosted jobs fail before steps
  because GitHub Actions credits remain exhausted.

## Known issues / blockers

- Repository verification must use Node 22; Node 24+ cannot load the current `better-sqlite3` native
  binding.
- UI Preview and E2E must rebuild `@qyre/ui` before `@qyre/web` because web consumes UI `dist/`; the
  CLI (`@qyre/qyre`) also bundles a copy of `apps/web/dist` into its own `dist/web` at build time
  (F010) - rebuild `@qyre/qyre` too after changing `apps/web`, or a running `qyre <target>` session
  will keep serving the stale bundled copy instead of the fresh one.
- Docker may require `/Applications/Docker.app/Contents/Resources/bin/docker` explicitly on macOS.
- GitHub Actions credits remain exhausted; PRs #160 and #161 both have hosted jobs that fail before
  running any steps. Local and pre-push `pnpm verify:pr` are the available verification evidence.
- Deferred by explicit scoping decision, not oversight: full column resize/reorder/frozen columns,
  a complete toolbar regroup into 4 sections with an overflow menu (only a light-touch separator was
  added), full drag-to-select multi-cell copy/paste (only single-cell and best-effort TSV-block
  paste from one anchor cell are implemented), and JSON syntax highlighting (kept plain monospace
  with inline validation errors instead). Revisit only if explicitly requested - the grid-editing
  interaction model was the higher-impact target per the audit's own prioritization.

## Next steps

- When GitHub Actions credits return, rerun CI on PR #161; after it passes, move F147 to `passing`.
- After F147 passes, return to `main` and activate DF-13, the guided Add/Duplicate row composer.
