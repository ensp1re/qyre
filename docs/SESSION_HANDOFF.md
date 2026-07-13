# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-12.
- Branch: `main`. F106-F112, F126, F127 merged (PRs #120-#128, all CI green). F113 (table designer
  UI) implemented and fully verified on `feature/F113-table-designer-ui`, not yet pushed/PR'd.
- Queue: F092-F112 and F125-F127 are `passing`; F113 is `active` (implemented, pending its own
  PR/merge - its passing state + evidence will be recorded in F114's delivery commit, per this
  session's established bundling convention); F114-F121 and F128 remain `not_started`. `nextIds.F`
  is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128; see the plan's own progress log for full
  per-feature history and `docs/FEATURES.json` for verification evidence. F090-F112, F122-F127,
  F129 are merged to `main` (PRs #94-#128): permission/capability foundation (F090-F098,
  F122-F124), the row-mutation write path (F099-F102), the full row-editing UI (F103-F105, F125),
  all of Phase C - `classifyStatement` (F106), `DatabaseAdapter.runQuery` + `POST /api/query`'s
  classification routing (F107), the write-capable SQL Editor UI (F108), query cancellation +
  long-op handling (F126), and column-level SQL autocomplete (F127) - and Phase D's backend slices:
  F109's spec-only foundation, F110's table-lifecycle `SchemaDdlApi`
  (`createTable`/`renameTable`/`truncateTable`/`dropTable`), F111's column operations
  (`addColumn`/`renameColumn`/`alterColumn`/`dropColumn`, incl. SQLite's 12-step rebuild path), and
  F112's index operations (`createIndex`/`dropIndex`, all four engines incl. MongoDB) - all gated
  server-side on F096 + the relevant capability flag. Phase C is closed out.

## In progress

- F113 (table designer UI), on `feature/F113-table-designer-ui`. Per `docs/product-specs/
schema-editing.md`: a permission-gated "New table" button in the Schema tab toolbar (hidden
  unless `supportsDdl`), opening `packages/ui`'s new `CreateTableDialog` - table name + a column
  list (name, type from F110's curated per-engine catalog via a native `<select>`, nullability,
  default), a live human-readable `CREATE TABLE`/`db.createCollection` preview (display-only, not
  literal per-engine SQL - mirrors `commit-preview.ts`'s existing precedent), MongoDB degrading to
  a name-only new-collection form. Primary-key marking was deliberately dropped from scope -
  `ColumnDefinition`/`createTable` (F110) has no first-class way to express one at all, so a PK
  checkbox would have been decorative. `apps/web`'s `useCreateTable` mutation posts to F110's
  `POST /api/schemas/:schema/tables` and invalidates the table list/overview on success. Found and
  worked around a real pre-existing gap along the way: `@qyre/core` is tsup-bundled into one
  `dist/index.js` that also pulls in `connection-target.ts`'s Node-only `fs`/`path`/`url` imports,
  so any runtime (non-type) import from the package's barrel breaks Vite's browser build - the
  three curated column-type-catalog arrays are duplicated locally in `apps/web` instead of
  imported, rather than restructuring `@qyre/core`'s build for every consumer. Verified:
  `pnpm check:quiet:run`, full local gate all green, plus manual browser verification against a
  live Postgres connection (create succeeded end-to-end incl. cache-refresh and a server-audited
  event; a duplicate-name attempt surfaced the real Postgres error inline without losing the
  draft). Not yet pushed/PR'd.

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

- Finish delivering F113 (commit, push, PR, wait for CI green, then wait for the user to say it's
  merged - never merge it here), then F114 per the exec plan's Phase D order.
