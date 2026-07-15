# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-15.
- Branch: `feature/F146-grid-editing-ux-polish`, based on `main` at `fcab56c` (DF-12 merged in #159).
- Queue: DF-10 through DF-12 are passing. F146 is active, continuing the same 0007 audit plan on
  the grid-editing surface. DF-13 (guided Add/Duplicate row composer) is next after F146.

## Completed

- DF-10 through DF-12 (audit, editing integrity, shared typed editors) are passing and merged.
- F146 implemented, not yet committed/pushed: EditableCell's non-editing display now always routes
  through CellValue (with `onInspectDate` passed through), restoring the UTC/local/relative date
  popover, long-string truncation, and URL/structured chips for editable columns - these were
  silently lost for editable columns because the old fallback rendered raw `formatCell` text
  instead. A table-level `activeEditor` id in `useRowsTableModel` makes only one cell editor (grid
  or insert-row) open at a time. `TypedValueEditor` gained the missing `timestamp`/`time` widget
  case - DF-12 turned timestamp/time editing back on but never wired a control for it, so it fell
  through to a bare text input; now a DatePicker + HH:MM segments splice onto the precise text
  value without ever touching (so never truncating) any existing seconds/fraction/offset tail, plus
  a UTC-equivalent caption for timezone-aware columns. JSON/array/multiline cell editing now opens
  in a new shared `CellEditorDrawer` (right-side panel) instead of the small popover. `rows-table.tsx`
  uses `table-layout: fixed` with a `COLUMN_WIDTH` colgroup and `truncate` on cell content so long
  values ellipsize instead of expanding the grid. `EditorActions`' Apply/Cancel are now icon-only
  (JetBrains-style), same accessible names, so existing `getByRole` queries were unaffected.

## In progress

- F146 needs a commit, push, and draft PR. Not yet done in this session.

## Known issues / blockers

- Full `pnpm verify:pr` on this machine reaches 34/34 package typecheck/test/build tasks and all
  `check:state` checks, but the SQLite E2E `webServer` fails to start: `better-sqlite3` was built
  for `NODE_MODULE_VERSION 127`, this machine runs Node 26 (`147`). Same pre-existing Node-22-only
  constraint below, not a regression from F146. CI runs the correct Node version, so this should
  pass there.
- Repository verification must use Node 22; Node 24+ cannot load the current `better-sqlite3` native
  binding.
- UI Preview and E2E must rebuild `@qyre/ui` before `@qyre/web` because web consumes UI `dist/`; the
  CLI (`@qyre/qyre`) also bundles a copy of `apps/web/dist` into its own `dist/web` at build time
  (F010) - rebuild `@qyre/qyre` too after changing `apps/web`, or a running `qyre <target>` session
  will keep serving the stale bundled copy instead of the fresh one.
- Docker may require `/Applications/Docker.app/Contents/Resources/bin/docker` explicitly on macOS.

## Next steps

- Commit F146, push the branch, and open a draft PR.
- After CI passes, record the PR/commit, move F146 to `passing`, and run `pnpm features:prune`.
- Then return to `main` and activate DF-13, the guided Add/Duplicate row composer.
