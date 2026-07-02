# Plan 0001: Postgres Inspection

Status: Completed (2026-07-02) - all linked features (F001-F007) are `passing`; see each one's
`evidence` in `docs/FEATURES.json` for verification detail. Superseded by
[`0002-sqlite-engine.md`](../active/0002-sqlite-engine.md) for the next engine.
Owner: unassigned
Linked features: F001-F007 (`docs/FEATURES.json`)

## Objective

Deliver the Postgres engine contract, the first slice of Humb's universal database inspector:
`npx humb <database-url>` detects the engine, starts a local server, opens the browser UI, and lets
a developer inspect a Postgres database (schemas, tables, columns, rows) read-only.

## Scope

In scope: F001-F007 as defined in `docs/FEATURES.json`.

Out of scope: writes/DDL, multiple connections, non-Postgres engines, auth/remote hosting.

## Verification path

- `pnpm check` must pass (format, lint, typecheck, test, build, project-state checks).
- `pnpm test:e2e` smoke must pass.
- `pnpm test:e2e:full` must pass with `HUMB_TEST_DATABASE_URL` set (CI provides Postgres).

## Risks and blockers

- Cross-package type/runtime resolution must stay consistent (paths for typecheck, dist at runtime).
- E2E requires Postgres availability; CI provides a service container.

## Progress log

- 2026-06-30 (`a0ae2f7`): Repository skeleton, agent docs, tooling, and verification gates created.
  `pnpm check` and the smoke E2E pass. This commit also checked in working CLI/server/adapter code
  (see 2026-07-01 entry) that `docs/FEATURES.json` did not reflect at the time.
- 2026-07-01: Discovered `a0ae2f7` already implements most of F001 (CLI parses target, starts
  server, opens browser) with its package-level verification (`pnpm --filter humb test`) passing.
  Marked F001 `passing`, then auditing it against the full spec (rather than trusting the unit
  tests alone) found two real gaps: `HUMB_PORT` was ignored, and the server had no static-serving
  route so a real launch 404'd at `/`. Fixed both (`resolvePort()` in `packages/cli`; `webRoot`
  support via `@fastify/static` in `packages/server`), re-verified manually end to end against a
  real Postgres container, and updated F001's evidence accordingly. F003/F006/F007 backend code and
  package-level tests also already exist and pass, but are left `not_started` pending an explicit
  decision to record them (not done silently — see `docs/SESSION_HANDOFF.md`). Moved F002 to
  `active`: `apps/web/src/App.tsx` already renders real connection status (not a bare scaffold, as
  an earlier note in this log incorrectly said), so with the static-serving fix the behavior itself
  now works end to end — it stays `active` only because its verification command is an end-to-end
  spec shared with F004/F005, which aren't implemented yet (no nav tree or table view).
- 2026-07-01: Audited F003 the same way. Found bigger gaps than F001: introspection logic had zero
  test coverage, and indexes/row counts were entirely unimplemented (missing from `@humb/core`'s
  contract, not just the adapter). Added `IndexMetadata` to core, implemented index + approximate
  row-count introspection in `packages/db-postgres`, added integration tests against a real Postgres
  (reusing `@humb/testing`), fixed a Turborepo strict-env-mode gap that silently dropped
  `HUMB_TEST_DATABASE_URL` from the `test` task, and added a Postgres service to CI's `check` job.
  Manual verification caught a bug the new test didn't: index `columns` came back as a raw Postgres
  array-literal string, not a JS array (no `pg` type parser for arrays of the internal `name` type);
  fixed with an explicit `::text` cast and strengthened the test's assertions. F003 marked `passing`.
- 2026-07-01: Architecture reorganization (folder rules now in `docs/CODE_ORGANIZATION.md`):
  `@humb/core` split into `types/`/`errors.ts`/`connection-target.ts`/`validation/` and gained
  `ConnectionStatus`/`HealthResponse` (previously hand-duplicated in `apps/web`/`packages/ui`);
  `@humb/ui` split into one component per file; `apps/web` got `api/`/`hooks/`; a genuinely
  engine-agnostic `resolvePageRequest()` moved into the driver contract package (SQL identifier
  quoting deliberately stayed put - it differs per engine). Renamed/moved
  `packages/db-adapter` -> `packages/drivers/contract` (`@humb/driver-contract`) and
  `packages/db-postgres` -> `packages/drivers/postgres` (`@humb/postgres`); required a
  `packages/drivers/*` entry in `pnpm-workspace.yaml`. Re-verified `pnpm check`, a real CLI run
  against live Postgres, and the smoke E2E after the move.
