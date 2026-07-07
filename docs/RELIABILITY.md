# RELIABILITY.md

How Qyre proves it is healthy and restartable. Only a full-pipeline run counts as real verification.

## Standard paths

- Bootstrap: `pnpm install`
- Verification (local): `pnpm check` - requires the live test databases below
- Verification (CI-equivalent, adds E2E): `pnpm check:ci`
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

Do not skip a required level. Passing unit tests alone does not mean a cross-component feature is done.

## End-to-end journeys

1. Connect and inspect (primary): start Qyre against Postgres, UI shows connected, list
   schemas/tables, open a table, view a page of rows.

Each journey has a repeatable verification path and clear failure signals.

### How the connect-and-inspect journey is verified

- `apps/web` E2E `smoke.spec.ts`: always runs, no database required. Confirms the UI boots and the
  connection screen renders. Part of `pnpm test:e2e` and `pnpm check:ci`.
- `connect-and-inspect.spec.ts`: requires `QYRE_TEST_DATABASE_URL`. If it is missing, the test FAILS
  with an actionable message (we do not silently skip required verification). It runs in CI where a
  Postgres service is available, and locally when a developer/agent provides the URL.
- Both specs run against `e2e/server.ts`, which starts the real Qyre server (API + built web app on
  one port) rather than a separate `vite preview` process with no backend - it connects to Postgres
  only when `QYRE_TEST_DATABASE_URL` is set, so the same webServer serves both specs correctly.

## Required runtime signals

- structured logs for startup and critical flows
- a health endpoint reporting server + database connectivity
- user-visible error states for recoverable failures (unreachable DB, bad connection string)

## Reliability rules

- No feature is complete if the system cannot restart cleanly afterward.
- Runtime failures should be diagnosable from repo-local signals (logs, health endpoint).
- If a repeated failure mode appears, add a benchmark, test, or guardrail for it.
- Cleanup is part of reliability: no stale debug artifacts left at session end.
