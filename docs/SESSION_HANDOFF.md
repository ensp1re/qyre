# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-12.
- Branch: `main`. F125 merged (PR #119, both CI jobs green) - Phase B (row editing, F098-F105/F125)
  is now fully complete. F106 (`classifyStatement`, opening Phase C's SQL editor work) implemented
  on `feature/F106-classify-statement`, not yet pushed/PR'd.
- Queue: F092-F105 and F125 are `passing`; F106-F121 and F126-F128 remain `not_started`. F106 is
  `not_started` in `FEATURES.json` pending its own merge (its passing state + evidence will be
  recorded in the next feature's delivery commit, per this session's established bundling
  convention). `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128; see the plan's own progress log for full
  per-feature history and `docs/FEATURES.json` for verification evidence. F090-F105, F122-F125,
  F129 are merged to `main` (PRs #94-#119): permission/capability foundation (F090-F098,
  F122-F124), the row-mutation write path (`RowMutationApi.insertRow`/`updateRowByKey`/
  `deleteRowsByKey`/`commitBatch`, F099-F102), and the full row-editing UI - the SQL editable grid
  (inline cell edit, add/duplicate row, delete staging + commit bar, F103-F105) and MongoDB's
  whole-document Extended JSON editor (F125).

## In progress

- F106 (`classifyStatement`) implemented on `feature/F106-classify-statement`:
  `packages/drivers/contract`'s `read-only.ts` gains `classifyStatement(sql)`, labeling a single
  statement `read | mutation | ddl | destructive` from the same comment/literal-stripping text
  scanner `assertReadOnly` always used - `assertReadOnly` is now reimplemented on top of it
  (`classification !== "read"` throws), and all 18 of its pre-existing tests pass unmodified.
  DROP/TRUNCATE are always `destructive`; UPDATE/DELETE without a `WHERE` clause escalate to
  `destructive` too (an unqualified UPDATE/DELETE rewrites or empties the whole table); a writable
  CTE (`WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x`) classifies by its inner write
  action even though it starts with the read-safe `WITH` keyword. An unrecognized statement (e.g.
  `PRAGMA ...`) conservatively classifies as `mutation`, never `read`, since defense-in-depth means
  never treating the unknown as safe. Pure text heuristic only - the authoritative gate remains
  each adapter's engine-level read-only enforcement. `pnpm check:quiet` green; not yet
  pushed/PR'd.

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

- Finish delivering F106 (push, PR, CI, then wait for merge), then F107 (write-capable SQL
  execution, `runQuery(sql)` on the three SQL adapters + a server confirmation contract) per the
  exec plan's Phase C order.
