# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-11.
- Branch: `feature/F097-permission-aware-ui-shell`, pushed. PR #107 has both CI jobs green.
- Queue: F092-F097 are `passing`; F098-F121 and F125-F128 remain `not_started`. `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128 (see plan's own progress log for full history:
  F122 session auth, F090 permissions spec, F091 capability plumbing, F123 batched introspection,
  F124 table/view `kind`, F092 Postgres permissions, F129 unplanned driver-modularization refactor,
  F093 MySQL permissions, F094 SQLite writability, F095 MongoDB permissions, F096 `--read-only`
  session mode - all merged to `main`, PRs #94-#106).
- F097 (permission-aware UI shell) pushed and CI green: `StatusBar` gains a read-only/read-write
  access badge wired from the F091 `useCapabilities` hook (shares the `["overview"]` query cache -
  no extra request), with a tooltip explaining the reason (qyre `--read-only` flag, replica,
  connection, or grants). New `features/connection/model/capability-gates.ts` exports two generic
  gates (`sessionAllows`/`tableAllows`, not one per capability flag) every later write surface will
  call before rendering a control. New `"readonly"` Playwright project connects to the same
  fully-writable Postgres fixture as `"postgres"` but with `--read-only` forced, proving the flag
  overrides real grants; a new regression-guard spec asserts the badge and zero write affordances -
  the standing check every write slice (F099+) must keep green. Visually verified in the Browser
  pane. PR #107.

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

- Merge PR #107. F090-F097 (the full permission/capability foundation) are now done. F098 (row-
  editing product spec - the highest-risk decision in the plan: SQL grid editing vs. MongoDB
  whole-document EJSON editing) is next per the exec plan's "Feature order and dependencies"
  section - the first of the actual write-feature slices (F099+).
