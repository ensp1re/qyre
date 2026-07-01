# Plan 0001: Postgres Inspection

Status: Active
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

## Open decisions

- SQLite driver (`packages/drivers/sqlite`) timing: immediately after Postgres vs later.
- Whether to mark F006/F007 `passing` now (their backend code + package tests already pass, the same
  starting position F001 and F003 were in before their audits surfaced real gaps) or audit them the
  same way first.
- What the next slice after the connect-and-inspect journey should be: SQLite driver, the read-only
  query runner UI (F006 already has backend support), or `humb` npm-publish packaging work.
