# SESSION_HANDOFF.md

The structured handoff between sessions. Update this before ending any session. A fresh agent should
be able to resume from this file plus `docs/FEATURES.json` in a few minutes.

Validated by `scripts/check-handoff.mjs` (all sections must be present).

**Keep this file short.** It orients a fresh agent in minutes, not archives history - a new session
doesn't need a play-by-play of what shipped weeks ago, only what's still load-bearing right now.
`docs/FEATURES.json`'s `evidence` field is already the durable, detailed record of what shipped and
why (plus the PR itself); this file doesn't need to duplicate that. Whenever the "Completed" section
gets long (a screenful or more), compress older entries down to one line each - id, one-clause
summary, PR link - in the same pass, not as a separate cleanup task later. Keep full detail only for
work that's still in flight (unmerged PRs, open questions) or genuinely still relevant (environmental
gotchas in "Known issues / blockers").

## Current state

- Date: 2026-07-05
- Latest commit: see `git log --oneline -1 origin/main`
- Build status: builds (`pnpm build`)
- Test status: unit + integration tests pass (`pnpm test`, with `HUMB_TEST_DATABASE_URL` set); smoke
  - full E2E pass (`pnpm test:e2e`, `pnpm test:e2e:full`)
- Verification status: `pnpm check:ci` passes with a live Postgres available

## Completed

