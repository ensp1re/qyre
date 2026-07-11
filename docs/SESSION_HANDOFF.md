# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-11.
- Branch: `feature/F095-mongodb-permission-introspection`, pushed. PR #105 has both CI jobs green.
- Queue: F092/F093/F094/F095 are `passing`; F096-F121 and F125-F128 remain `not_started`.
  `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128 (see plan's own progress log for full history:
  F122 session auth, F090 permissions spec, F091 capability plumbing, F123 batched introspection,
  F124 table/view `kind`, F092 Postgres permissions, F129 unplanned driver-modularization refactor,
  F093 MySQL permissions, F094 SQLite writability - all merged to `main`, PRs #94-#104).
- F095 (MongoDB permission introspection) pushed and CI green: `getCapabilities()`/per-collection
  `TablePermissions` derive from `db.runCommand({connectionStatus:1, showPrivileges:true})`, mapping
  find/insert/update/remove and createCollection/dropCollection/createIndex/dropIndex actions per
  resource (exact, db-wildcard, cross-db-wildcard, anyResource - all live-verified against a real
  `mongod`). An unauthenticated connection is full-access, matching mongod's real default.
  Deliberately scoped narrower than the plan's literal text after confirming with the user: a live
  _restricted_ fixture user would require enabling MongoDB auth globally on the shared docker-
  compose/CI container, breaking every existing anonymous Mongo test - so restricted-access
  scenarios are unit-tested against live-verified `connectionStatus` shapes instead of a live
  fixture. See `packages/drivers/mongodb/src/permissions.ts`'s top comment. PR #105.

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
- Browser preview tooling (both the Browser-pane `preview_*` tools and the Claude-in-Chrome
  extension) was unreachable in this session's environment - UI changes were verified via
  component-level render tests and the live `@full` E2E suite instead of a screenshot. Worth
  retrying at the start of a session doing UI work rather than assuming it's unavailable.
- `.local/preview-server-mysql.mjs` still points at a stale pre-rename port/db
  (`localhost:3307`/`humb_test`, wrong env var names).
- MongoDB's shared docker-compose/CI container has no authorization enabled at all - every
  connection is anonymous and full-access. Testing a genuinely restricted MongoDB user live would
  require enabling auth globally and migrating every existing Mongo test/fixture to credentials
  (see F095's evidence in FEATURES.json / `permissions.ts`'s top comment) - deliberately not done.

## Next steps

- Merge PR #105. F092-F095 (all four per-engine permission-introspection slices) are now done, so
  F096 (`--read-only` CLI flag + central server guard) is next per the exec plan's "Feature order
  and dependencies" section - the safety cornerstone every later write feature (F099+) depends on.
