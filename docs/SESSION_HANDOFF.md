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

- Date: 2026-07-04
- Latest commit: see `git log --oneline -1 origin/main`
- Build status: builds (`pnpm build`)
- Test status: unit + integration tests pass (`pnpm test`, with `HUMB_TEST_DATABASE_URL` set); smoke
  - full E2E pass (`pnpm test:e2e`, `pnpm test:e2e:full`)
- Verification status: `pnpm check:ci` passes with a live Postgres available

## Completed

- Repository skeleton, product contract, verification tooling (`pnpm check`, Lefthook, CI);
  architecture reorg into `packages/drivers/*` (PR #5); `docs/FEATURES.json` gained a `commitHash`
  field (PR #8).
- **F001-F011, DF-01-DF-09 `passing`**: the full connect-and-inspect journey (CLI start, connection
  status, nav tree, paginated rows, read-only query runner, health diagnostics), SQLite as a second
  engine, and the dashboard UI redesign (title bar/sidebar/tabs/status bar, FK + version metadata).
  See `docs/FEATURES.json` for behavior/evidence, PRs #3-#35 for history, and
  `docs/exec-plans/completed/` for the SQLite/dashboard-UI plan writeups.
- **F009, F010 `passing`**: README rewrite (badges, quick-start, screenshots - PRs #25/#27) and the
  npm-publish path fix (bundled `apps/web/dist` so the published package actually serves the UI -
  PR #28).
- **F012, F013, F016, F017, F018, F019 `passing`**: SQL editor UX and engine polish - query history
  drawer, CodeMirror migration + autocomplete, structured (jsonb) cell values with a chip+drawer
  viewer, unified server/UI error handling, Postgres double-quoted-string tolerance, cross-engine
  column type fidelity (dates, bigints, binary). See `docs/FEATURES.json` for full detail.
- **F014 `passing`**: MySQL as Humb's third engine. **F015 `passing`**: MongoDB as Humb's fourth
  engine (basic read-only browsing).
- Two-pass project review (`SUGGESTIONS.md`/`SUGGESTIONS_2.md`) split into **F020-F033**
  (`docs/FEATURES.json`) and 35 rows in `docs/exec-plans/tech-debt-tracker.md`, then both review docs
  deleted (PR #46).
- **F020-F025 `passing`** (defect fixes from that review): Postgres quoted-identifier coercion no
  longer corrupts valid SQL (schema-qualified names, string literals, aliases); `assertReadOnly` no
  longer false-rejects a `;` inside string data; the rows route returns 400 not 500 on bad pagination;
  the Files-tab symlink escape is closed (real-path, not just lexical, validation); connection-string
  query-param credentials are now redacted; the server rejects non-loopback `Host` headers
  (DNS-rebinding protection). See `docs/FEATURES.json` for full evidence per feature and PRs #47-#52
  (open, stacked on #46 as of this writing).
- **F026-F033 `passing`** (remaining review defects, batched into one PR per the user's request to
  save review overhead): MongoDB `getRows` sorts by `_id` for deterministic pagination; the Schema
  tab now fetches every table via one batched `GET /api/tables` instead of one request per table;
  Postgres/MySQL pool errors route into the Console tab's event log via a new
  `DatabaseAdapter.onConnectionEvent` hook; `useHealth`/`useOverview` poll (3s/30s) so connection
  status and schema drift surface without a manual Refresh; a new `ErrorBoundary` (top-level +
  per-tab) replaces a full white-screen with a recoverable fallback; the schema tree is keyboard-
  operable with real `role="tree"`/`"treeitem"` semantics; all three SQL/document adapters cap
  query/row-fetch time via a shared `HUMB_STATEMENT_TIMEOUT_MS` env var. Every fix verified live
  (Preview and/or real Postgres/MySQL/MongoDB containers), not just unit-tested - see
  `docs/FEATURES.json` for evidence per feature. Changing schema-tree rows from `role="button"` to
  `"treeitem"` (F031) broke two e2e locators, caught by a full `pnpm test:e2e:full` run and fixed in
  the same batch. **All of F001-F033 and DF-01-DF-09 are now `passing`.**
- The remaining 29 (of 35) `tech-debt-tracker.md` rows were promoted into **F034-F062** and split
  into 4 batches/PRs at the user's request (one per session, so a batch always fits) - see "Next
  steps" for the full breakdown. The other 6 rows stay deferred (need a product-spec pass first:
  `--demo` mode, switching DB connections without restart, `DatabaseAdapter` capability redesign,
  full server-side sort/streamed export).
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
  evidence per feature. PR not yet opened as of this writing.

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

Batches 1-2 (F034-F046) are `passing`; F047-F062 are `not_started` in `docs/FEATURES.json` and
queued as 2 more batches/PRs, in order:

- **Batch 3, F047-F053 (Performance & architecture cleanup)**: shared tuning-constants module,
  Postgres `getTable` round-trip consolidation, shared `SqlAdapterBase`, `runReadOnlyQuery` result
  cap, `RowsTable`/query-result virtualization, `App.tsx` decomposition, an engine-list-lockstep
  test. Branch: `feature/F047-F053-perf-arch-batch`.
- **Batch 4, F054-F062 (Testing, docs, devx & product quick wins)**: adapter-conformance test suite,
  `@humbdb/ui` component tests, env-skip-guard + E2E axe checks, `.env.example`/`docker-compose.yml`,
  `CONTRIBUTING.md`, engine-list drift fix + `check-readme.mjs` extension, connection-string/
  troubleshooting doc, clickable FK columns, run-`.sql`-in-editor. Branch:
  `feature/F054-F062-testing-docs-batch`.

Each batch's exact scope/behavior is already recorded per-feature in `docs/FEATURES.json` (state
`not_started`, `spec` pointing at the relevant product-spec doc or `null`) - a fresh session can pick
up the next batch directly from there without re-deriving scope. Before starting: re-read this file's
"Known issues / blockers" (the bare `humb` npm package dispute is the one open item), open Batch 2's
PR if it isn't open yet, then branch Batch 3 off `main` (not off Batch 2's branch, so each PR's diff
stays independent). The 6 tech-debt rows still deferred (see "Completed") need their own product-spec
pass before implementation - don't fold them into these batches without doing that first.
