# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-13.
- Branch: `main`. F106-F115, F126, F127 merged (PR #131 merged F115). F116 (database-level
  management UI) implemented and fully verified on `feature/F116-database-admin-ui`, not yet
  pushed/PR'd.
- Queue: F106-F115 and F125-F127 are `passing`; F116 is `active` (implemented, pending its own
  PR/merge - its passing state + evidence will be recorded in the next feature's delivery commit,
  per this session's established bundling convention); F117-F121 and F128 remain `not_started`.
  `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128; see the plan's own progress log and
  `docs/FEATURES.json` for full per-feature evidence. F090-F115, F122-F127, F129 are merged to
  `main` (PRs #94-#131): permission/capability foundation (F090-F098, F122-F124), the row-mutation
  write path (F099-F102), the full row-editing UI (F103-F105, F125), Phase C -
  `classifyStatement`/`runQuery` classification (F106-F107), the write-capable SQL Editor
  (F108, F126-F127) - and Phase D's `SchemaDdlApi`/`DatabaseAdminApi` slices: table lifecycle
  (F110), column ops (F111, incl. SQLite's 12-step rebuild), index ops (F112), the table designer
  UI (F113), the Structure view (F114), and database/schema lifecycle (F115) - all gated
  server-side on F096 + the relevant capability flag.

## In progress

- F116 (database-level management UI), on `feature/F116-database-admin-ui`. `ConnectDrawer` gains a
  "Databases on this server" section (`packages/ui`'s new `DatabasePanel`): lists sibling databases
  via F115's `GET /api/databases`, switch-in-place with no re-entered credentials, permission-gated
  create (`CreateNamedDialog`, a new shared "name only" modal reused for both database and schema
  creation) and drop (`ConfirmTypedNameDialog`, F114's shared typed-confirm primitive). The
  sidebar's `SchemaTree` gained the same create/drop pair for Postgres schemas, gated on
  `engine === "postgres" && supportsDatabaseManagement`. List+switch stay available in a
  read-only/ungranted session; only create/drop hide, per the spec's "list only, affordances
  hidden" rule - `databaseManagementReason` (new) surfaces why, reusing `READ_ONLY_REASON_LABEL`
  and falling back to a database-management-specific reason when only that one capability is
  missing.

  Switch-in-place needed a small backend slice: `POST /api/connect/database` (in `connect.ts`,
  sharing a `connectAndSwap` helper factored out of `/api/connect`) rebuilds the current target's
  raw connection string with just the database segment swapped (`withDatabase`, new in
  `@qyre/core`'s `connection-target.ts`) - the client only ever names the sibling database, never
  sees or re-supplies credentials. Ungated (matches `GET /api/databases`' own ungated read -
  switching to a visible database isn't itself an admin action).

  Verified live against Postgres end to end: create/switch/drop database with zero credential
  re-entry; `DROP SCHEMA` without `CASCADE` correctly surfaces Postgres's real dependency error
  inline while the schema still has a table, then succeeds once it's empty. `e2e/read-only-mode
.spec.ts` extended with the new control names (deliberately excluding "switch", which must stay
  visible) plus an assertion the database panel itself still renders read-only. 36 new/updated unit
  tests; full `pnpm check:quiet:run` and the full E2E suite all green. Not yet pushed/PR'd.

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

- Finish delivering F116 (commit, push, PR, wait for CI green, then wait for the user to say it's
  merged - never merge it here), then F117 per the exec plan's Phase D order.
