# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-12.
- Branch: `main`. F105 merged (PR #118, both CI jobs green). F125 (MongoDB whole-document editor)
  implemented on `feature/F125-mongodb-document-editor`, PR open, CI pending/green - not yet merged.
- Queue: F092-F105 are `passing`; F106-F121 and F126-F128 remain `not_started`. F125 is `not_started`
  in `FEATURES.json` pending its own merge (its passing state + evidence will be recorded in the
  next feature's delivery commit, per this session's established bundling convention).
  `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128; see the plan's own progress log for full
  per-feature history and `docs/FEATURES.json` for verification evidence. F090-F105 and F122-F124,
  F129 are merged to `main` (PRs #94-#118): permission/capability foundation (F090-F098, F122-F124),
  the row-mutation write path (`RowMutationApi.insertRow`/`updateRowByKey`/`deleteRowsByKey`/
  `commitBatch`, F099-F102), and the SQL editable-grid UI (inline cell edit, add/duplicate row,
  delete staging + commit bar, F103-F105).

## In progress

- F125 (MongoDB whole-document editor) implemented on `feature/F125-mongodb-document-editor`:
  Edit/Insert/Delete-document affordances using relaxed Extended JSON as the wire format (not the
  read-only grid's lossy display format), whole-document replace via `findOneAndReplace` (Compass
  model), and lost-update protection (`RowMutationApi.updateRowByKey` gained an optional
  `expectedOriginal` parameter; the server re-fetches and compares before writing, rejecting a
  stale save as `matched: 0`). New MongoDB-only `GET /api/tables/:schema/:table/document/:id`
  route serves fresh EJSON text. Insert/delete reuse F099/F101's per-op routes directly (not F102's
  batch endpoint, which excludes MongoDB). Delete requires typed `_id` confirmation. Found and
  fixed a real `bson` dual-package-hazard bug during implementation (ESM/CJS resolve separate
  `ObjectId`/`Date` classes, breaking `instanceof`/deep-equal comparisons between driver-sourced and
  locally-deserialized BSON values) by comparing `EJSON.stringify(...)` output instead of object
  instances. `pnpm check:quiet` and `pnpm verify:pr` both green; PR open, awaiting merge.

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

- Merge F125's PR, then record its passing state (bundled into the next feature's delivery commit,
  per this session's convention). F125 was the last row-editing UI slice in the exec plan's "Feature
  order and dependencies" section - F106 (SQL statement classifier) or another `not_started` entry
  from `docs/FEATURES.json` is next.
