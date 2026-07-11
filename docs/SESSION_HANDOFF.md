# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-11.
- Branch: `main`. F099 merged (PRs #109/#110, both CI jobs green).
- Queue: F092-F099 are `passing`; F100-F121 and F125-F128 remain `not_started`. `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128 (see plan's own progress log for full history:
  F122 session auth, F090 permissions spec, F091 capability plumbing, F123 batched introspection,
  F124 table/view `kind`, F092 Postgres permissions, F129 unplanned driver-modularization refactor,
  F093 MySQL permissions, F094 SQLite writability, F095 MongoDB permissions, F096 `--read-only`
  session mode, F097 permission-aware UI shell, F098 row-editing product spec - all merged to
  `main`, PRs #94-#108).
- F099 (structured row insert, the first slice that actually implements a write path) merged to
  `main`: adapters gain `mutations.insertRow` per `docs/product-specs/row-editing.md` -
  Postgres/MySQL/SQLite take a flat column->value map translated to a parameterized `INSERT`
  (MySQL re-fetches via its auto-increment column when present; SQLite via the implicit `rowid`);
  MongoDB deserializes a relaxed-EJSON document to real BSON via `bson`'s `EJSON.deserialize`
  before `insertOne`. The server adds `POST /api/tables/:schema/:table/rows`, validating the body
  against the table's real introspected columns
  (`packages/server/src/services/row-mutation-validation.ts`, reusing F082/F089's
  `FilterColumnKind`), rejecting non-table/collection targets and missing insert permission, gated
  by the F096 central read-only guard, and logging a structured audit event. Amended the F098 spec
  mid-implementation so `RowMutationApi`'s three methods are each independently optional, matching
  the F099/F100/F101 incremental-slice split. Fixed a latent bug in SQLite's `mutations.insertRow`
  wiring (a synchronous throw was escaping as an uncaught exception instead of a promise
  rejection). PRs #109/#110 (see "Known issues" below for why there are two).

## In progress

- Nothing active.

## Known issues / blockers

- Full `pnpm check` requires Docker; root test/check commands load the gitignored `.env` URLs.
- If `docker` resolves to a dangling `/usr/local/bin/docker`, prepend
  `/Applications/Docker.app/Contents/Resources/bin` to `PATH`.
- UI Preview must rebuild `@qyre/ui` before `@qyre/web` because the web package consumes UI `dist/`.
- Vitest resolves workspace packages (`@qyre/core`, `@qyre/driver-contract`, each adapter) through
  their built `dist/`, not source - after changing a package's exported surface, rebuild it
  (`pnpm --filter <pkg> build`) before running a _different_ package's tests against the change, or
  they'll silently exercise the stale build ("X is not a function" is the tell). `tsc --noEmit`
  doesn't have this problem (it honors the root `tsconfig.base.json`'s `paths` straight to `src`).
- `.local/preview-server-mysql.mjs` still points at a stale pre-rename port/db
  (`localhost:3307`/`humb_test`, wrong env var names).
- MongoDB's shared docker-compose/CI container has no authorization enabled at all - every
  connection is anonymous and full-access. Testing a genuinely restricted MongoDB user live would
  require enabling auth globally and migrating every existing Mongo test/fixture to credentials
  (see F095's evidence in FEATURES.json / `permissions.ts`'s top comment) - deliberately not done.
- F099 has two merged PRs on `feature/F099-row-insert` (#109, #110) with identical content: a
  squash-merge landed first, then the branch was merged again (regular merge commit) without
  deleting it in between. Both are harmless no-op-content merges on `main` - `commitHash` in
  FEATURES.json points at the final one (#110, `fc4240a`). No action needed, just don't be
  surprised by the duplicate history.

## Next steps

- F100 (structured row update - `RowMutationApi.updateRowByKey`, `PATCH` on the rows resource,
  requiring a full primary-key match, zero-rows-matched reported as a distinct "stale row" outcome)
  is next per the exec plan's "Feature order and dependencies" section - follows F099's exact
  pattern (adapter method + server route + validation + conformance across all four engines).
