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
- `pnpm test:e2e:golden` must pass with `HUMB_TEST_DATABASE_URL` set (CI provides Postgres).

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
  now works end to end — it stays `active` only because its verification command is a golden-journey
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

## Open decisions

- SQLite (`db-sqlite`) timing: immediately after Postgres vs later.
- Whether the query runner ships in the first golden journey or as a follow-up slice.
- Whether to mark F006/F007 `passing` now (their backend code + package tests already pass, the same
  starting position F001 and F003 were in before their audits surfaced real gaps) or audit them the
  same way first.
