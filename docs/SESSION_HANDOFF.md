# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-16.
- Branch: `feature/F146-grid-editing-ux-polish`, based on `main` at `fcab56c` (DF-12 merged in #159).
  Draft PR #160 contains all six F146 review rounds.
- Queue: DF-10 through DF-12 are passing. F146 is active, continuing the same 0007 audit plan on
  the grid-editing surface. DF-13 (guided Add/Duplicate row composer) is next after F146.

## Completed

- DF-10 through DF-12 (audit, editing integrity, shared typed editors) are passing and merged.
- F146 round 1 (pushed, PR #160): restored CellValue's UTC/long-string/URL affordances on editable
  columns, a single-active-editor coordinator, the missing timestamp/time widget, JSON/long-text in
  a drawer, table-layout:fixed column truncation, and icon-only EditorActions.
- F146 round 2 (pushed, PR #160): a DataGrip-inspired interaction rework - single click selects a
  cell (visual only), double-click/Enter/F2 edits it; `InlineCellEditor` so text/number/uuid/
  boolean/enum/date/timestamp/time edit directly in the cell with no popover chrome, committing on
  Enter (advances selection down)/Tab (advances right, wrapping rows)/Shift+Tab, cancelling on
  Escape; JSON/array/set/long-text in a small anchored popover by default (Format/Minify/Copy
  actions) with an explicit "Expand" action for the full `CellEditorDrawer`; grid-level keyboard
  shortcuts (arrows, Tab/Shift+Tab, Escape, Delete/Backspace-to-NULL, Ctrl/Cmd+Z revert, Ctrl/Cmd+C/V
  copy-paste) plus page-level Ctrl/Cmd+S commit; green `CommitBar` Commit button.
- F146 round 3 (visual/behavioral refinements requested after live review of round 2): shrank the
  timestamp mini-picker popover to 264px (was the shared 512px
  default); moved the "editing" indicator from a bordered/backgrounded box around the `<input>` to a
  border around the whole cell, and stripped the input to borderless/transparent, filling the cell
  exactly; removed the inline NULL toggle/chip entirely - a nullable field's draft auto-commits NULL
  when left empty, and Delete/Backspace on a selected (non-editing) cell already nulls any nullable
  cell without needing edit mode; URLs now render as plain text (no chip/preview); long text
  hard-truncates to exactly 100 characters + a literal "..." via a JS substring
  (`truncateForDisplay`, `LONG_STRING_THRESHOLD` dropped 300->100) instead of relying on CSS overflow/
  text-overflow, which wasn't reliably shortening; centered the "Loading table..."/"Loading rows..."
  states and moved the Loading-rows Cancel button onto its own row below the text; updated the full
  E2E expectations for the writable status bar and column-labelled inline editors.
- F146 round 4: moved selection/editing emphasis to the entire `<td>`; replaced the boolean toggle
  with the shared True/False selector; kept JSON values visible while their editor is open and
  ignored editor-internal scroll events while still dismissing on table scroll; collapsed shell-tab
  and row-action labels below 1024px while preserving accessible names and tooltips.
- F146 round 5: any active scalar, structured, or inserted-row grid editor now dismisses after a
  different body-cell click; timestamp editing directly reuses the filter calendar panel without
  nested date/time controls and preserves the stored time/precision/timezone tail; removed SQL
  Editor Analyze and kept Explain non-executing.
- F146 round 6: JSON and supported-array editing now opens directly in the established right-side
  drawer for existing and inserted rows. The mutation surface names the column once and keeps only
  the full-value editor, Format, validation, nullable selection, Cancel, and Apply; the intermediate
  popover, Expand step, duplicated type/value labels, helper copy, Minify, and Copy are removed.

## In progress

- Round 6 passes the complete local PR gate and is being pushed to draft PR #160. F146 remains
  active until GitHub CI can run again.

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
