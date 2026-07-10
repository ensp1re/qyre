# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-10.
- Branch: `feature/F094-sqlite-writability-introspection`, pushed. PR #104 has both CI jobs green.
- Queue: F092/F093/F094 are `passing`; F095-F121 and F125-F128 remain `not_started`.
  `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128 (see plan's own progress log for full history:
  F122 session auth, F090 permissions spec, F091 capability plumbing, F123 batched introspection,
  F124 table/view `kind`, F092 Postgres permissions, F129 unplanned driver-modularization refactor,
  F093 MySQL permissions - all merged to `main`, PRs #94-#103).
- F094 (SQLite writability introspection) pushed and CI green: `getCapabilities()`/per-table
  `TablePermissions` gate on real file/directory OS-writability, `PRAGMA query_only`, and the
  connection's own open mode. Deviates from the plan's literal text the same way F093 did:
  `connect()` previously force-opened _every_ SQLite connection read-only as Qyre's own policy,
  independent of real file permissions - under that policy the whole feature would have been a
  no-op (always read-only). `connect()` now opens normally, so `db.readonly` becomes a real signal;
  `runReadOnlyQuery`'s backstop moved from the connection's open mode to toggling `PRAGMA
query_only` around each query, matching Postgres/MySQL's query-time enforcement pattern.
  `readOnlyReason` for a non-writable SQLite session is now `"connection"`, not the F091 stub's
  `"grants"` (SQLite has no grants concept). See `packages/drivers/sqlite/src/capabilities.ts`'s top
  comment for the full reasoning. PR #104.

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
- Restricted-user database fixtures for MongoDB do not exist yet; they land with F095.

## Next steps

- Merge PR #104, then pick up F095 (MongoDB permission introspection) - the last of the three
  parallelizable per-engine introspection slices. The exec plan's "Feature order and dependencies"
  section is authoritative: F093/F094/F095 -> F096 -> F097 before any write feature.
