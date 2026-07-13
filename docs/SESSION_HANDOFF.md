# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-13.
- Branch: `main`. F106-F114, F126, F127 merged (PR #130 merged F114 + a FEATURES.json prune of 23
  long-merged entries). F115 (database/schema lifecycle) implemented and fully verified on
  `feature/F115-database-lifecycle`, not yet pushed/PR'd.
- Queue: F106-F114 and F125-F127 are `passing` (older passing entries pruned); F115 is `active`
  (implemented, pending its own PR/merge - its passing state + evidence will be recorded in the
  next feature's delivery commit, per this session's established bundling convention); F116-F121
  and F128 remain `not_started`. `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128; see the plan's own progress log and
  `docs/FEATURES.json` for full per-feature evidence. F090-F114, F122-F127, F129 are merged to
  `main` (PRs #94-#130): permission/capability foundation (F090-F098, F122-F124), the row-mutation
  write path (F099-F102), the full row-editing UI (F103-F105, F125), Phase C -
  `classifyStatement`/`runQuery` classification (F106-F107), the write-capable SQL Editor
  (F108, F126-F127) - and Phase D's `SchemaDdlApi` slices: table lifecycle (F110), column ops
  (F111, incl. SQLite's 12-step rebuild), index ops (F112), the table designer UI (F113), and the
  Structure view (F114) - all gated server-side on F096 + the relevant capability flag.

## In progress

- F115 (database/schema lifecycle), on `feature/F115-database-lifecycle`. Adapters gain the `admin`
  namespace (`DatabaseAdminApi`, mirroring `mutations`/`ddl`'s optional-namespace pattern):
  Postgres has all five members (`listDatabases`/`createDatabase`/`dropDatabase`/`createSchema`/
  `dropSchema`); MySQL the database trio (its "schema" IS its database); MongoDB
  `listDatabases`/`dropDatabase` only (databases exist implicitly on first write - no create to
  model; the route 400s explaining that); SQLite no namespace at all (one file is one database).
  `supportsDatabaseManagement` was already real for Postgres/MySQL (F092/F093); MongoDB now derives
  it from the `dropDatabase` privilege action (the only database-management action its model has) -
  its F095 always-false placeholder replaced, incl. the unauthenticated full-access default.
  Routes: `GET/POST /api/databases`, `DELETE /api/databases/:database`, `POST /api/schemas`,
  `DELETE /api/schemas/:schema` - mutating ones two-tier gated (F096 + supportsDatabaseManagement),
  drops behind server-side typed confirmation, audited with `operation`+`target` structured fields.
  Design note found while testing: `getOverview()` derives schemas from tables, so an empty schema
  never appears in it - `DELETE /api/schemas/:schema` therefore deliberately has NO exists-first
  404 (a freshly created empty schema is the most common drop target); Postgres's own "schema does
  not exist" error surfaces instead, documented in the spec's new "Database and schema lifecycle"
  section (added to schema-editing.md). MongoDB's WRITE_METHODS lint-scan gained `admin.ts` as the
  third trusted write-path file with its own shipped-methods test. Verified: 16 new server route
  tests, 4 new conformance tests (create/list/drop roundtrip on Postgres/MySQL/MongoDB incl.
  MongoDB's implicit-creation path, SQLite absent-namespace, Postgres schema roundtrip, capability
  reporting), restricted-role rejection tests for Postgres/MySQL, and the updated MongoDB
  permission-shape unit tests - all green against live databases. Not yet pushed/PR'd.

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

- Finish delivering F115 (commit, push, PR, wait for CI green, then wait for the user to say it's
  merged - never merge it here), then F116 per the exec plan's Phase D order.
