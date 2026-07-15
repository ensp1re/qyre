# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-15.
- Branch: `feature/F146-grid-editing-ux-polish`, based on `main` at `fcab56c` (DF-12 merged in #159).
  Draft PR #160 already open against this branch from round 1; round 2 (this session) adds a second
  commit to the same PR, not a new one.
- Queue: DF-10 through DF-12 are passing. F146 is active, continuing the same 0007 audit plan on
  the grid-editing surface. DF-13 (guided Add/Duplicate row composer) is next after F146.

## Completed

- DF-10 through DF-12 (audit, editing integrity, shared typed editors) are passing and merged.
- F146 round 1 (pushed, PR #160): restored CellValue's UTC/long-string/URL affordances on editable
  columns, a single-active-editor coordinator, the missing timestamp/time widget, JSON/long-text in
  a drawer, table-layout:fixed column truncation, and icon-only EditorActions.
- F146 round 2 (this session, a DataGrip-inspired rework requested after seeing round 1 - not yet
  committed): reworked the interaction model so a single click selects a cell (visual only) and
  double-click/Enter/F2 edits it; added `InlineCellEditor` so text/number/uuid/boolean/enum/date/
  timestamp/time edit directly in the cell with no popover chrome, committing on Enter (advances
  selection down)/Tab (advances right, wrapping rows)/Shift+Tab, cancelling on Escape; reverted
  JSON/array/set/long-text (now ~300-char threshold) to a small anchored popover by default (Format/
  Minify/Copy actions), with an explicit "Expand" action opening the full `CellEditorDrawer` only on
  request; slimmed the timestamp editor to a plain precise-text field plus an optional compact
  calendar/time picker that only ever splices the date+HH:MM prefix, never touching any existing
  seconds/fraction/offset tail; added grid-level keyboard shortcuts (arrows move selection, Tab/
  Shift+Tab across editable cells, Escape clears selection, Delete/Backspace stages NULL, Ctrl/Cmd+Z
  reverts the selected cell, Ctrl/Cmd+C copies, Ctrl/Cmd+V pastes single/TSV values with per-cell
  type validation) plus a page-level Ctrl/Cmd+S commit shortcut in `tables-tab.tsx`; a subtle
  left-accent dirty-cell border instead of a filled background; explicit `""` vs `null` rendering;
  and a prominent green `CommitBar` Commit button. Found and fixed two real bugs during live
  verification: the inline NULL chip had no Escape-to-cancel handler, and the timestamp picker's
  toggle button blurred (and thus committed) the input before its own click ran, staging a spurious
  no-op edit - fixed with `onMouseDown` `preventDefault` plus a general "unchanged draft never
  stages" guard in `InlineCellEditor`.

## In progress

- Round 2 needs a commit and push onto the existing `feature/F146-grid-editing-ux-polish` branch/PR
  #160. Not yet done as of this handoff.

## Known issues / blockers

- Full `pnpm verify:pr` on this machine reaches 34/34 package typecheck/test/build tasks and all
  `check:state` checks, but the SQLite E2E `webServer` fails to start: `better-sqlite3` was built
  for `NODE_MODULE_VERSION 127`, this machine runs Node 26 (`147`). Same pre-existing Node-22-only
  constraint below, not a regression from F146. CI runs the correct Node version, so this should
  pass there. The user has already explicitly approved pushing with `--no-verify` for this specific,
  pre-existing environment gap once this session; re-confirm before relying on that again in a new
  session rather than assuming it carries over.
- Repository verification must use Node 22; Node 24+ cannot load the current `better-sqlite3` native
  binding.
- UI Preview and E2E must rebuild `@qyre/ui` before `@qyre/web` because web consumes UI `dist/`; the
  CLI (`@qyre/qyre`) also bundles a copy of `apps/web/dist` into its own `dist/web` at build time
  (F010) - rebuild `@qyre/qyre` too after changing `apps/web`, or a running `qyre <target>` session
  will keep serving the stale bundled copy instead of the fresh one.
- Docker may require `/Applications/Docker.app/Contents/Resources/bin/docker` explicitly on macOS.
- Deferred by explicit scoping decision, not oversight: full column resize/reorder/frozen columns,
  a complete toolbar regroup into 4 sections with an overflow menu (only a light-touch separator was
  added), full drag-to-select multi-cell copy/paste (only single-cell and best-effort TSV-block
  paste from one anchor cell are implemented), and JSON syntax highlighting (kept plain monospace
  with inline validation errors instead). Revisit only if explicitly requested - the grid-editing
  interaction model was the higher-impact target per the audit's own prioritization.

## Next steps

- Commit round 2, push to the existing branch, and update PR #160 (or push --no-verify again with
  the user's confirmation given the same Node-version gate failure).
- After CI passes, record the PR/commit, move F146 to `passing`, and run `pnpm features:prune`.
- Then return to `main` and activate DF-13, the guided Add/Duplicate row composer.
