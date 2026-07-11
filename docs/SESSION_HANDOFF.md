# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-11.
- Branch: `feature/F098-row-editing-spec`, pushed. PR #108 has both CI jobs green.
- Queue: F092-F098 are `passing`; F099-F121 and F125-F128 remain `not_started`. `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128 (see plan's own progress log for full history:
  F122 session auth, F090 permissions spec, F091 capability plumbing, F123 batched introspection,
  F124 table/view `kind`, F092 Postgres permissions, F129 unplanned driver-modularization refactor,
  F093 MySQL permissions, F094 SQLite writability, F095 MongoDB permissions, F096 `--read-only`
  session mode, F097 permission-aware UI shell - all merged to `main`, PRs #94-#107).
- F098 (row-editing product spec) pushed and CI green: `docs/product-specs/row-editing.md` fixes
  `RowMutationApi` (insert/update/delete-by-key + "stale row" semantics), row identity/editability
  rules, value validation reusing F082/F089's `FilterColumnKind` classification, a single
  `POST /api/mutations/commit` for the SQL pending-changes-buffer model (resolves exec plan open
  decision 5), MongoDB's whole-document relaxed-Extended-JSON editor with `findOneAndReplace` +
  conflict-on-save semantics (resolves open decision 1, the plan's highest-risk decision - explicit
  reasoning for diverging from both the read-only grid's display format and Compass's shell-helper
  syntax), the audit-event contract, and confirmation thresholds. Spec-only slice, no code changes.
  PR #108.

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

## Next steps

- Merge PR #108. F090-F098 (permission foundation + the row-editing spec) are now done. F099
  (structured row insert - `RowMutationApi.insertRow`, `POST /api/tables/:schema/:table/rows`,
  across all four engines) is next per the exec plan's "Feature order and dependencies" section -
  the first slice that actually implements a write path.
