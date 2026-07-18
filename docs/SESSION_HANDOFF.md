# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-18.
- Branch: `main`. Released v0.4.2 (PR #169, tag pending publish).
- Queue: F148/F149 passing; F150-F153 queued `not_started` for plan 0008, the approved opt-in AI
  assistant tab (`docs/exec-plans/active/0008-ai-database-assistant.md`). Plan 0007 is retired
  (`docs/exec-plans/completed/0007-...md`); a fresh UI audit is still pending separately.

## Completed

- F146 merged in PR #160 as `ed44633` (DataGrip-style grid editing across all four engines).
- F147 merged in PR #161 as `2acd2f6` (Tables QA keyboard regressions).
- F148 merged in PR #165 as `c780b89`, released in v0.4.1: RECENT card truncation, fields-mode
  SRV toggle, MongoDB hidden per-server database list, listDatabases fallback to the URL-scoped
  database, /api/overview + /api/databases permission normalization, centered sidebar error,
  and Settings Access removal.
- F149 merged in PR #167 as `9dae65d`: MongoDB `listCollections` now passes
  `nameOnly + authorizedCollections` (packages/drivers/mongodb/src/schema/introspection.ts, both
  call sites), so a collection-scoped role lists its own collections instead of a code-13 denial.
  The `GET /api/tables` read routes (all-tables, table metadata, rows) carry `permissionRoute`
  config, so an engine denial returns the shared safe 403 body instead of leaking raw driver text
  to the Schema tab. `connectAndSwap` (packages/server/src/routes/connection/connect.ts) runs a
  browse preflight (`getOverview`) after ping and before the swap, rejecting credentials that
  authenticate but cannot browse with a friendly inline error in the Switch-database drawer while
  leaving the previous connection untouched, for both /api/connect and /api/connect/database. A
  connected but table-less database renders a centered sidebar empty state — "No tables in this
  database" with a Switch database button — instead of SchemaTree's bare "No tables found."
  (packages/ui/src/schema/navigation/sidebar.tsx).

## In progress

- None.

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

- Activate F150 (plan 0008 slice 1): assistant tab gating, Settings AI category with exclusive
  provider config, and the SECURITY.md/README opt-in carve-out.
- Separately, run a fresh UI/UX browser audit and turn its findings into a new exec plan.
