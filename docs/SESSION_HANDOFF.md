# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-12.
- Branch: `main`. F103 merged (PR #115, both CI jobs green).
- Queue: F092-F103 are `passing`; F104-F121 and F125-F128 remain `not_started`. `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128 (see plan's own progress log for full history:
  F122 session auth, F090 permissions spec, F091 capability plumbing, F123 batched introspection,
  F124 table/view `kind`, F092 Postgres permissions, F129 unplanned driver-modularization refactor,
  F093 MySQL permissions, F094 SQLite writability, F095 MongoDB permissions, F096 `--read-only`
  session mode, F097 permission-aware UI shell, F098 row-editing product spec - all merged to
  `main`, PRs #94-#108).
- Row-editing write path (F099-F102), each adding one `RowMutationApi` slice with its server route,
  validation, and cross-engine conformance coverage: F099 structured insert (`mutations.insertRow`,
  `POST /api/tables/:schema/:table/rows`, PRs #109/#110), F100 structured update
  (`mutations.updateRowByKey`, `PATCH` on the same resource, full-primary-key match with
  `matched: 0` reported as `409`, PR #112), F101 structured delete (`mutations.deleteRowsByKey`,
  `DELETE` on the same resource, explicit key-list only - no filter-based bulk delete, PR #113),
  F102 batch commit (`mutations.commitBatch` on the three SQL engines only, one native transaction
  per batch, `POST /api/mutations/commit`, MongoDB `400`s - it saves per-document instead, PR #114).
  Full details and verification evidence for each are in `docs/FEATURES.json`.
- F103 (SQL editable grid) merged to `main`: the Rows table becomes an editable grid on SQL engines
  - double-click/Enter opens a type-aware inline editor (text/number/boolean/date/time/datetime,
    reusing F082/F089's filter value controls), edits stage into a client-side pending-changes
    buffer keyed by primary key without touching the server, dirty cells get amber styling plus a
    revert control. Editability (`computeTableEditability`,
    `apps/web/src/features/table/model/editability.ts`) is derived from existing
    capabilities/permissions/kind data and gates closed for MongoDB, views, PK-less tables, and
    read-only sessions/tables. Commit wiring to F102's batch endpoint is F105. PR #115.

## In progress

- Nothing active.

## Known issues / blockers

- Full `pnpm check` requires Docker; root test/check commands load the gitignored `.env` URLs.
- If `docker` resolves to a dangling `/usr/local/bin/docker`, prepend
  `/Applications/Docker.app/Contents/Resources/bin` to `PATH`.
- UI Preview must rebuild `@qyre/ui` before `@qyre/web` because the web package consumes UI `dist/`.
- Vitest resolves workspace packages (`@qyre/core`, `@qyre/driver-contract`, each adapter) through
  their built `dist/`, not source - after changing a package's exported surface, rebuild it
  (`pnpm --filter <pkg> build`) before running a _different_ package's tests against the change, or
  they'll silently exercise the stale build ("X is not a function" is the tell). `tsc --noEmit`
  doesn't have this problem (it honors the root `tsconfig.base.json`'s `paths` straight to `src`).
- `.local/preview-server-mysql.mjs` still points at a stale pre-rename port/db
  (`localhost:3307`/`humb_test`, wrong env var names).
- MongoDB's shared docker-compose/CI container has no authorization enabled at all - every
  connection is anonymous and full-access. Testing a genuinely restricted MongoDB user live would
  require enabling auth globally and migrating every existing Mongo test/fixture to credentials
  (see F095's evidence in FEATURES.json / `permissions.ts`'s top comment) - deliberately not done.
- F099 has two merged PRs on `feature/F099-row-insert` (#109, #110) with identical content: a
  squash-merge landed first, then the branch was merged again (regular merge commit) without
  deleting it in between. Both are harmless no-op-content merges on `main` - `commitHash` in
  FEATURES.json points at the final one (#110, `fc4240a`). No action needed, just don't be
  surprised by the duplicate history.

## Next steps

- F104 (permission-gated Add-row and Duplicate-row affordances for the SQL editable grid - a
  new-row editor with F103's same type-aware inputs, nullable/default-value handling, per-column
  validation before staging into the pending buffer; Duplicate pre-fills from the selected row
  minus auto-generated keys) is next per the exec plan's "Feature order and dependencies" section.
  Hidden entirely for sessions/tables without insert permission, views, and MongoDB.
