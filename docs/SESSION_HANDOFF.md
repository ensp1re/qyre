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
- First E2E journey defined (smoke + connect-and-inspect specs).
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
  - Re-verified the entire end-to-end path after the move: `pnpm check` (all 13 tasks), the real CLI
    binary against a live Postgres container (`HUMB_PORT`, static serving, `/api/overview`,
    `/api/tables/.../rows` with real indexes/rowCount), and the smoke E2E.
- **F002 + F004 (`passing`)**: browser UI shows database connection status, plus a navigation tree
  (schemas/tables) and table metadata (columns, indexes, approximate row count). Added
  `SchemaTree`/`TableDetail` to `@humb/ui`, `api/overview.ts` + `api/table.ts` + matching hooks to
  `apps/web`, and wired them into `App.tsx` (loading/error/empty states, retry buttons).
  - Found and fixed a real E2E infra gap while getting the full journey to actually pass:
    Playwright's `webServer` only ran `vite preview` (a static file server with **no backend**), so
    `/api/health` always failed with `ECONNREFUSED` regardless of frontend completeness. Replaced it
    with `e2e/server.ts`, which starts the real Humb server (API + built web app on one port,
    matching what `npx humb <url>` actually does) and connects to Postgres only when
    `HUMB_TEST_DATABASE_URL` is set - so the same server correctly serves both `@smoke` (no
    database) and `@full` (live database) specs.
  - Strengthened the spec itself (renamed `golden-journey.spec.ts` -> `connect-and-inspect.spec.ts`,
    tag `@golden` -> `@full`, script `test:e2e:golden` -> `test:e2e:full` - "golden journey" was
    unclear jargon): it previously only asserted the fixture table's name appeared as text anywhere
    on the page, which would pass without the nav tree being interactive at all. It now clicks the
    table and asserts a real column name becomes visible, actually exercising F004's "table
    metadata" behavior.
- **`docs/FEATURES.json` gained a `commitHash` field**: `evidence` alone was prose that could bury a
  commit reference; `passing` features now also require a dedicated, validated `commitHash` (real
  git SHA, enforced by `scripts/check-features.mjs`) so anyone can confirm the work was actually
  committed and pushed without parsing prose.
- **F005 (`passing`)**: paginated table rows - the last piece of the connect-and-inspect journey.
  Added `RowsTable` (`@humb/ui`), `api/rows.ts` + `useRows` hook (`apps/web`, using TanStack Query's
  `keepPreviousData` so the table doesn't flicker between pages), wired below `TableDetail` with
  Previous/Next controls. There's no exact total row count from the backend, so "can go next" uses a
  `rows.length === pageSize` heuristic - manually verified the boundary is correct via `curl` with
  `page=0`/`page=1` at `pageSize=2` against the 3-row fixture. `connect-and-inspect.spec.ts` now
  asserts real fixture row values are visible (`ada@example.com`, `grace@example.com`), not just
  that a rows table exists.

## In progress

- None. F001-F005 are all `passing`; the connect-and-inspect journey is fully green end to end.

## Known issues / blockers

- F006 (read-only query runner) and F007 (health endpoint) also have backend code already committed
  in `a0ae2f7` with passing package-level tests (`pnpm --filter @humb/server test`), same situation
  F001 and F003 were in. `FEATURES.json` still says `not_started` for both, pending an explicit
  decision to mark them `passing` — audit each against its full spec/acceptance criteria first (both
  F001 and F003 had real gaps hiding behind passing tests; assume the same risk here).
- `packages/cli`'s path to `apps/web/dist` is monorepo-relative and won't resolve once `humb` is
  published to npm; tracked in `docs/exec-plans/tech-debt-tracker.md`.

## Next steps

1. Revisit F006/F007's `not_started` state per the note above (audit before marking passing, the
   same way F001/F003 needed auditing).
2. Consider the next slice beyond the connect-and-inspect journey: e.g. a SQLite driver
   (`packages/drivers/sqlite`), the read-only query runner UI (F006 has backend support already), or
   packaging work (the `apps/web/dist` monorepo-relative path tech debt) before publishing to npm.