- Repository skeleton, product contract, verification tooling (PR #5, #8).
- **F001-F011, DF-01-DF-09 `passing`**: connect-and-inspect journey, SQLite (2nd engine), dashboard
  UI redesign, README rewrite, npm-publish path fix. PRs #3-#35.
- **F012-F019 `passing`**: SQL editor UX (history, CodeMirror, autocomplete), structured jsonb
  cells, unified error handling, MySQL (3rd engine), MongoDB (4th engine), cross-engine type
  fidelity.
- **F020-F033 `passing`**: two-pass project review fixes - Postgres quoted-identifier coercion,
  read-only `;`-in-string false-positive, rows-route 400s, Files-tab symlink escape,
  connection-string redaction, DNS-rebinding Host check, Mongo pagination stability, Schema-tab
  batched fetch, pool-error logging, health/schema polling, `ErrorBoundary`, schema-tree keyboard
  a11y, per-engine statement timeouts (PRs #47-#52).
- **F034-F040 `passing`** (batch 1, UX & a11y polish, [PR #54](https://github.com/ensp1re/humb/pull/54)):
  all-4-engines empty-state copy, CSV formula-injection escaping, `useRows`'s real-probe `hasMore`
  fix, schema-tree search-hint threshold, non-color connection-status affordance, shared
  `useFocusTrap` hook, platform-aware Cmd/Ctrl+Enter hint.
- **F041-F046 `passing`** (batch 2, reliability & server hardening,
  [PR #55](https://github.com/ensp1re/humb/pull/55)): bounded query-hook retries, `/api/health`
  latency/error reporting, CLI shutdown-handler hardening, static-asset compression/caching,
  MongoDB `normalizeBsonValue` coverage (including the native-`RegExp` case the driver actually
  decodes to), driver read-only re-export cleanup.
- **F047-F053 `passing`** (batch 3, performance & architecture cleanup,
  [PR #56](https://github.com/ensp1re/humb/pull/56)): shared `DEFAULT_PAGE_SIZE`/`MAX_PAGE_SIZE`
  constants, Postgres `getTable` query consolidation/parallelization, shared
  `runInReadOnlyTransaction` helper, `capResultRows`'s 1000-row cap, `RowsTable`/SQL-editor result
  virtualization, `App.tsx` tab-component split, `check-engine-lockstep.mjs` (caught a real
  `PUBLISH_ORDER` drift - `@humbdb/mysql`/`@humbdb/mongodb` were missing).
- **F054-F062 `passing`** (batch 4, testing/docs/devx/product quick wins,
  [PR #57](https://github.com/ensp1re/humb/pull/57)): a new
  `@humbdb/testing-conformance` package runs a shared parametrized suite (pagination clamping,
  empty-collection handling) across all 4 engines - it's a separate package from `@humbdb/testing`
  itself because importing all 4 drivers there would create a build cycle (caught live via
  `pnpm typecheck`'s cyclic-dependency error, since the drivers already devDepend on
  `@humbdb/testing`'s fixtures); `@humbdb/ui` gained 40 component render tests (RTL + jsdom, with a
  shared `test-setup.ts` for RTL cleanup and `@tanstack/react-virtual`'s `offsetWidth`/`offsetHeight`
  jsdom quirk); E2E gained baseline `axe` accessibility scans (fixed a real CodeMirror
  `aria-input-field-name` violation; color-contrast is a known, tracked, pre-existing gap - see
  `tech-debt-tracker.md`); a committed `docker-compose.yml` + extended `.env.example` mirror CI's
  Postgres/MySQL/Mongo services; a human-facing `CONTRIBUTING.md`; `check-readme.mjs` now asserts
  every engine is named in README (caught a real drift - MongoDB was missing from the Status
  section); a new `docs/CONNECTING.md`; FK columns in `RowsTable` are clickable and navigate to the
  referenced table (Postgres/MySQL/SQLite's `getTable` now resolve what a FK references, not just
  that it is one - verified live in Preview against a real SQLite FK fixture); the Files tab can run
  a previewed `.sql` file into the SQL editor. **All of F001-F062 and DF-01-DF-09 now `passing`** -
  every tech-debt row that didn't need a product-spec pass first is done. See `docs/FEATURES.json`
  for evidence per feature.
- [PR #58](https://github.com/ensp1re/humb/pull/58) (merged, docs-only): product-spec pass on 3
  remaining tech-debt rows - `docs/product-specs/adapter-capabilities.md` (F063),
  `database-switching.md` (F064), `server-side-sort-export.md` (F065/F066). No code, just specs +
  new `not_started` `FEATURES.json` entries.
- **F063 `passing`** ([PR #59](https://github.com/ensp1re/humb/pull/59), merged; PR #60 for the
  evidence-link follow-up): `DatabaseOverview` gains `capabilities.supportsSql`, declared by each
  adapter's `getOverview()` (true for Postgres/MySQL/SQLite, false for MongoDB); `apps/web` reads
  that instead of `engine === "mongodb"` to disable the SQL Editor tab/Files-tab "Run in editor"
  action. `SqlEditorTab`'s `isMongo` prop renamed to `sqlDisabled`. Verified live via Preview
  against a real Postgres container (`supportsSql: true`, tab enabled) and a real MongoDB
  container (`supportsSql: false`, tab disabled, same tooltip copy as before).
- **F064 `passing`** ([PR #61](https://github.com/ensp1re/humb/pull/61)): `CreateServerOptions` gains an optional `adapterFactories` field; when
  provided, a new `POST /api/connect` swaps in a new adapter/target (only after a ping confirms
  it's live) without restarting the process - `createServer`'s `adapter`/`target` are now mutable
  closure state instead of `const`. The title bar's previously-disabled Settings button opens a new
  `ConnectDrawer` (current target, connect form, up to 5 recent targets in `localStorage`).
  Live-caught bug fixed in the same commit: an unreachable-host connection failure throws Node's
  `AggregateError`, whose own `.message` is empty (the real reason is in `.errors[0]`) - a new
  `describeError()` helper fixes this for both the new endpoint and the pre-existing
  `/api/health` ping-failure path, which had the same latent bug. Verified live via Preview:
  switched a running instance between a real Postgres and a real MySQL container and back (not
  just a different database - a different engine entirely), confirmed a failed switch (bad host)
  leaves the old connection fully queryable with a real error message, confirmed recent-targets
  reconnect correctly.

## In progress

- Nothing in flight. F065/F066 (server-side sort/export, specced in PR #58) are the natural next
  slice, sharing one spec/PR since export honors the same sort.

- Publishing the bare `humb` npm package (`packages/humb`) alongside `@humbdb/humb` is blocked on an
  npm name-similarity dispute (too close to `humps`/`htm`/`dumi`/`pump`/`umi`) - once cleared, retry
  with `node scripts/publish.mjs --only humb`. All `@humbdb/*` packages publish fine in the meantime.
  `scripts/publish.mjs`'s `run()` helper now reports a failed command cleanly instead of a raw stack
  trace (PR #38).

## Known issues / blockers

- The bare `humb` npm package is blocked pending npm's name-dispute review (see "In progress") - no
  code changes needed once it clears, just the retry command.
- An animated demo (GIF/asciicast) for the README remains a legitimate follow-up - F009 shipped with
  static screenshots instead.
- The local Postgres fixture container (`humb-rename-pg`, port 5433) and MySQL fixture container
  (`humb-mysql`, port 3307) do not persist across a Docker Desktop restart - recreate them if
  `pnpm test:e2e:full`/manual Preview testing gets `ECONNREFUSED`:
  - Postgres: `docker run --rm -d --name humb-rename-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16-alpine`,
    then reseed (`pnpm exec tsx .local/seed-dev-data.ts postgres://postgres:postgres@localhost:5433/postgres`
    for the dev dataset; `setupFixture` from `@humbdb/testing` for the e2e fixture table).
  - MySQL: `docker run --rm -d --name humb-mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=humb_test -p 3307:3306 mysql:8`
    (slower to become ready than Postgres); `setupMysqlFixture` from `@humbdb/testing` creates the
    e2e fixture table.
  - The Postgres container has accumulated the full dev-seed dataset (11 tables) across sessions, not
    just the fixture table - a Schema-tab assertion expecting exactly one `table-detail` card will
    fail against it (harmless environmental noise, not a regression).

## Next steps

With F063 and F064 both `passing`, the last specced-but-unimplemented feature is:

- **F065/F066** (`docs/product-specs/server-side-sort-export.md`): `sortColumn`/`sortDirection`
  params on the rows endpoint (validated against real column names server-side - the actual
  injection surface, since `page`/`pageSize` are already numeric-coerced but a column name isn't),
  plus a new streamed `GET .../export.csv` endpoint replacing today's page-only CSV export. These
  two share one spec/PR since export honors the same sort.

`--demo` mode remains the one tech-debt row with no spec yet - still needs its own product-spec pass
before implementation if picked up. See `docs/exec-plans/tech-debt-tracker.md` for its row (and
the residual MongoDB-fake-fields half of F063's old row, deliberately left unaddressed - see
`docs/product-specs/adapter-capabilities.md`'s "Out of scope").
