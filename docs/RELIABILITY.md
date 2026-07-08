# RELIABILITY.md

How Qyre proves it is healthy and restartable. Only a full-pipeline run counts as real verification.

## Standard paths

- Bootstrap: `pnpm install`
- Verification (local): `pnpm check` - requires the live test databases below
- Verification (same coverage, failing tasks only in output): `pnpm check:quiet`
- Verification (CI-equivalent, adds E2E): `pnpm check:ci`
- Delivery gate: `pnpm verify:pr` - detects/starts Docker databases, supplies standard local URLs,
  then runs the quieter full package gate plus smoke/full E2E; the pre-push hook invokes it.
- Start app (dev): `pnpm dev`
- Start product (once implemented): `qyre <database-url>` (engine auto-detected from the target)

## Verification hierarchy

A change is not done until the required levels pass, in order:

1. Static: formatting, lint, typecheck.
2. Unit: package unit tests (Vitest).
3. Integration: adapter tests against real Postgres, MySQL, and MongoDB instances (require
   `QYRE_TEST_DATABASE_URL`, `QYRE_TEST_MYSQL_URL`, and `QYRE_TEST_MONGO_URL` respectively;
   `docker compose up -d` starts all three with the credentials in `.env.example`, matching
   CI's service containers exactly). Each suite fails loudly if its env var is unset - required
   verification is never silently skipped. Because the pre-push hook runs `pnpm check`, these
   env vars must be exported in the shell you push from.
4. End-to-end: Playwright's full connect-and-inspect journey for cross-component changes.

The delivery gate runs all four levels locally before push. Never use `--no-verify`. If Docker is
installed but unavailable, start/repair it and rerun; CI is not a substitute for an available local
stack.

Do not skip a required level. Passing unit tests alone does not mean a cross-component feature is done.

## End-to-end journeys

1. Connect and inspect (primary): start Qyre against each supported engine, show connected, list
   schemas/tables or databases/collections, open one, and view rows/documents.

Each journey has a repeatable verification path and clear failure signals.

### How the connect-and-inspect journey is verified

- `apps/web` E2E `smoke.spec.ts`: always runs, no database required. Confirms the UI boots and the
  connection screen renders. Part of `pnpm test:e2e` and `pnpm check:ci`.
- `connect-and-inspect.spec.ts` runs against Postgres, SQLite, MySQL, and MongoDB. External engines
  require their `QYRE_TEST_*` URL and fail with actionable messages when missing; SQLite manages its
  generated fixture locally.
- Every project uses `e2e/server.ts`, which starts the real Qyre server (API + built web app), not a
  separate `vite preview` process. SQL-only specs skip MongoDB explicitly.

## Required runtime signals

- structured logs for startup and critical flows
- a health endpoint reporting server + database connectivity
- user-visible error states for recoverable failures (unreachable DB, bad connection string)

## Reliability rules

- No feature is complete if the system cannot restart cleanly afterward.
- Runtime failures should be diagnosable from repo-local signals (logs, health endpoint).
- If a repeated failure mode appears, add a benchmark, test, or guardrail for it.
- Cleanup is part of reliability: no stale debug artifacts left at session end.
