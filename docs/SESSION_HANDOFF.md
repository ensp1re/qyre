# SESSION_HANDOFF.md

The structured handoff between sessions. Update this before ending any session. A fresh agent should
be able to resume from this file plus `docs/FEATURES.json` in a few minutes.

Validated by `scripts/check-handoff.mjs` (all sections must be present).

## Current state

- Date: 2026-07-01
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

## In progress

- **F006 (`active`)**: read-only SQL query runner. Auditing it (same pattern as F001/F003) found a
  **real, exploitable security bug**: `assertReadOnly` only checked the _leading_ keyword, so a
  writable CTE - `WITH deleted AS (DELETE FROM t RETURNING *) SELECT * FROM deleted` - starts with
  the allowed "with" keyword but actually deletes data. Verified this really executed a DELETE
  through the real adapter against a live table before fixing it. Fixed with two layers:
  1. `assertReadOnly` now also scans the whole statement (comments/string literals/quoted
     identifiers stripped first, to avoid false positives) for forbidden keywords anywhere, not just
     leading - `packages/drivers/postgres/src/read-only.ts`.
  2. The authoritative fix: `runReadOnlyQuery` now runs inside a real Postgres `BEGIN TRANSACTION
READ ONLY` - Postgres itself refuses any write, regardless of what the string check misses.
     Proved this independently with a test that hides a `DELETE` inside a plpgsql function body
     (`SELECT some_function()` - no forbidden keyword in the SQL text at all, only the transaction
     backstop can catch it) - `postgres-adapter.integration.test.ts`.
  - Also found and fixed: a rejected query returned HTTP 500 instead of 400. Fixed by moving
    `ReadOnlyViolationError` from `@humb/postgres` to `@humb/driver-contract` (it's an
    engine-agnostic concept - every future engine's query runner needs it) so `packages/server` can
    catch it without depending on a concrete engine package, and return 400.
  - Built the missing UI: `QueryRunner` (`@humb/ui`) - a SQL textarea + results table - wired into
    `apps/web` via `api/query.ts` + `useRunQuery` (a `useMutation`, not `useQuery` - it's
    user-triggered, not passive). Manually verified success/rejection/writable-CTE cases through the
    real HTTP path (`curl` against the built CLI + live Postgres), not just unit tests.
  - Broadened F006's verification command from `pnpm --filter @humb/server test` to also run
    `pnpm --filter @humb/postgres test` - the actual read-only-enforcement logic (and its new
    security regression tests) lives there, not in `@humb/server`; the original command would never
    have re-run them.
  - Not yet marked `passing`: still need to record evidence/commitHash after committing.

## Known issues / blockers

- F007 (health/diagnostics endpoints) has backend code + passing package-level tests but hasn't been
  audited against its full spec yet - same starting position F001/F003/F006 were in before real gaps
  turned up. Audit before marking `passing`.
- `packages/cli`'s path to `apps/web/dist` is monorepo-relative and won't resolve once `humb` is
  published to npm; tracked in `docs/exec-plans/tech-debt-tracker.md`.

## Next steps

1. Commit F006's fixes, record its `commitHash`/evidence, mark `passing`.
2. Audit F007 the same way (health/diagnostics endpoints) before marking it `passing`.
3. Consider the next slice: a SQLite driver (`packages/drivers/sqlite`), or `humb` npm-publish
   packaging work (the `apps/web/dist` path tech debt above).
