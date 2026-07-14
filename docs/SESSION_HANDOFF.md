# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-14.
- Branch: `feature/F139-sql-editor-permission-refresh` at `0d77b9a`, based on `main` through
  merged PR #142 (F134).
- Queue: F114-F121, F128, F129, F130, and F134 are `passing` (merged); F139 is `passing` (pending
  this branch's PR); F131-F133, F135-F138, and F140-F143 are `not_started` review-fix tasks
  derived from `docs/SUGGESTIONS.md` (a 2026-07-14 deep code review of apps/web, packages/ui,
  packages/server, packages/cli); no active feature. `nextIds.F` is 144.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/completed/0006-role-aware-database-ide.md`) is fully merged to
  `main` as F090-F128 (PRs #94-#138, final commit `90e69c2`): permission/capability foundation,
  the row-mutation write path and row-editing UI, statement classification and the write-capable
  SQL Editor, schema/table/column/index DDL and its UI, database/schema lifecycle, CSV import,
  streamed multi-format export, roles-and-grants viewer, permission-denied hardening, the
  role-aware E2E matrix, and the SQL EXPLAIN viewer. Per-feature evidence lives in the plan's
  progress log and PR history; every slice passed local/pre-push `pnpm verify:pr` and GitHub CI.
- A deep read-only code review of the product workspace (2026-07-14) produced
  `docs/SUGGESTIONS.md` (14 findings: security, server, UI, CLI) and queued F129-F143.
- F129 (PR #140, `d624bef`), F130 (PR #141, `b99ef25`), and F134 (PR #142, `15d5c2e`) are merged:
  the session-token handout is now documented as an accepted local-trust limitation (S1),
  `--verbose` request logs mask the export URL's `?token=` param (S2/C2), and the combined column
  rename+alter DDL route is atomic on Postgres/SQLite with an honest partial-success result on
  MySQL (V1). See each id's evidence in `docs/FEATURES.json` for full reasoning/test detail.
- F139 (`0d77b9a`, pending PR): closed SUGGESTIONS.md U1 - the SQL Editor's `runQuery`/
  `explainQuery` fetchers now route non-2xx bodies through the shared `apiResponseError`, so a
  structured permission denial notifies the F120 capability-cache refresh instead of leaving write
  affordances stale until the next poll. See `docs/FEATURES.json`'s F139 evidence.

## In progress

- No active feature. Plan 0006 is complete.

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
- Local full E2E is fixture-contention-prone under Playwright's `fullyParallel: true`: repeated
  no-retry runs moved transient missing-table/schema/autocomplete failures among unrelated engines;
  the CI configuration's one retry passed the entire gate. Tracked in the tech-debt tracker.

## Next steps

- Open/merge F139's PR, then promote the next task from the F131-F133/F135-F138/F140-F143
  review-fix queue (see `docs/SUGGESTIONS.md` for each finding's full context). Suggested order:
  F140 (remaining moderate correctness fix), then minors; F143 (scalable-structure refactor) last
  so file moves don't conflict with in-flight fixes.
