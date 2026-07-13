# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-14.
- Branch: `feature/F120-permission-denied-hardening`, based on `main` through merged PR #135.
- Queue: F111-F120 are `passing`; F121 and F128 remain `not_started`.
  `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128; see the plan's own progress log and
  `docs/FEATURES.json` for full per-feature evidence. F090-F116, F122-F127, F129 are merged to
  `main` (PRs #94-#132): permission/capability foundation (F090-F098, F122-F124), the row-mutation
  write path (F099-F102), the full row-editing UI (F103-F105, F125), Phase C -
  `classifyStatement`/`runQuery` classification (F106-F107), the write-capable SQL Editor
  (F108, F126-F127) - and Phase D's `SchemaDdlApi`/`DatabaseAdminApi` slices: table lifecycle
  (F110), column ops (F111, incl. SQLite's 12-step rebuild), index ops (F112), the table designer
  UI (F113), the Structure view (F114), database/schema lifecycle (F115), and its management UI
  (F116) - all gated server-side on F096 + the relevant capability flag.
- F117 (CSV import) merged as PR #133 (`35c29ce`). Its
  capped streaming inspect/validate/import API, typed mapping/coercion, bounded SQL transactions,
  one-document MongoDB batches, permission/kind gates, mapping/dry-run/result UI, product contract,
  and read-only E2E canary are complete. The local and pre-push `CI=1 pnpm verify:pr` gates passed
  against all four engines, smoke E2E, and full E2E.
- F118 merged as PR #134 (`a944d73`). It replaces paginated
  export queries with native streams on all four engines and adds capability-driven CSV,
  JSON/Extended JSON, and SQL-INSERT downloads while preserving selected-row CSV precedence. The
  local and pre-push `CI=1 pnpm verify:pr` gates and explicit four-engine stream conformance passed.
- F119 merged as PR #135 (`e964310`). It adds a secret-safe,
  read-only access inspection contract and Settings viewer across Postgres, MySQL, SQLite, and
  MongoDB, including partial catalog degradation, bounds/redaction coverage, and a parallel E2E
  fixture-race repair. Local and pre-push `pnpm verify:pr` gates passed on Node 22.
- F120 is pushed in draft PR #136 (`dd3bde0`). Native permission errors now map to one redacted
  structured 403 across every mutating path, route metadata coverage is enforced at startup, the
  browser refreshes capability/table-permission caches after denial, and restricted conformance
  covers Postgres, MySQL, and SQLite (MongoDB auth is not applicable in the shared fixture). Local,
  pre-push, and both GitHub CI jobs passed on Node 22.

## In progress

- No active feature. F121 is the next plan slice and the plan 0006 exit gate.

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

- After PR #136 merges, promote F121 and implement the per-engine read-only/writable role-matrix E2E
  exit gate plus README, architecture, and security-document consolidation; then complete plan 0006.
