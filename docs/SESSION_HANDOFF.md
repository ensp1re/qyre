# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-10.
- Branch: `feature/F123-batched-introspection`, pushed. PR #98 (F123) is open with CI green, not
  yet merged. F122's PR #94, F090's PR #95, and F091's PR #96 are all merged to `main`.
- Queue: 4 `passing` entries (F122, F090, F091, F123, pruned to 24h retention) plus 36
  `not_started` entries (F092-F121, F124-F128) - the rest of plan 0006's role-aware database IDE.
  `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128 (see plan's own progress log for planning
  history).
- F122 (session-token auth + security headers) merged to `main`: every `/api/*` route requires a
  per-session bearer token; `static-web.ts` injects the token into the served `index.html`; a
  CSP/nosniff/X-Frame-Options land on every response. PR #94.
- F090 (permissions and capabilities product spec) merged to `main`:
  `docs/product-specs/permissions-and-capabilities.md` fixes the two-tier
  `ConnectionCapabilities`/`TablePermissions` data contract, the per-engine introspection matrix,
  and the advisory-introspection/authoritative-database principle. Spec-only, no code. PR #95.
- F091 (capability plumbing) merged to `main`: `@qyre/core` gains
  `ConnectionCapabilities`/`TablePermissions`; `DatabaseAdapter` gains a required
  `getCapabilities()`, stubbed read-only (`stubReadOnlyCapabilities`) on all four adapters until
  F092-F095 land real introspection; `GET /api/overview` returns the full shape; `apps/web` gains
  `features/connection/model/use-capabilities.ts` for later write-UI gating (no visible UI change
  yet). PR #96.
- F123 (batched schema introspection) implemented and CI green: `DatabaseAdapter` gains
  `getAllTables()` - the same shape N `getTable()` calls would produce, but via one/few
  set-based catalog queries per engine (Postgres/MySQL) or a bounded sequential loop reusing
  `getTable()` (SQLite/MongoDB, neither has a cross-table catalog query). `GET /api/tables` now
  calls it directly instead of `getOverview()` + an unbounded `Promise.all(getTable)`. PR #98.

## In progress

- Nothing active. Waiting on PR #98 (F123) to merge to `main`.

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
- Restricted-user database fixtures (read-only Postgres/MySQL/Mongo users) do not exist yet; they
  land with F092/F093/F095.

## Next steps

- Merge PR #98 (`feature/F123-batched-introspection`).
- Then pick up F124 (table/view `kind` field - all three SQL drivers currently read
  `information_schema.tables` with no `table_type` filter, so views appear as editable "tables"),
  and proceed in the queue's array order (Phase A: F124 -> F092-F095 -> F096 -> F097 before any
  write feature). The exec plan's "Feature order and dependencies" section is the authoritative
  order; F090/F091/F123 are the settled contract and batched-introspection foundation F092-F095
  attach real per-table permissions onto next.
