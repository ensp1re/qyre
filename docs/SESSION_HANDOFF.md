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
- F146 rounds 1-2 (pushed, PR #160): restored CellValue affordances and introduced whole-cell
  selection, inline scalar editing, single-active-editor coordination, keyboard navigation,
  copy/paste/undo/null shortcuts, staged commit, fixed columns, and structured editor expansion.
- F146 rounds 3-5: refined whole-cell edit emphasis, nullable/URL/long-text/loading behavior,
  shared boolean and timestamp-calendar controls, adaptive labels, cross-cell dismissal, and the
  non-executing Explain-only SQL action.
- F146 round 6: JSON and supported-array editing now opens directly in the established right-side
  drawer for existing and inserted rows. The mutation surface names the column once and keeps only
  the full-value editor, Format, validation, nullable selection, Cancel, and Apply; the intermediate
  popover, Expand step, duplicated type/value labels, helper copy, Minify, and Copy are removed.
- F146 round 7: successful mutation/DDL/destructive SQL now invalidates catalog, selected-table,
  and row caches so created tables appear in the sidebar without reload. PostgreSQL `bytea`, `bit`,
  `bit varying`, `inet`/network, and XML are mutation-safe: binary uses validated hex converted to a
  bound Buffer, bit strings preserve leading zeroes, network/XML bind exact text, and binary/XML use
  the streamlined right-side drawer. The same binary contract is live-verified for MySQL blob and
  SQLite BLOB; MongoDB remains whole-document EJSON.
- F146 round 8: date, time, time-with-time-zone, timestamp, and PostgreSQL interval values now keep
  exact editable text; interval uses the right drawer instead of a parsed object. JSON drawers are
  viewport-bounded with Format/Minify/Copy and fixed Apply/Cancel actions. Binary editing now uses
  grouped hex, accepts prefixes/whitespace, reports byte count, previews ASCII, and appears as
  `bytes` in grid/filter chrome while preserving the schema's real type. PostgreSQL JSON/native
  arrays, MySQL JSON, and MongoDB objects/arrays gained native `contains` filters; enum equality
  filters reuse the enum selector. SQLite structured containment remains explicitly unavailable.

## In progress

- Round 8 is pushed as `bdf2667` to draft PR #160. Focused core/server/UI and driver
  unit/live-integration suites pass. Focused PostgreSQL
  browser E2E proves date/time/time-zone/interval/binary persistence, and 1280x720 visual QA proves
  JSON and bytes editor utilities plus Apply/Cancel remain visible. Full local `pnpm verify:pr`
  passes 34/34 package tasks, 11 smoke E2E with four expected skips, and 30 full E2E with 47
  expected skips, locally and in the pre-push hook. Current step: wait for GitHub Actions credits,
  rerun CI, and move F146 to passing after both jobs succeed.

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
