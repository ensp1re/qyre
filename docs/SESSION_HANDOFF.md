# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-10.
- Branch: `feature/F129-driver-modularization`, stacked on the pushed F092 head so PR #100 remains
  isolated.
- Queue: F092 is `passing`; F093-F121 and F125-F128 remain `not_started`.
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
- F123 (batched schema introspection) merged to `main`: `DatabaseAdapter` gains `getAllTables()`
  - the same shape N `getTable()` calls would produce, but via one/few set-based catalog queries
    per engine (Postgres/MySQL) or a bounded sequential loop reusing `getTable()` (SQLite/MongoDB,
    neither has a cross-table catalog query). `GET /api/tables` now calls it directly instead of
    `getOverview()` + an unbounded `Promise.all(getTable)`. PR #98.
- F124 (table/view `kind`) implemented and CI green: `TableMetadata` gains a required
  `kind: "table" | "view" | "materialized-view" | "collection"`. Fixed two real visibility gaps
  along the way: Postgres materialized views were entirely invisible before (now sourced from
  `pg_class` directly, not `information_schema.tables`, which has no matview concept at all), and
  SQLite views were entirely excluded from every listing (now `type IN ('table', 'view')`, not
  `= 'table'` only). Row counts skip views on all 4 engines (meaningless/would re-execute the
  view). The Schema tab's `TableDetail` card shows a subtle VIEW/MATERIALIZED VIEW badge; the
  sidebar tree badge is deliberately deferred (see PR #99's description for why). PR #99.
- F092 (Postgres permission introspection) pushed and CI green: `getCapabilities()` reads actual
  replica/session/role/grant facts, single and batched table metadata carry advisory table
  privileges, and failed introspection logs then safely degrades to read-only. Docker and
  `@qyre/testing` provide the SELECT-only `qyre_readonly` fixture. PR #100.

## In progress

- Cross-driver structural refactor: Postgres, MySQL, SQLite, and MongoDB now have thin public
  entrypoints plus responsibility-focused adapter/introspection/query/value modules; all five
  packages under `packages/drivers` use local `tests/` trees. Runtime behavior and public exports
  are unchanged. Targeted driver tests, builds, cross-engine conformance, and `pnpm check:quiet`
  pass; pending full PR verification, commit, push, and draft PR.

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
- Restricted-user database fixtures for MySQL and MongoDB do not exist yet; they land with
  F093/F095.

## Next steps

- Finish delivery of the driver modularization branch, then pick up F093 (MySQL permission
  introspection). The exec plan's "Feature order and dependencies" section is authoritative:
  F093/F094/F095 -> F096 -> F097 before any write feature.
