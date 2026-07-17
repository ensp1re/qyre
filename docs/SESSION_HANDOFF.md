# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-17.
- Branch: `feature/F149-browse-preflight-and-scoped-introspection`.
- Queue: F147 and F148 are passing (F148 merged in PR #165 as `c780b89`, released as v0.4.1).
  F149 is active for the follow-up gaps post-release Atlas QA found. DF-13 remains next after
  F149.

## Completed

- F146 merged in PR #160 as `ed44633` (DataGrip-style grid editing across all four engines).
- F147 merged in PR #161 as `2acd2f6` (Tables QA keyboard regressions).
- F148 merged in PR #165 as `c780b89`, released in v0.4.1: RECENT card truncation, fields-mode
  SRV toggle, MongoDB hidden per-server database list, listDatabases fallback to the URL-scoped
  database, /api/overview + /api/databases permission normalization, centered sidebar error,
  and Settings Access removal.

## In progress

- F149 closes what post-v0.4.1 Atlas QA still hit:
  - MongoDB `listCollections` now passes `nameOnly + authorizedCollections`
    (packages/drivers/mongodb/src/schema/introspection.ts, both call sites), so a
    collection-scoped role lists its own collections instead of a code-13 denial — this was the
    remaining hard failure after F148's listDatabases fallback.
  - The `GET /api/tables` read routes (all-tables, table metadata, rows) carry `permissionRoute`
    config, so an engine denial returns the shared safe 403 body; raw driver text no longer
    reaches the Schema tab (which reads /api/tables, not /api/overview).
  - `connectAndSwap` (packages/server/src/routes/connection/connect.ts) runs a browse preflight
    (`getOverview`) after ping and before the swap: credentials that authenticate but cannot
    browse are rejected with a friendly inline error in the Switch-database drawer, the new
    adapter is disconnected, and the previous connection stays untouched. Applies to both
    /api/connect and /api/connect/database. The CLI's initial launch gate is intentionally
    unchanged.
  - A connected but table-less database (e.g. `postgres://...@host:5432` with no database path
    landing in the empty default DB) renders a centered sidebar empty state — "No tables in this
    database" with a Switch database button opening the drawer — instead of SchemaTree's bare
    "No tables found." (packages/ui/src/schema/navigation/sidebar.tsx).
  - Verification so far: @qyre/mongodb 82/82 (local Docker env), @qyre/server 314/314,
    @qyre/ui 447/447; typecheck/build pass for core/mongodb/server/ui/web; the postgres browser
    preview confirms the no-database connect flow end-to-end. `pnpm verify:pr` and the PR are
    the remaining steps.

## Known issues / blockers

- Repository verification must use Node 22 (Homebrew `node@22` at `/opt/homebrew/opt/node@22/bin`);
  newer Node cannot load the current `better-sqlite3` native binding.
- UI Preview and E2E must rebuild `@qyre/ui` before `@qyre/web` because web consumes UI `dist/`;
  the e2e preview servers also load `@qyre/server`/driver `dist/`, so rebuild those packages too
  after server/driver changes. The CLI (`@qyre/qyre`) additionally bundles a copy of
  `apps/web/dist` into its own `dist/web` at build time (F010).
- Docker may require `/Applications/Docker.app/Contents/Resources/bin/docker` explicitly on macOS.
- Deferred by explicit scoping decision, not oversight: full column resize/reorder/frozen columns,
  a complete toolbar regroup into 4 sections with an overflow menu, full drag-to-select multi-cell
  copy/paste, and JSON syntax highlighting. Revisit only if explicitly requested.

## Next steps

- Run `pnpm verify:pr` (Node 22), open the F149 PR, and move F149 to `passing` once the gate
  confirms.
- After F149 passes, return to `main` and activate DF-13, the guided Add/Duplicate row composer.
