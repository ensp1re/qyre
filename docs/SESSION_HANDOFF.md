# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-12.
- Branch: `main`. F106, F107, F108, F126 merged (PRs #120-#123, all CI green). F127 (column-level
  SQL autocomplete) implemented on `feature/F127-column-sql-autocomplete`, not yet pushed/PR'd.
- Queue: F092-F108 and F125-F126 are `passing`; F109-F121 and F127-F128 remain `not_started`. F127
  is `not_started` in `FEATURES.json` pending its own merge (its passing state + evidence will be
  recorded in the next feature's delivery commit, per this session's established bundling
  convention). `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128; see the plan's own progress log for full
  per-feature history and `docs/FEATURES.json` for verification evidence. F090-F108, F122-F126,
  F129 are merged to `main` (PRs #94-#123): permission/capability foundation (F090-F098,
  F122-F124), the row-mutation write path (F099-F102), the full row-editing UI (F103-F105, F125),
  and all of Phase C except F127 - `classifyStatement` (F106), `DatabaseAdapter.runQuery` +
  `POST /api/query`'s classification routing (F107), the write-capable SQL Editor UI (F108), and
  query cancellation + long-op handling (F126, resolving the SQLite worker-thread-vs-non-
  cancellable open decision in favor of non-cancellable).

## In progress

- F127 (column-level SQL autocomplete), on `feature/F127-column-sql-autocomplete` - the last Phase
  C slice: `packages/ui/src/query/sql-completion.ts`'s completion source (F013) gained column
  suggestions layered onto the existing FROM/JOIN table-name and keyword completion.
  `resolveReferencedTables(sql, tables)` regex-scans every `FROM`/`JOIN` clause and maps each alias
  (and each unaliased table's own name) to its columns, case-insensitively; right after
  `alias.`/`table.` only that table's columns are offered, everywhere else it's keywords plus every
  referenced table's columns. `needsQuoting`/`quoteIdentifier` quote a suggestion only when unsafe
  to leave bare (mixed case, punctuation, leading digit) - Postgres folds an unquoted mixed-case
  identifier to lowercase, so this matters for correctness, not just style; MySQL uses backticks,
  Postgres/SQLite double quotes. No new server surface - reuses `GET /api/tables`'s already-fetched
  metadata, threaded from `app.tsx` through `SqlEditorTab` to `QueryRunner`'s new `tables`/`engine`
  props (ref-backed getters, so a connection switch is picked up without recreating the CodeMirror
  extension). New unit tests cover alias resolution, qualified-prefix detection, and per-engine
  quoting; `sql-editor-autocomplete.spec.ts` e2e spec gained a column-completion step. Manually
  verified end-to-end against a live Postgres connection too. Full detail in the exec plan's
  progress log. Not yet pushed/PR'd - `pnpm --filter @qyre/ui test` green, `pnpm check:quiet`/
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

- Finish delivering F127 (`pnpm check:quiet`/`pnpm verify:pr`, commit, push, PR, wait for CI green,
  then wait for the user to say it's merged - never merge it here). F127 is the last queued Phase C
  slice; check the exec plan's "Feature order and dependencies" section for what's next after it.
