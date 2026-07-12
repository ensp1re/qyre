# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-12.
- Branch: `main`. F106, F107, F108 merged (PRs #120, #121, #122, all CI green). F126 (query
  cancellation + long-op handling) implemented on `feature/F126-query-cancellation`, not yet
  pushed/PR'd.
- Queue: F092-F108 and F125 are `passing`; F109-F121 and F126-F128 remain `not_started`. F126 is
  `not_started` in `FEATURES.json` pending its own merge (its passing state + evidence will be
  recorded in the next feature's delivery commit, per this session's established bundling
  convention). `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128; see the plan's own progress log for full
  per-feature history and `docs/FEATURES.json` for verification evidence. F090-F108, F122-F125,
  F129 are merged to `main` (PRs #94-#122): permission/capability foundation (F090-F098,
  F122-F124), the row-mutation write path (F099-F102), the full row-editing UI (F103-F105, F125),
  and Phase C's write-capable SQL execution - `classifyStatement` (F106), `DatabaseAdapter.runQuery`
  - `POST /api/query`'s classification routing (F107), and the SQL Editor UI surfacing all of it
    (F108: affected-row rendering, destructive-confirmation dialog, history classification badges,
    friendly read-only rejection text).

## In progress

- F126 (query cancellation + long-op handling), on `feature/F126-query-cancellation`: a
  `CancellationRegistry`/`OperationRegistry` (`@qyre/driver-contract` /
  `packages/server/src/services/`) tracks a cancel callback per client-supplied `operationId`,
  assigned onto the connected adapter like `onConnectionEvent`. `getRows`/`runReadOnlyQuery`/
  `runQuery` gained an optional `operationId?` param; `POST /api/operations/:id/cancel` triggers
  cancellation. Postgres uses `pg_cancel_backend()` (with a `wasCancelledByUser()` flag to
  disambiguate from `statement_timeout`'s identical SQLSTATE), MySQL uses `KILL QUERY`, MongoDB
  uses best-effort `killOp` via `currentOp`. **Open decision #2 resolved**: SQLite documented
  non-cancellable (see its adapter's class doc comment), not moved to a worker thread. Cancelled
  operations reply `499`/`cancelled: true` and log a distinct `"...cancelled."` event, never a
  generic error. `apps/web` wires a Cancel button into `QueryRunner` and the Rows tab's loading
  spinner. Also bundles F108's catch-up (`docs/FEATURES.json` evidence, was left unrecorded).
  Full detail in the exec plan's progress log. Not yet pushed/PR'd - `pnpm check:quiet` green,
  `pnpm verify:pr` pending.

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

- Finish delivering F126 (`pnpm check:quiet`/`pnpm verify:pr`, commit, push, PR, wait for CI green,
  then wait for the user to say it's merged - never merge it here), then F127 (column-level SQL
  autocomplete, read-only-safe) per the exec plan's Phase C order.
