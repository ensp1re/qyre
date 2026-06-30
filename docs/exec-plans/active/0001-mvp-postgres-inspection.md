# Plan 0001: MVP Postgres Inspection

Status: Active
Owner: unassigned
Linked features: F001-F007 (`docs/FEATURES.json`)

## Objective

Deliver the MVP product contract: `npx humb <postgres-url>` starts a local server, opens the browser
UI, and lets a developer inspect a Postgres database (schemas, tables, columns, rows) read-only.

## Scope

In scope: F001-F007 as defined in `docs/FEATURES.json`.

Out of scope: writes/DDL, multiple connections, non-Postgres engines, auth/remote hosting.

## Verification path

- `pnpm check` must pass (format, lint, typecheck, test, build, harness checks).
- `pnpm test:e2e` smoke must pass.
- `pnpm test:e2e:golden` must pass with `HUMB_TEST_DATABASE_URL` set (CI provides Postgres).

## Risks and blockers

- Cross-package type/runtime resolution must stay consistent (paths for typecheck, dist at runtime).
- E2E requires Postgres availability; CI provides a service container.

## Progress log

- 2026-06-30: Repository skeleton, harness docs, tooling, and verification gates created. No product
  code yet. All features `not_started`.

## Open decisions

- SQLite (`db-sqlite`) timing: immediately after Postgres vs later.
- Whether the query runner ships in the first golden journey or as a follow-up slice.
