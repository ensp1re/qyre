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

Every feature in `docs/FEATURES.json` through **F025** is `passing`. **F026-F033 are `not_started`
and unprioritized among themselves** (Mongo pagination stability, Schema-tab fan-out, pool-error
logging, health-poll dormancy, missing error boundary, schema-tree keyboard a11y, missing statement
timeouts, stale-cache freshness) - pick one or ask the user which to tackle first; at most one may
be `active` at a time. Before starting new work: re-read this file's "Known issues / blockers" (the
bare `humb` npm package dispute is the one open item), or ask the user what they'd like next. If
picking a new feature area instead, write its product spec under `docs/product-specs/` and add a
`docs/FEATURES.json` entry before writing code (this repo's working contract - see `AGENTS.md`), and
consider whether it warrants its own `docs/exec-plans/active/NNNN-*.md` plan doc if it's more than
one slice.