- 2026-07-01: Implemented F002+F004 (nav tree + table metadata): `SchemaTree`/`TableDetail` in
  `@humb/ui`, `api/`+`hooks/` in `apps/web`, wired into `App.tsx`. Getting the full journey test to
  actually pass surfaced a real E2E infra gap: Playwright's `webServer` only ran `vite preview`
  (no backend at all), so `/api/health` always failed regardless of frontend completeness. Replaced
  it with `e2e/server.ts` - the real Humb server, API + built web app on one port, connecting to
  Postgres only when `HUMB_TEST_DATABASE_URL` is set. Also strengthened the spec (previously only
  asserted the fixture table name appeared as text, which would pass without any real interaction -
  now clicks the table and asserts a column becomes visible), and renamed it:
  `golden-journey.spec.ts` -> `connect-and-inspect.spec.ts`, tag `@golden` -> `@full`, script
  `test:e2e:golden` -> `test:e2e:full` ("golden journey" was unclear jargon). F002 and F004 marked
  `passing`; F005 (rows) is the one remaining piece, with a `TODO(F005)` left in the spec.
- 2026-07-01: Added a `commitHash` field to `docs/FEATURES.json` (enforced by
  `scripts/check-features.mjs`) so a `passing` feature's actual pushed commit is a validated field,
  not just prose inside `evidence`.
- 2026-07-01: Implemented F005 (paginated table rows), the last piece of the connect-and-inspect
  journey. Added `RowsTable` (`@humb/ui`), `api/rows.ts` + `useRows` (`apps/web`, TanStack Query's
  `keepPreviousData` to avoid flicker between pages), wired below `TableDetail` with Previous/Next
  controls. No exact total row count from the backend, so "can go next" uses a
  `rows.length === pageSize` heuristic; manually verified the boundary via `curl` with `page=0`/`1`
  at `pageSize=2` against the 3-row fixture. `connect-and-inspect.spec.ts` now asserts real fixture
  row values are visible. F005 marked `passing` - F001 through F005 are all `passing`, and the
  connect-and-inspect journey is fully green end to end.
- 2026-07-01: Audited F006 (read-only query runner) the same way as F001/F003. This one turned up a
  **real, exploitable security bug**, not just a UX/coverage gap: `assertReadOnly` only checked the
  leading keyword, so a writable CTE (`WITH deleted AS (DELETE FROM t RETURNING *) SELECT * FROM
deleted`) starts with the allowed "with" keyword but actually deletes data - proved this by running
  it through the real adapter against a live table and watching a row disappear, before fixing
  anything. Fixed with two layers: (1) `assertReadOnly` now scans the whole statement for forbidden
  keywords, not just the leading one (stripping comments/literals/quoted identifiers first to avoid
  false positives); (2) the authoritative fix - `runReadOnlyQuery` now runs inside a real Postgres
  `READ ONLY` transaction, so Postgres itself refuses any write regardless of what the string check
  misses. Proved layer 2 independently with a test that hides a `DELETE` inside a plpgsql function
  (`SELECT some_function()` has no forbidden keyword in its text at all - only the transaction
  backstop catches it). Also fixed: a rejected query returned HTTP 500 instead of 400 - moved
  `ReadOnlyViolationError` from `@humb/postgres` to `@humb/driver-contract` (engine-agnostic; every
  engine's query runner needs it) so `packages/server` can catch it without depending on a concrete
  engine. Built the missing UI (`QueryRunner` in `@humb/ui`, wired via `apps/web`'s `api/query.ts` +
  `useRunQuery`), verified success/rejection/writable-CTE cases through the real HTTP path. Broadened
  F006's verification command to also run `pnpm --filter @humb/postgres test` - the security-critical
  logic lives there, and the original `@humb/server`-only command would never re-run those tests.
- 2026-07-01: Audited F007 (health/runtime diagnostics) the same way as F001/F003/F006, resolving
  the open decision below in favor of auditing first. `/api/health` (built as part of F001) itself
  behaved correctly, but the audit found a real crash bug, not just a coverage gap: node-postgres's
  `Pool` emits an unhandled `"error"` event when an idle client's connection is severed by the
  database (restart, network blip, admin kill) - since nothing listened for it, that crashed the
  entire Node process instead of `/api/health` ever getting a chance to report `"disconnected"`.
  Confirmed live: started the CLI against a real Postgres container, stopped the container
  mid-session, and watched the whole server process die instead of degrading gracefully. Fixed with
  a `pool.on("error", ...)` listener in `packages/drivers/postgres/src/index.ts`'s `connect()` that
  logs instead of crashing - re-verified live that killing the database now leaves the server up and
  `/api/health` correctly reports `"disconnected"`, and that a subsequent `SIGINT` still shuts down
  cleanly. Added a regression test (`postgres-adapter.integration.test.ts`) that reproduces the exact
  failure against a real database via `pg_terminate_backend` on an idle pooled connection - confirmed
  it fails (uncaught exception) without the fix and passes with it. Broadened F007's verification
  command to also run `pnpm --filter @humb/postgres test`, matching F006's precedent, since that's
  where the fix actually lives. F007 marked `passing`.

## Open decisions

- SQLite driver (`packages/drivers/sqlite`) timing: immediately after Postgres vs later.
- What the next slice after F006/F007 should be: SQLite driver, or `humb` npm-publish packaging work.
