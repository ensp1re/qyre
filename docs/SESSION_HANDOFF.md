# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-17.
- Branch: `feature/F148-connection-ux-auth-scoped-explorer`.
- Queue: DF-10 through DF-12, F146, and F147 are passing. F148 is active for MongoDB
  connection-UX and auth-scoped-explorer fixes found in live Atlas QA. DF-13 remains next after
  F148.

## Completed

- DF-10 through DF-12 (audit, editing integrity, shared typed editors) are passing and merged.
- F146 merged in PR #160 as `ed44633`. Rounds 1-16 added whole-cell scalar editing, stable
  selection, keyboard/copy/paste/undo, staged commits, compact validated drawers, lossless
  temporal/interval editing, shared MongoDB grid writes and BSON editors, and live-value
  click-away staging.
- F147 merged in PR #161 as `2acd2f6`: render-lagged keyboard staging in inline cells and filter
  inputs, top-level filter Escape behavior, and SQLite declared-BOOLEAN display are fixed.

## In progress

- F148 fixes issues found while connecting Qyre to a real MongoDB Atlas cluster:
  - Long RECENT connection cards now truncate (with a hover title) instead of overflowing the
    Switch-database drawer.
  - The fields-mode form gained an SRV toggle so it can compose/round-trip `mongodb+srv://`
    targets (no port) - previously pasting an Atlas URL into fields and reconnecting silently
    produced a broken `mongodb://host:port` string.
  - The drawer's "Databases on this server" panel is hidden for MongoDB - the sidebar explorer
    already lists every accessible database, and the per-server list required a
    cluster-wide `listDatabases` privilege a scoped Atlas role may not have.
  - `introspectSchemas` (packages/drivers/mongodb) falls back to the URL-scoped database when
    `listDatabases` is denied (code 13/Unauthorized), instead of the explorer hard-failing.
  - `GET /api/overview` and `GET /api/databases` gained `permissionRoute` config so a remaining
    engine denial normalizes into the shared safe 403 body instead of leaking raw driver error
    text (e.g. the `not authorized on admin to execute command {...}` dump).
  - Sidebar's "Schemas unavailable" error state is vertically centered in the panel rather than
    pinned to the top.
  - Settings screen's Access category (and `AccessViewer`/`useAccessOverview`/`/api/access`
    client wiring) is removed for now; `AccessBadge` in the status bar and the server
    `/api/access` route are untouched.
  - Verification: `@qyre/mongodb` 81/81, `@qyre/ui` 445/445, `@qyre/server` 310/310 unit tests
    pass; core/mongodb/server/ui/web typecheck and ui/web build pass; manually verified all six
    behaviors in the `qyre-preview-mongo` browser preview.

## Known issues / blockers

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

- Run `pnpm verify:pr`, open a draft PR for F148, then move it to `passing` once CI (or the local
  gate, if hosted credits are still unavailable) confirms.
- After F148 passes, return to `main` and activate DF-13, the guided Add/Duplicate row composer.
