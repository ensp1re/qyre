# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-12.
- Branch: `main`. F106-F110, F126, F127 merged (PRs #120-#126, all CI green). F111 (column
  operations) implemented and fully verified on `feature/F111-column-operations`, not yet
  pushed/PR'd.
- Queue: F092-F110 and F125-F127 are `passing`; F111 is `active` (implemented, pending its own
  PR/merge - its passing state + evidence will be recorded in F112's delivery commit, per this
  session's established bundling convention); F112-F121 and F128 remain `not_started`. `nextIds.F`
  is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128; see the plan's own progress log for full
  per-feature history and `docs/FEATURES.json` for verification evidence. F090-F110, F122-F127,
  F129 are merged to `main` (PRs #94-#126): permission/capability foundation (F090-F098,
  F122-F124), the row-mutation write path (F099-F102), the full row-editing UI (F103-F105, F125),
  all of Phase C - `classifyStatement` (F106), `DatabaseAdapter.runQuery` + `POST /api/query`'s
  classification routing (F107), the write-capable SQL Editor UI (F108), query cancellation +
  long-op handling (F126), and column-level SQL autocomplete (F127) - and Phase D's first two
  slices: F109's spec-only foundation (`docs/product-specs/schema-editing.md`) and F110's
  table-lifecycle `SchemaDdlApi` (`createTable`/`renameTable`/`truncateTable`/`dropTable`) across
  all four adapters, gated server-side on F096 + `supportsDdl`. Phase C is closed out.

## In progress

- F111 (column operations), on `feature/F111-column-operations`. Per `docs/product-specs/
schema-editing.md`: `addColumn`/`renameColumn`/`alterColumn`/`dropColumn` added to `SchemaDdlApi`
  and implemented for Postgres/MySQL/SQLite (absent on MongoDB - no per-column concept on a
  schemaless collection). Native `ALTER` on Postgres; MySQL's `alterColumn` reads the column's
  current `information_schema.columns` definition (not the shared `ColumnMetadata`, which has no
  `default` field) and merges `changes` onto it for one `MODIFY COLUMN` statement. SQLite's
  `addColumn`/`renameColumn`/`dropColumn` are native; `alterColumn` always takes the 12-step rebuild
  path (`PRAGMA foreign_keys=OFF`, create-new/copy/swap in one transaction, replay every index/
  trigger from `sqlite_master`'s own stored SQL, `PRAGMA foreign_key_check`, commit,
  `PRAGMA foreign_keys=ON`) - manually smoke-tested against a fixture with a unique index, a
  trigger, and a cross-table FK, all three survived. Server routes: `POST .../ddl/columns` (add),
  `PATCH .../ddl/columns/:column` (rename and/or alter in one request), `DELETE .../ddl/columns/
:column` (drop, typed confirmation) - a column route against MongoDB responds 400 explaining
  collections have no columns to alter, registered but engine-conditionally rejected. Verified:
  `pnpm check:quiet:run`, full local gate incl. Docker-backed integration tests, all green. Not yet
  pushed/PR'd.

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
- `better-sqlite3`'s native binding can go stale against the machine's active Node version
  (`NODE_MODULE_VERSION` mismatch, `new Database()` throws). Fix: `pnpm install --force` under the
  Node version you intend to test with (this repo's Docker/CI stack matches Node 22,
  `NODE_MODULE_VERSION` 127) to rebuild the prebuilt binary; a `node-gyp rebuild` against a too-new
  Node (e.g. 26) can fail to compile against that Node's V8 headers.

## Next steps

- Finish delivering F111 (commit, push, PR, wait for CI green, then wait for the user to say it's
  merged - never merge it here), then F112 (index operations) per the exec plan's Phase D order.
