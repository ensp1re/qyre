# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-12.
- Branch: `main`. F106, F107, F108, F126, F127 merged (PRs #120-#124, all CI green). F109 (schema-
  editing spec, Phase D's foundation) implemented on `feature/F109-schema-editing-spec`, not yet
  pushed/PR'd.
- Queue: F092-F108 and F125-F127 are `passing`; F109-F121 and F128 remain `not_started`. F109 is
  `not_started` in `FEATURES.json` pending its own merge (its passing state + evidence will be
  recorded in the next feature's delivery commit, per this session's established bundling
  convention). `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128; see the plan's own progress log for full
  per-feature history and `docs/FEATURES.json` for verification evidence. F090-F108, F122-F127,
  F129 are merged to `main` (PRs #94-#124): permission/capability foundation (F090-F098,
  F122-F124), the row-mutation write path (F099-F102), the full row-editing UI (F103-F105, F125),
  and all of Phase C - `classifyStatement` (F106), `DatabaseAdapter.runQuery` + `POST /api/query`'s
  classification routing (F107), the write-capable SQL Editor UI (F108), query cancellation +
  long-op handling (F126, resolving the SQLite worker-thread-vs-non-cancellable open decision in
  favor of non-cancellable), and column-level SQL autocomplete (F127). Phase C is closed out.

## In progress

- F109 (schema-editing spec), on `feature/F109-schema-editing-spec` - Phase D's foundation, a
  spec-only slice (`pnpm check:state`, no implementation) like F090/F098 before it:
  `docs/product-specs/schema-editing.md` fixes `SchemaDdlApi` (table/collection lifecycle - create/
  rename/truncate/drop; column ops - add/rename/alter/drop, absent entirely on MongoDB since
  collections have no fixed structure to alter; index ops - create/drop), `ColumnDefinition`/
  `IndexDefinition`, and the per-engine DDL matrix - most notably SQLite's genuinely constrained
  native `ALTER TABLE` and the 12-step rebuild pattern `alterColumn` falls back to for anything it
  can't express directly (always the rebuild path for a destructive change, never a split fast/
  rebuild path). Gating reuses the session-level `supportsDdl`/`supportsIndexManagement`
  capabilities F090 already reserved - no new per-table permission field, since DDL privilege is
  granted at the schema/database level in every engine here, not per-table like row grants.
  **Resolves exec plan open decision 6**: the table designer's type picker offers a static, curated,
  per-engine list, not one introspected from the engine's own type catalog. Typed-confirmation
  (type the target's exact name) is required for `dropTable`/`truncateTable`/`dropColumn`
  specifically; `dropIndex` uses a plain confirming click; everything non-destructive uses a
  review-before-submit step - the server independently re-validates a destructive request's
  `confirmedName` regardless of what the UI already gated. Routes live under
  `POST /api/schemas/:schema/tables` (create) and `/api/tables/:schema/:table/ddl/...` (everything
  else); the audit-event contract is reused unchanged from `row-editing.md`. Full detail in the
  spec itself and the exec plan's progress log. Not yet pushed/PR'd - `pnpm check:state` pending.

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

- Finish delivering F109 (`pnpm check:state`, commit, push, PR, wait for CI green, then wait for
  the user to say it's merged - never merge it here), then F110 (table lifecycle implementation)
  per the exec plan's Phase D order.
