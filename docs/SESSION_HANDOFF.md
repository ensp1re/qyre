# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-15.
- Branch: `feature/F137-null-primary-key-validation`, based on `main` at `264330e` through merged
  PR #149 (F136).
- Queue: F114-F121, F128, F129, F130, F131, F132, F133, F134, F135, F139, and F140 are `passing`
  (merged); F136 is `passing` (merged); F137 is `active`; F138 and F141-F143 are `not_started`
  review-fix tasks derived from `docs/SUGGESTIONS.md` (a 2026-07-14 deep code review of apps/web,
  packages/ui, packages/server, packages/cli). `nextIds.F` is 144.

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
  `docs/SUGGESTIONS.md` (14 findings: security, server, UI, CLI) and queued F129-F143. F129
  (PR #140), F130 (#141), F134 (#142), F139 (#143), F140 (#144), F131 (#145), F132 (#146),
  F133 (#147), and F135 (#148) are merged: the session-token handout is documented as an accepted
  local-trust limitation (S1); `--verbose` logs mask the export URL's token (S2/C2); combined
  column rename+alter is atomic on Postgres/SQLite with an honest partial-success result on MySQL
  (V1); the SQL Editor's write-attempt errors now trigger the F120 capability-cache refresh (U1);
  `EditableCell`/`NewRowCell` gained NULL/empty-string reachability, Escape-to-cancel on date
  editors, and bigint-precision rejection (U2/U4/U5); `describeError()` redacts credentials
  embedded in driver error text (S3); recent-targets persistence catches compound credential-param
  names (S4); `GET /api/files/content` caps a preview read at 1 MiB (S5); and batch-commit
  introspects each staged table once instead of once per op (V2). See each id's evidence in
  `docs/FEATURES.json` for full reasoning/test detail.

## In progress

- F137: `resolveKey` now rejects any `null` primary-key member with an explicit 400 before an
  adapter mutation runs. Server unit/route coverage exercises update and delete, and a real SQLite
  fixture proves the nullable non-`INTEGER` primary-key scenario. Feature verification passed:
  server 298/298 tests and SQLite 51/51 tests. The complete PR-gate stages also passed in an
  unprivileged bubblewrap copy: 34/34 check tasks, smoke E2E 11 passed/4 skipped, and full E2E 29
  passed/43 skipped. The implementation is committed locally on the feature branch.
- Plan 0006 is complete.

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
- This container runs commands as root, so SQLite's 10 chmod/read-only tests cannot observe Unix
  permission denial. Run the gate as a non-root bubblewrap user here; the same 51-test suite is
  green there.
- `gh auth status` reports that the configured `ensp1re` token is invalid, blocking the required
  normal push, draft PR, and CI wait until GitHub authentication is refreshed.

## Next steps

- Refresh GitHub authentication, push normally from the verified non-root environment, open F137's
  draft PR, and wait for CI. Continue with F138/F141-F143 afterward; leave F143 last so file moves
  do not conflict with in-flight fixes.
