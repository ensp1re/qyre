# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-12.
- Branch: `main`. F107 merged (PR #121, both CI jobs green). F108 (SQL editor UI becomes
  write-capable) implemented on `feature/F108-sql-editor-write-capable-ui`, not yet pushed/PR'd.
- Queue: F092-F107 and F125 are `passing`; F108-F121 and F126-F128 remain `not_started`. F108 is
  `not_started` in `FEATURES.json` pending its own merge (its passing state + evidence will be
  recorded in the next feature's delivery commit, per this session's established bundling
  convention). `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128; see the plan's own progress log for full
  per-feature history and `docs/FEATURES.json` for verification evidence. F090-F107, F122-F125,
  F129 are merged to `main` (PRs #94-#121): permission/capability foundation (F090-F098,
  F122-F124), the row-mutation write path (F099-F102), the full row-editing UI (F103-F105, F125),
  and Phase C's write-capable SQL execution server contract - `classifyStatement` (F106) and
  `DatabaseAdapter.runQuery` + `POST /api/query`'s classification routing (F107).

## In progress

- F108 (SQL editor UI becomes write-capable) implemented on
  `feature/F108-sql-editor-write-capable-ui`: the results panel renders `"N row(s) affected."` for
  a rowless `QueryExecutionResult`; a new `ConfirmDestructiveStatementDialog` (packages/ui) opens on
  a `409` destructive rejection, showing the classification and exact statement, and resubmits with
  `confirmed: true` on confirm; `QueryHistoryEntry` gains an optional `classification`, shown as a
  badge in the history drawer for any non-`read` entry; a read-only session's rejected write attempt
  shows the session's own friendly `readOnlyReason` (shared `READ_ONLY_REASON_LABEL`, extracted from
  `StatusBar` into `packages/ui/src/shell/read-only-reason.ts`) instead of the raw rejection text,
  via a new `reason: "read-only"` discriminator the server adds only to that specific case. Found
  and fixed a real bug during manual browser verification: `DatabaseAdapter.runQuery` is a plain
  class method relying on `this` (unlike `mutations`, a readonly object of already-bound arrow
  functions) - the route had detached it into a local `const runQuery = db.runQuery` before calling
  it, throwing inside every real adapter's `this.getPool()`/`this.getDb()`. Fixed with
  `db.runQuery?.bind(db)`; a new class-based fake-adapter regression test in
  `packages/server/tests/routes/query.test.ts` catches this specifically, since the arrow-function
  fakes elsewhere in that file never relied on `this` and so never would have caught it.
  `docs/product-specs/sql-editor.md` gained a "SQL Editor UI (F108)" section. `pnpm check:quiet`
  green, new e2e spec passing; not yet pushed/PR'd.

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

- Finish delivering F108 (push, PR, CI, then wait for merge), then F127 (column-level SQL
  autocomplete, read-only-safe) or F126 (query cancellation + long-op handling) per the exec plan's
  Phase C order - F108 was the last write-affordance slice before those two polish items close out
  the SQL editor phase.
