# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-12.
- Branch: `main`. F106-F109, F126, F127 merged (PRs #120-#125, all CI green). F110 (table-lifecycle
  DDL, Phase D's first implementation slice) implemented on `feature/F110-table-lifecycle-ddl`, not
  yet pushed/PR'd.
- Queue: F092-F109 and F125-F127 are `passing`; F110 is `active` (implemented, fully verified
  locally, pending its own PR/merge - its passing state + evidence will be recorded in F111's
  delivery commit, per this session's established bundling convention); F111-F121 and F128 remain
  `not_started`. `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128; see the plan's own progress log for full
  per-feature history and `docs/FEATURES.json` for verification evidence. F090-F109, F122-F127,
  F129 are merged to `main` (PRs #94-#125): permission/capability foundation (F090-F098,
  F122-F124), the row-mutation write path (F099-F102), the full row-editing UI (F103-F105, F125),
  all of Phase C - `classifyStatement` (F106), `DatabaseAdapter.runQuery` + `POST /api/query`'s
  classification routing (F107), the write-capable SQL Editor UI (F108), query cancellation +
  long-op handling (F126), and column-level SQL autocomplete (F127) - and F109, Phase D's
  spec-only foundation (`docs/product-specs/schema-editing.md`, fixing `SchemaDdlApi`, the
  per-engine DDL matrix, kind-gating, typed-confirmation rules, and API shapes). Phase C is closed
  out.

## In progress

- F110 (table-lifecycle DDL), on `feature/F110-table-lifecycle-ddl` - Phase D's first
  implementation slice, per `docs/product-specs/schema-editing.md`. `SchemaDdlApi`
  (`createTable`/`renameTable`/`truncateTable`/`dropTable`) implemented across all four adapters
  (each engine's own `ddl.ts`, mirroring `mutations.ts`), gated server-side (routes under
  `/api/schemas/:schema/tables` and `/api/tables/:schema/:table/ddl/...`) on F096 + the session's
  real `supportsDdl` capability, with server-side `dataType`-catalog validation and independent
  `confirmedName` re-validation for `truncate`/`drop`. Full detail in `docs/FEATURES.json`'s F110
  entry (not yet `passing` there - pending merge). Verified: `pnpm check:quiet:run`, full local
  gate incl. Docker-backed Postgres/MySQL/MongoDB integration tests, all green. One real bug found
  and fixed along the way: Postgres's `getTable` never rejects for a dropped table (reads
  `pg_class`'s catalog estimate, not a live query), so both its integration test and the shared
  conformance roundtrip assert absence via the overview's table list instead. Not yet pushed/PR'd.

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
- `better-sqlite3`'s native binding can go stale against the machine's active Node version
  (`NODE_MODULE_VERSION` mismatch, `new Database()` throws). Fix: `pnpm install --force` under the
  Node version you intend to test with (this repo's Docker/CI stack matches Node 22,
  `NODE_MODULE_VERSION` 127) to rebuild the prebuilt binary; a `node-gyp rebuild` against a too-new
  Node (e.g. 26) can fail to compile against that Node's V8 headers.

## Next steps

- Finish delivering F110 (commit, push, PR, wait for CI green, then wait for the user to say it's
  merged - never merge it here), then F111 (column operations) per the exec plan's Phase D order,
  bundling F110's own `FEATURES.json` passing-state catch-up into F111's delivery commit per this
  session's established bundling convention.
