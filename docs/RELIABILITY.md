# RELIABILITY.md

How Humb proves it is healthy and restartable. Only a full-pipeline run counts as real verification.

## Standard paths

- Bootstrap: `pnpm install`
- Verification (local): `pnpm check`
- Verification (CI-equivalent, adds E2E): `pnpm check:ci`
- Start app (dev): `pnpm dev`
- Start product (once implemented): `humb <database-url>` (engine auto-detected from the target)

## Verification hierarchy

A change is not done until the required levels pass, in order:

1. Static: formatting, lint, typecheck.
2. Unit: package unit tests (Vitest).
3. Integration: adapter tests against an ephemeral Postgres (requires `HUMB_TEST_DATABASE_URL`).
4. End-to-end: Playwright golden journey for cross-component changes.

Do not skip a required level. Passing unit tests alone does not mean a cross-component feature is done.

## Golden journeys

1. Connect and inspect (primary): start Humb against Postgres, UI shows connected, list
   schemas/tables, open a table, view a page of rows.

Each golden journey has a repeatable verification path and clear failure signals.

### How the golden journey is verified

- `apps/web` E2E `smoke.spec.ts`: always runs, no database required. Confirms the UI boots and the
  connection screen renders. Part of `pnpm test:e2e` and `pnpm check:ci`.
- `golden-journey.spec.ts`: requires `HUMB_TEST_DATABASE_URL`. If it is missing, the test FAILS with
  an actionable message (we do not silently skip required verification). It runs in CI where a
  Postgres service is available, and locally when a developer/agent provides the URL.

## Required runtime signals

- structured logs for startup and critical flows
- a health endpoint reporting server + database connectivity
- user-visible error states for recoverable failures (unreachable DB, bad connection string)

## Reliability rules

- No feature is complete if the system cannot restart cleanly afterward.
- Runtime failures should be diagnosable from repo-local signals (logs, health endpoint).
- If a repeated failure mode appears, add a benchmark, test, or guardrail for it.
- Cleanup is part of reliability: no stale debug artifacts left at session end.
