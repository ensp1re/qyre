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
- Test status: unit + integration tests pass (`pnpm test`, with `QYRE_TEST_DATABASE_URL` set); smoke
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
- **F034-F062 `passing`** (4 batches draining the two-pass review's remaining 29 tech-debt rows):
  batch 1 UX/a11y ([PR #54](https://github.com/ensp1re/qyre/pull/54)), batch 2 reliability/server
  hardening ([PR #55](https://github.com/ensp1re/qyre/pull/55)), batch 3 performance/architecture
  ([PR #56](https://github.com/ensp1re/qyre/pull/56)), batch 4 testing/docs/devx/product
  ([PR #57](https://github.com/ensp1re/qyre/pull/57) - new `@qyre/testing-conformance` package,
  `@qyre/ui` component tests, E2E `axe` scans, `docker-compose.yml`, `CONTRIBUTING.md`,
  `docs/CONNECTING.md`, clickable FK columns, Files-tab "Run in editor"). See `docs/FEATURES.json`
  for evidence per feature.
- [PR #58](https://github.com/ensp1re/qyre/pull/58) (merged, docs-only): product-spec pass on the
  3 remaining tech-debt rows that didn't need `--demo` mode's kind of scoping -
  `docs/product-specs/adapter-capabilities.md` (F063), `database-switching.md` (F064),
  `server-side-sort-export.md` (F065/F066).
- **F063 `passing`** ([PR #59](https://github.com/ensp1re/qyre/pull/59)/[#60](https://github.com/ensp1re/qyre/pull/60)):
  `DatabaseOverview.capabilities.supportsSql` replaces `apps/web`'s `engine === "mongodb"` checks
  for disabling the SQL Editor tab/Files-tab "Run in editor".
- **F064 `passing`** ([PR #61](https://github.com/ensp1re/qyre/pull/61)): `POST /api/connect`
  swaps in a new adapter/target (only after a ping confirms it's live) without restarting the
  process; the title bar's Settings button opens a `ConnectDrawer` (current target, connect form,
  recent targets). Live-caught bug fixed in the same commit: an unreachable-host failure throws
  Node's `AggregateError` with an empty top-level `.message` - a new `describeError()` helper
  fixes this for both the new endpoint and the pre-existing `/api/health` ping-failure path, which
  had the same latent bug. Verified live by switching a running Preview instance between a real
  Postgres and a real MySQL container and back.
- **F065/F066 `passing`**: `GET .../rows` gains `sortColumn`/`sortDirection` (validated against the
  table's real columns server-side - the actual injection surface, since a column name can't be
  parameter-bound the way `page`/`pageSize` already are); each adapter's `getRows` translates it to
  `ORDER BY`/`.sort()`. `RowsTable` is now a controlled component for sort (no longer reorders rows
  itself). A new streamed `GET .../export.csv` replaces the old page-only CSV export, fetching in
  bounded `MAX_PAGE_SIZE` batches rather than materializing the whole table in memory. Verified
  live against a real 10,000-row Postgres table: sort persisted correctly across pagination, and
  the export produced a full 10,001-line CSV (header + every row) via a real browser download.

## In progress

- Nothing in flight - F065/F066 are `passing`. With `--demo` mode the only tech-debt row left with
  no spec (see "Next steps"), there's no more pre-scoped work queued.

- Publishing the bare `qyre` npm package (`packages/qyre`) alongside `@qyre/qyre` is blocked on an
  npm name-similarity dispute (too close to `humps`/`htm`/`dumi`/`pump`/`umi`) - once cleared, retry
  with `node scripts/publish.mjs --only qyre`. All `@qyre/*` packages publish fine in the meantime.
  `scripts/publish.mjs`'s `run()` helper now reports a failed command cleanly instead of a raw stack
  trace (PR #38).

## Known issues / blockers

- The bare `qyre` npm package is blocked pending npm's name-dispute review (see "In progress") - no
  code changes needed once it clears, just the retry command.
- An animated demo (GIF/asciicast) for the README remains a legitimate follow-up - F009 shipped with
  static screenshots instead.
- The local Postgres fixture container (`qyre-rename-pg`, port 5433) and MySQL fixture container
  (`qyre-mysql`, port 3307) do not persist across a Docker Desktop restart - recreate them if
  `pnpm test:e2e:full`/manual Preview testing gets `ECONNREFUSED`:
  - Postgres: `docker run --rm -d --name qyre-rename-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16-alpine`,
    then reseed (`pnpm exec tsx .local/seed-dev-data.ts postgres://postgres:postgres@localhost:5433/postgres`
    for the dev dataset; `setupFixture` from `@qyre/testing` for the e2e fixture table).
  - MySQL: `docker run --rm -d --name qyre-mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=qyre_test -p 3307:3306 mysql:8`
    (slower to become ready than Postgres); `setupMysqlFixture` from `@qyre/testing` creates the
    e2e fixture table.
  - The Postgres container has accumulated the full dev-seed dataset (11 tables) across sessions, not
    just the fixture table - a Schema-tab assertion expecting exactly one `table-detail` card will
    fail against it (harmless environmental noise, not a regression).

## Next steps

**All 4 tech-debt-tracker.md rows specced this session (F063-F066) are now `passing`.** The only
tech-debt row left is `--demo` mode (a zero-setup trial with a bundled sample DB) - it still needs
its own product-spec pass before implementation (scope: what sample data/schema to ship, how it's
presented) if picked up; see `docs/exec-plans/tech-debt-tracker.md` for its row. The residual
MongoDB-fake-fields half of F063's old row is deliberately left unaddressed - see
`docs/product-specs/adapter-capabilities.md`'s "Out of scope".

With that, there is no more pre-scoped tech-debt work queued - a fresh session asking "what's next"
should either start `--demo` mode's product-spec pass, or ask the user what to prioritize next.
