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
  UI redesign. PRs #3-#35; plan writeups in `docs/exec-plans/completed/`.
- **F009, F010 `passing`**: README rewrite; npm-publish path fix. PRs #25/#27/#28.
- **F012-F019 `passing`**: SQL editor UX (history, CodeMirror, autocomplete), structured jsonb
  cells, unified error handling, MySQL (3rd engine), MongoDB (4th engine), cross-engine type
  fidelity.
- **F020-F033 `passing`**: two-pass project review (`SUGGESTIONS*.md`, deleted after triage per PR
  #46) fixed - Postgres quoted-identifier coercion, read-only `;`-in-string false-positive, rows-
  route 400s, Files-tab symlink escape, connection-string redaction, DNS-rebinding Host check
  (PRs #47-#52), Mongo pagination stability, Schema-tab batched fetch, pool-error Console logging,
  health/schema polling, `ErrorBoundary`, schema-tree keyboard a11y, per-engine statement timeouts.
  **All of F001-F033 and DF-01-DF-09 passing.** Split the remaining 35 tech-debt rows into
  **F034-F062**, batched into 4 PRs (see "Next steps"); 6 rows stay deferred needing a product-spec
  pass first (`--demo` mode, switching DB connections, `DatabaseAdapter` capability redesign, full
  server-side sort/streamed export).
- **F034-F040 `passing`** (batch 1, UX & accessibility polish, on `feature/F034-F040-ux-a11y-batch`):
  empty-state copy lists all 4 engines instead of "Postgres or SQLite"; CSV export escapes leading
  `=`/`+`/`-`/`@` against spreadsheet formula injection; `useRows` derives `hasMore` from a real
  probe at the next page's offset instead of `rows.length === pageSize` (wrong on an exact-page-size
  boundary - verified against the real 10,000-row `events` fixture and a purpose-built 25-row table);
  schema-tree search hints at 1 character instead of silently showing the unfiltered tree; connection
  status gets a distinct icon shape + `aria-label`, not color alone; the cell-value and query-history
  drawers share a new `useFocusTrap` hook (traps Tab, restores focus to the trigger on close); the
  Cmd/Ctrl+Enter hint is platform-aware and repeated as the Run button's `title`. Every
  fix verified live via Preview with real focus/keyboard events - see `docs/FEATURES.json` for
  evidence per feature. Merged via [PR #54](https://github.com/ensp1re/humb/pull/54).
- **F041-F046 `passing`** (batch 2, reliability & server hardening, on
  `feature/F041-F046-reliability-batch`): the 6 query hooks named in that tech-debt row
  (`use-health`/`use-overview`/`use-table`/`use-rows`/`use-files`/`use-console`) share a bounded
  2-retry policy instead of `retry: false`; `/api/health` reports `pingLatencyMs`/`lastError`
  (surfaced as a status-bar tooltip); the CLI's `SIGINT`/`SIGTERM` handler gets a shutdown timeout, a
  re-entrancy guard, and a non-zero exit on teardown failure via a new testable
  `createShutdownHandler`; static assets are compressed (`@fastify/compress`) and hashed bundle
  assets get a long immutable `Cache-Control` while `index.html` stays `no-cache`; MongoDB's
  `normalizeBsonValue` gives `Timestamp`/`Code`/`BSONRegExp`/the native `RegExp` the driver actually
  decodes a BSON regex into by default/`MinKey`/`MaxKey`/`BSONSymbol` each a dedicated branch
  (verified live end-to-end against a real MongoDB container, which is also what caught the
  native-`RegExp` case - `BSONRegExp` alone wasn't enough); Postgres/MySQL/SQLite no longer
  re-export `assertReadOnly`/`ReadOnlyViolationError` verbatim. See `docs/FEATURES.json` for
  evidence per feature. Merged via [PR #55](https://github.com/ensp1re/humb/pull/55).
- **F047-F053 `passing`** (batch 3, performance & architecture cleanup, on
  `feature/F047-F053-perf-arch-batch`): shared `DEFAULT_PAGE_SIZE`/`MAX_PAGE_SIZE` constants in
  `@humbdb/core` (apps/web's own `UI_PAGE_SIZE` stays local - importing a real value from
  `@humbdb/core`'s barrel drags in `connection-target.ts`'s Node-only imports and broke Vite's
  browser build, caught live); Postgres `getTable` combines its PK/FK queries into one and runs all
  4 remaining round-trips in parallel; a shared `runInReadOnlyTransaction` helper
  (`@humbdb/driver-contract`) replaces the begin/commit/rollback ceremony Postgres/MySQL's
  `runReadOnlyQuery` both duplicated; `runReadOnlyQuery` now wraps `SELECT`/`WITH`/`VALUES`/`TABLE`
  in an outer `LIMIT 1000` (`capResultRows`) across Postgres/MySQL/SQLite; `RowsTable` and the SQL
  Editor's result table virtualize row rendering (`@tanstack/react-virtual`) - verified live that a
  1000-row capped result only mounts ~15-25 DOM rows; `App.tsx`'s ~290-line tab-routing ternary is
  split into 5 per-tab components; a new `check-engine-lockstep.mjs` (wired into `check:state`)
  caught and fixed a real pre-existing drift - `@humbdb/mysql`/`@humbdb/mongodb` were both missing
  from `scripts/publish.mjs`'s `PUBLISH_ORDER`. See `docs/FEATURES.json` for evidence per feature.
  PR #56 (open as of this writing).

## In progress

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

Batches 1-3 (F034-F053) are `passing`; F054-F062 are `not_started` in `docs/FEATURES.json` and
queued as the last batch/PR:

- **Batch 4, F054-F062 (Testing, docs, devx & product quick wins)**: adapter-conformance test suite,
  `@humbdb/ui` component tests, env-skip-guard + E2E axe checks, `.env.example`/`docker-compose.yml`,
  `CONTRIBUTING.md`, engine-list drift fix + `check-readme.mjs` extension, connection-string/
  troubleshooting doc, clickable FK columns, run-`.sql`-in-editor. Branch:
  `feature/F054-F062-testing-docs-batch`.

Each feature's exact scope/behavior is already recorded in `docs/FEATURES.json` (state
`not_started`, `spec` pointing at the relevant product-spec doc or `null`) - a fresh session can pick
it up directly from there without re-deriving scope. Before starting: re-read this file's "Known
issues / blockers" (the bare `humb` npm package dispute is the one open item), open Batch 3's PR if
it isn't open yet, then branch Batch 4 off `main` (not off Batch 3's branch, so each PR's diff stays
independent). Once Batch 4 ships, every one of the 29 tech-debt rows promoted into F034-F062 is
done - only the 6 rows needing a product-spec pass first remain in `tech-debt-tracker.md` (see
"Completed"); don't fold them into Batch 4 without doing that spec pass first.
