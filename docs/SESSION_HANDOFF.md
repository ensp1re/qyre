# SESSION_HANDOFF.md

The structured handoff between sessions. Update this before ending any session. A fresh agent should
be able to resume from this file plus `docs/FEATURES.json` in a few minutes.

Validated by `scripts/check-handoff.mjs` (all sections must be present).

## Current state

- Date: 2026-07-02
- Latest commit: see `git log --oneline -1 origin/main`
- Build status: builds (`pnpm build`)
- Test status: unit + integration tests pass (`pnpm test`, with `HUMB_TEST_DATABASE_URL` set); smoke
  - full E2E pass (`pnpm test:e2e`, `pnpm test:e2e:full`)
- Verification status: `pnpm check:ci` passes with a live Postgres available

## Completed

- Repository skeleton, product contract, verification tooling (`pnpm check`, Lefthook, CI).
- **F001-F005 all `passing`** - the full connect-and-inspect journey (`pnpm test:e2e:full`) is green
  end to end: CLI starts the server (`HUMB_PORT` respected, static-serves the built `apps/web`),
  browser shows connection status, navigation tree + table metadata (columns/indexes/row count), and
  paginated rows. Each of F001/F003 needed a real audit before being trustworthy - passing
  package-level tests hid real gaps (`HUMB_PORT` ignored, no static serving, indexes/rowCount
  unimplemented, a `pg` array-type parsing bug) - see PRs #3-#7 for the full history.
