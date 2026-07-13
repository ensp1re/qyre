# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-13.
- Branch: `main`. F106-F113, F126, F127 merged (PR #129 merged F113). F114 (Structure view)
  implemented and fully verified on `feature/F114-column-index-designer-ui`, not yet pushed/PR'd.
- Queue: F092-F113 and F125-F127 are `passing`; F114 is `active` (implemented, pending its own
  PR/merge - its passing state + evidence will be recorded in F115's delivery commit, per this
  session's established bundling convention); F115-F121 and F128 remain `not_started`. `nextIds.F`
  is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128; see the plan's own progress log and
  `docs/FEATURES.json` for full per-feature evidence. F090-F113, F122-F127, F129 are merged to
  `main` (PRs #94-#129): permission/capability foundation (F090-F098, F122-F124), the row-mutation
  write path (F099-F102), the full row-editing UI (F103-F105, F125), Phase C -
  `classifyStatement`/`runQuery` classification (F106-F107), the write-capable SQL Editor
  (F108, F126-F127) - and Phase D's `SchemaDdlApi` slices: table lifecycle (F110), column ops
  (F111, incl. SQLite's 12-step rebuild), index ops (F112), and the table designer UI (F113) -
  all gated server-side on F096 + the relevant capability flag.

## In progress

- F114 (Structure view), on `feature/F114-column-index-designer-ui`. Per `docs/product-specs/
schema-editing.md`: a Rows/Structure toggle on the Tables tab (`useTableView`, localStorage-backed
  like the Schema tab's graph/grid choice). `packages/ui`'s new `TableStructure` lists columns with
  Edit/Drop controls (`EditColumnDialog`, `ConfirmTypedNameDialog` - a new shared typed-confirm
  primitive reused for dropColumn/truncateTable/dropTable), an Add-column dialog, indexes with an
  immediate Drop button (no confirmation, per the spec) and a Create-index dialog, and
  table-lifecycle actions (inline rename; typed-confirm Truncate/Drop table). Three independent
  gates: `canEditColumns` (supportsDdl, false for MongoDB), `canManageIndexes`
  (supportsIndexManagement), `canEditTable` (supportsDdl). Views/matviews or zero-capability
  sessions render the existing read-only `TableDetail` instead; `e2e/read-only-mode.spec.ts`'s F097
  guard was extended to visit the Structure view with the new control names. `apps/web`'s
  `useTableDdlMutations` wraps all 8 API calls as plain async functions (not `useMutation`) since
  `TableStructure` awaits each one to know when to close its own dialog; rename/drop updates
  `App.tsx`'s selected-table state via two new reducer actions. `columnTypeCatalogForEngine` (F113)
  moved `features/schema/model/` -> `shared/lib/ddl/` since F114 is a second feature needing it and
  cross-feature imports are lint-forbidden.

  Found and fixed a real bug: `dropTable`/`dropColumn`/`dropIndex` (F110-F112) reply `204 No
Content`, but shared `fetchJson` unconditionally called `response.json()` on every 2xx - throwing
  on the empty body, silently swallowed by the caller's catch-all. Latent since no UI had called
  those three DELETE routes before F114; found via manual browser testing (network tab showed 204
  success but the UI never refreshed), not a passing test suite. Fixed `fetchJson` to return `null`
  on 204; covered by new `apps/web/tests/shared/api/fetch-json.test.ts`. Verified:
  `pnpm check:quiet:run` all green, plus manual browser verification of all 8 operations against a
  live Postgres connection, including re-verifying dropIndex/dropColumn after the fix. Not yet
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

- Finish delivering F114 (commit, push, PR, wait for CI green, then wait for the user to say it's
  merged - never merge it here), then F115 per the exec plan's Phase D order.
