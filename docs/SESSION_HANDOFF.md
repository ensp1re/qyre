# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-13.
- Branch: `feature/F117-csv-import`, based on `main` through merged PR #132.
- Queue: F106-F116 and F125-F127 are `passing`; F117 is `active`; F118-F121 and F128 remain
  `not_started`. `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128; see the plan's own progress log and
  `docs/FEATURES.json` for full per-feature evidence. F090-F116, F122-F127, F129 are merged to
  `main` (PRs #94-#132): permission/capability foundation (F090-F098, F122-F124), the row-mutation
  write path (F099-F102), the full row-editing UI (F103-F105, F125), Phase C -
  `classifyStatement`/`runQuery` classification (F106-F107), the write-capable SQL Editor
  (F108, F126-F127) - and Phase D's `SchemaDdlApi`/`DatabaseAdminApi` slices: table lifecycle
  (F110), column ops (F111, incl. SQLite's 12-step rebuild), index ops (F112), the table designer
  UI (F113), the Structure view (F114), database/schema lifecycle (F115), and its management UI
  (F116) - all gated server-side on F096 + the relevant capability flag.

## In progress

- F117 (CSV import) is implemented on `feature/F117-csv-import`. The new product contract fixes a
  10 MiB/10,000-row/256-column multipart boundary, three server modes (`inspect`, `validate`,
  `import`), scalar coercion from real introspected metadata, source-line errors, and exact engine
  semantics: Postgres/MySQL/SQLite insert in 250-row native-transaction batches through
  `commitBatch`; standalone MongoDB uses its native atomic unit, one document through `insertRow`.
  The parser streams with no temporary files and retains only the 20-row preview, current batch,
  and bounded row-error report.

  The Tables toolbar exposes Import CSV only for insert-capable tables/collections. The shared
  `CsvImportDialog` uploads for inspection, defaults exact-name mappings, invalidates a dry run when
  mappings change, previews server-coerced values, and imports valid rows with a final
  inserted/failed summary. Read-only and view/materialized-view targets hide the action; the server
  independently enforces the same kind/permission/read-only gates. Added 2 core validation, 11
  server route/service, 5 web model, and 4 UI render tests; the standing read-only E2E canary now
  includes Import CSV. `pnpm check:quiet` and `CI=1 pnpm verify:pr` are green on Node 22 against all
  local engines, smoke E2E, and full E2E.

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
- Local full E2E is fixture-contention-prone under Playwright's `fullyParallel: true`: repeated
  no-retry runs moved transient missing-table/schema/autocomplete failures among unrelated engines;
  the CI configuration's one retry passed the entire gate. Tracked in the tech-debt tracker.

## Next steps

- Review and deliver F117: commit, push, open the draft PR, wait for both CI jobs, then record its
  passing state/evidence.