- Architecture reorganization (PR #5, rules in `docs/CODE_ORGANIZATION.md`): `@humb/core` split into
  `types/`/`validation/`/etc.; `@humb/ui` split into one component per file; renamed
  `db-adapter`/`db-postgres` to `packages/drivers/contract`/`packages/drivers/postgres`
  (`@humb/driver-contract`/`@humb/postgres`).
- `docs/FEATURES.json` gained a `commitHash` field (PR #8's follow-up): `passing` features must
  record the actual pushed git SHA, not just prose, enforced by `scripts/check-features.mjs`.
- Structure guides added: `apps/web/STRUCTURE.md` (feature-based growth path) and
  `packages/server/STRUCTURE.md` (Fastify plugin/route growth path) - see PR #9.
- `.local/` added to `.gitignore` (personal, never-committed scratch scripts); `@humb/testing`
  gained a generic `runStatements()` helper to support this without adding new root dependencies.
- **F006 `passing`** (PR #10): read-only SQL query runner. Auditing it found a real, exploitable
  security bug - a writable CTE bypassed the leading-keyword read-only check and actually deleted
  data. Fixed with a full-statement keyword scan plus (the authoritative backstop) running queries
  inside a real Postgres `READ ONLY` transaction. Also fixed a rejected query returning HTTP 500
  instead of 400, and built the missing `QueryRunner` UI.
- **F007 `passing`** (commit `5259102`, PR pending): health/runtime diagnostics endpoint. Auditing
  `/api/health` (built in F001) the same way as F001/F003/F006 found a real crash bug, not just a
  coverage gap: node-postgres's `Pool` emits an unhandled `"error"` event when an idle client's
  connection is severed by the database (restart, network blip, admin kill) - with no listener, that
  crashes the entire Node process instead of `/api/health` ever getting a chance to report
  `"disconnected"`. Confirmed live: started the CLI against a real Postgres container, stopped the
  container, and watched the whole server die instead of degrading gracefully. Fixed with
  `pool.on("error", ...)` in `packages/drivers/postgres/src/index.ts`'s `connect()`, logging instead
  of crashing - re-verified live that killing the database now leaves the server up and
  `/api/health` correctly reports `"disconnected"`, and that a subsequent `SIGINT` still shuts down
  cleanly. Added a regression test (`postgres-adapter.integration.test.ts`) that reproduces the exact
  failure via `pg_terminate_backend` on an idle pooled connection against a real database - confirmed
  it fails without the fix and passes with it. Broadened F007's verification command to also run
  `pnpm --filter @humb/postgres test`, matching F006's precedent, since the fix lives there, not in
  `@humb/server`.
- Backlog planning (PR #12): added F008 (SQLite driver, with a full product spec at
  `docs/product-specs/connect-and-inspect-sqlite.md`), F009 (README rewrite), F010 (npm publish, incl.
  `scripts/publish.mjs` for lockstep version bump + release). No product code changed.
- **F008 `passing`** ([PR #13](https://github.com/ensp1re/humb/pull/13), merged): SQLite as Humb's
  second engine (`npx humb ./app.db`). See `docs/exec-plans/active/0002-sqlite-engine.md` for full
  detail (F011, its e2e slice, is still open there). In short: generalized `@humb/core`'s
  `parseConnectionTarget` from Postgres-only to engine-detecting (this was the real blocker to any
  second engine, not a missing driver package); moved `assertReadOnly` from `@humb/postgres` to
  `@humb/driver-contract` so both engines share it; built `@humb/sqlite` on `better-sqlite3` with the
  whole connection opened `readonly: true` as the authoritative read-only backstop (verified live,
  independent of the string-scan heuristic); wired `sqliteAdapterFactory` into the CLI. Caught and
  fixed a real bug during live verification (not package tests, which all passed): `/api/health`
  redacted a SQLite path as `<unparseable connection string>` since redaction assumed every target is
  a URL. Scoped to backend + CLI - Playwright e2e coverage split out as **F011** (`not_started`).
- Moved `docs/exec-plans/active/0001-postgres-inspection.md` to `completed/` (F001-F007 all
  `passing`).
- **DF-01 `passing`** (dashboard UI redesign, foundation slice): the user shared a private design
  repo (`github.com/ensp1re/UserDashboard`, a Figma Make export) to implement as Humb's new UI - a
  VS Code-style Postgres/SQL IDE (title bar, searchable sidebar tree, SQL Editor/Tables/Schema/
  Files/Console tabs, status bar), not a generic dashboard. See
  `docs/exec-plans/active/0003-dashboard-ui.md` for full detail and the `DF-02`..`DF-09` breakdown.
  This slice: extracted the full token set into `docs/references/design-system.md`; added
  `.claude/skills/humb-design-system/SKILL.md` so future UI work discovers it automatically; added
  `docs/product-specs/dashboard-ui.md` (the engine-agnostic UI contract + backend gaps the design
  surfaces: engine+version in `/api/health`, FK metadata, a scoped Files-browsing endpoint, a
  Console/activity-log endpoint); wired the real tokens into `apps/web`'s Tailwind config (previously
  scaffolded but completely unused - zero regression risk, verified live via build/typecheck/e2e/a
  Preview screenshot); added `cn()` to `packages/ui`. Also introduced the `DF-##` ID series
  alongside `F###` (`docs/NAMING.md`, `scripts/check-features.mjs`) for frontend/design-driven work.

## In progress

- None. DF-01's PR still needs to be opened (see Next steps); F009/F010/F011/DF-02..DF-09 are
  `not_started` backlog.

## Known issues / blockers

- `packages/cli`'s path to `apps/web/dist` is monorepo-relative and won't resolve once `humb` is
  published to npm; tracked in `docs/exec-plans/tech-debt-tracker.md` and as F010.
- F011 (Playwright e2e coverage for SQLite) is `not_started`; the UI itself needs no changes (it's
  already engine-agnostic, verified live against SQLite over the same HTTP contract) - only
  `e2e/server.ts` needs to support starting against either engine's fixture.
- DF-06 (Files tab) and DF-07 (Console tab) both need new backend capability, not just restyling -
  DF-06 in particular needs a real security-scoping decision before any filesystem-reading endpoint
  is written (`docs/product-specs/dashboard-ui.md`).

## Next steps

1. Push the DF-01 branch and open its PR; record the PR URL as evidence once merged.
2. Pick up DF-02 (shell layout - blocks every other DF slice visually), or F009/F010/F011 per the
   user's stated leaning: SQLite → publish → UI/UX (UI/UX is now underway as the DF series).
