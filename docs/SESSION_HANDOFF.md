# SESSION_HANDOFF.md

The structured handoff between sessions. Update this before ending any session. A fresh agent should
be able to resume from this file plus `docs/FEATURES.json` in a few minutes.

Validated by `scripts/check-handoff.mjs` (all sections must be present).

## Current state

- Date: 2026-07-01
- Latest commit: `ac8a92b` (docs: formalize lightweight plan-and-approve workflow)
- Build status: builds (`pnpm build`)
- Test status: unit tests pass (`pnpm test`); smoke E2E passes (`pnpm test:e2e`)
- Verification status: `pnpm check` passes on a clean install

## Completed

- Repository skeleton: monorepo layout, tooling, and agent docs.
- Product contract finalized (`docs/product-specs/connect-and-inspect-postgres.md`).
- **F001 (`passing`)**: the original scaffold commit (`a0ae2f7`) already checked in most of the
  working backend/CLI code — this went unnoticed until this session because `docs/FEATURES.json`
  was never updated to match. Auditing it against the full spec (not just its unit tests) surfaced
  two real gaps, both now fixed:
  - `HUMB_PORT` was silently ignored (only `--port` worked). Fixed via `resolvePort()` in
    `packages/cli/src/index.ts`.
  - The server had no route for `/`, so a real `npx humb <url>` opened the browser to a 404 — there
    was no static serving of the built `apps/web`. Fixed via `webRoot` support (`@fastify/static`)
    in `packages/server/src/index.ts`, wired up by the CLI's `defaultWebRoot()`.
  - Re-verified manually end to end with a real Postgres container (not just unit tests): the built
    UI now loads at `/`, `HUMB_PORT` is respected, and `/api/health` reports `connected`.
- Verification scripts and git hooks wired (`pnpm check`, Lefthook, CI).
- First E2E golden journey defined (smoke + golden-journey specs).
- **F003 (`passing`)**: Postgres introspection. This audit found bigger gaps than F001's: the actual
  introspection logic (`getOverview`/`getTable`/`getRows`/`runReadOnlyQuery`) had **zero** test
  coverage (only the adapter factory and the unrelated read-only SQL guard were tested), and indexes
  and row counts were entirely unimplemented — not even present in `@humb/core`'s `TableMetadata`
  contract. Fixed by:
  - Adding `IndexMetadata` to `@humb/core` and implementing index introspection
    (`pg_index`/`pg_class`/`pg_attribute`) and an approximate row count (`pg_class.reltuples`, with a
    `COUNT(*)` fallback for never-`ANALYZE`d tables, since `reltuples` is `-1` until then) in
    `packages/db-postgres`.
  - Adding real integration tests (`postgres-adapter.integration.test.ts`) against a live Postgres,
    reusing `@humb/testing`'s existing `requireTestDatabaseUrl`/`setupFixture` fixture helpers.
  - Wiring `HUMB_TEST_DATABASE_URL` through: added it to `turbo.json`'s `test` task `env` allowlist
    (Turborepo's strict env mode was silently stripping it from child processes) and added a Postgres
    service to CI's `check` job (previously only the `e2e` job had one).
  - Manual verification caught a real bug my own test missed: `array_agg(a.attname ...)` returned a
    raw Postgres array-literal string (`"{id}"`) instead of a JS array, because `pg` has no type
    parser for arrays of the internal `name` type. Fixed with an explicit `::text` cast, then
    strengthened the test to assert on the actual `columns` array contents (not just presence) so
    this bug class can't regress silently again.
- **Architecture reorganization** (folder rules now in `docs/CODE_ORGANIZATION.md`):
  - `@humb/core` split from one flat `index.ts` into `types/`, `errors.ts`, `connection-target.ts`,
    and `validation/` (the Zod schemas moved out of `packages/server`). Promoted `ConnectionStatus`/
    `HealthResponse` into core so `apps/web` and `packages/ui` stop hand-duplicating them — this is
    the actual mechanism that prevents frontend/backend type drift, not just a folder tidy-up.
  - `@humb/ui` split into `components/status-badge.tsx` / `components/panel.tsx` (shadcn-style, one
    component per file); `apps/web` got `api/health.ts` + `hooks/use-health.ts`, with `App.tsx` now
    composition-only.
  - `@humb/driver-contract` (formerly `db-adapter`) gained a genuinely shared `resolvePageRequest()`
    pagination-clamping util, now used by the Postgres driver instead of duplicating the clamping
    logic inline. SQL identifier quoting was deliberately **not** shared - it differs per engine
    (`"..."` in Postgres vs `` `...` `` in MySQL) and would be a footgun as a "generic" default.
  - **Renamed and moved**: `packages/db-adapter` -> `packages/drivers/contract`
    (`@humb/driver-contract`), `packages/db-postgres` -> `packages/drivers/postgres`
    (`@humb/postgres`). Required adding `packages/drivers/*` to `pnpm-workspace.yaml` (its
    `packages/*` glob is one level only) and deleting/relinking stale `node_modules` symlinks in the
    moved packages (pnpm's relative symlinks broke one directory level deeper after a plain `mv`).
  - Re-verified the entire golden path after the move: `pnpm check` (all 13 tasks), the real CLI
    binary against a live Postgres container (`HUMB_PORT`, static serving, `/api/overview`,
    `/api/tables/.../rows` with real indexes/rowCount), and the smoke E2E.

## In progress

- **F002 (`active`)**: browser UI shows database connection status. Correction to an earlier note
  in this file: `apps/web/src/App.tsx` was **not** a bare scaffold — it already fetches
  `/api/health` and renders a real `StatusBadge`/connection summary from `@humb/ui`. Combined with
  this session's static-serving fix, the connection-status behavior is now genuinely verified
  working end to end. It stays `active` (not `passing`) only because its verification command
  (`pnpm test:e2e:golden`) is shared with F004/F005 in one Playwright spec and won't go green until
  the nav tree and table view exist too — see `e2e/golden-journey.spec.ts`. The real remaining gap
  is F004/F005: no navigation tree or table view UI exists yet.

## Known issues / blockers

- F006 (read-only query runner) and F007 (health endpoint) also have backend code already committed
  in `a0ae2f7` with passing package-level tests (`pnpm --filter @humb/server test`), same situation
  F001 and F003 were in. `FEATURES.json` still says `not_started` for both, pending an explicit
  decision to mark them `passing` — audit each against its full spec/acceptance criteria first (both
  F001 and F003 had real gaps hiding behind passing tests; assume the same risk here).
- `packages/cli`'s path to `apps/web/dist` is monorepo-relative and won't resolve once `humb` is
  published to npm; tracked in `docs/exec-plans/tech-debt-tracker.md`.

## Next steps

1. Implement F004 (navigation tree) and F005 (paginated table rows) in `apps/web` — these are the
   actually-missing pieces blocking `e2e/golden-journey.spec.ts`. F004 has real backend endpoints to
   build against now (`GET /api/overview`, `GET /api/tables/:schema/:table` with indexes/rowCount).
2. Once F004/F005 land and the golden journey is green, mark F002/F004/F005 `passing` together.
3. Revisit F006/F007's `not_started` state per the note above.
