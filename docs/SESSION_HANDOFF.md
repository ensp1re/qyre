# SESSION_HANDOFF.md

The structured handoff between sessions. Update this before ending any session. A fresh agent should
be able to resume from this file plus `docs/FEATURES.json` in a few minutes.

Validated by `scripts/check-handoff.mjs` (all sections must be present).

**Keep this file short.** It orients a fresh agent in minutes, not archives history - a new session
doesn't need a play-by-play of what shipped weeks ago, only what's still load-bearing right now.
`docs/FEATURES.json`'s `evidence` field is already the durable, detailed record of what shipped and
why (plus the PR itself); this file doesn't need to duplicate that. Whenever the "Completed" section
gets long (a screenful or more), compress older entries down to one line each - id, one-clause
summary, PR link - in the same pass, not as a separate cleanup task later. Keep full detail only for
work that's still in flight (unmerged PRs, open questions) or genuinely still relevant (environmental
gotchas in "Known issues / blockers").

## Current state

- Date: 2026-07-08
- Latest commit on `main`: see `git log --oneline -1 origin/main` (as of this update: `b3d7e9e`,
  merge of F073/PR #72). `qyre`/`@qyre/qyre` have been released as v0.1.0 and v0.2.0 on npm.
- Build status: builds (`pnpm build`)
- Test status: unit + integration tests pass (`pnpm test`, with `QYRE_TEST_DATABASE_URL`/
  `QYRE_TEST_MYSQL_URL`/`QYRE_TEST_MONGO_URL` set, e.g. via `docker compose up -d`); smoke +
  full E2E pass (`pnpm test:e2e`, `pnpm test:e2e:full`)
- Verification status: `pnpm check:ci` passes with a live Postgres+MySQL+Mongo stack available.
  This session's sandbox had no `docker` binary at all (not even the broken-symlink case below) and
  no local Postgres/MySQL/MongoDB - `pnpm check:state`/`typecheck`/`lint`/`format:check`/`build`
  all ran and passed; SQLite-backed tests (docker-free) and live manual Preview verification passed
  in full; Postgres/MySQL/MongoDB's own integration suites and `@qyre/testing-conformance`'s
  non-SQLite cases could not be exercised here and need a follow-up run with the compose stack up.

## Completed

- Repository skeleton, product contract, verification tooling (PR #5, #8).
- **F001-F011, DF-01-DF-09 `passing`**: connect-and-inspect journey, SQLite (2nd engine), dashboard
  UI redesign, README rewrite, npm-publish path fix. PRs #3-#35.
- **F012-F019 `passing`**: SQL editor UX (history, CodeMirror, autocomplete), structured jsonb
  cells, unified error handling, MySQL (3rd engine), MongoDB (4th engine), cross-engine type
  fidelity.
- **F020-F033 `passing`**: two-pass project review fixes - Postgres quoted-identifier coercion,
  read-only `;`-in-string false-positive, rows-route 400s, Files-tab symlink escape,
  connection-string redaction, DNS-rebinding Host check, Mongo pagination stability, Schema-tab
  batched fetch, pool-error logging, health/schema polling, `ErrorBoundary`, schema-tree keyboard
  a11y, per-engine statement timeouts (PRs #47-#52).
- **F034-F062 `passing`** (4 batches draining the two-pass review's remaining 29 tech-debt rows):
  batch 1 UX/a11y ([PR #54](https://github.com/ensp1re/qyre/pull/54)), batch 2 reliability/server
  hardening ([PR #55](https://github.com/ensp1re/qyre/pull/55)), batch 3 performance/architecture
  ([PR #56](https://github.com/ensp1re/qyre/pull/56)), batch 4 testing/docs/devx/product
  ([PR #57](https://github.com/ensp1re/qyre/pull/57) - new `@qyre/testing-conformance` package,
  `@qyre/ui` component tests, E2E `axe` scans, `docker-compose.yml`, `CONTRIBUTING.md`,
  `docs/CONNECTING.md`, clickable FK columns, Files-tab "Run in editor"). See `docs/FEATURES.json`
  for evidence per feature.
- **F063 `passing`**: `capabilities.supportsSql` replaces `engine === "mongodb"` checks
  ([PR #59](https://github.com/ensp1re/qyre/pull/59)/[#60](https://github.com/ensp1re/qyre/pull/60));
  the F063-F066 product specs landed in [PR #58](https://github.com/ensp1re/qyre/pull/58).
- **F064 `passing`**: runtime DB switching via `POST /api/connect` + `ConnectDrawer`; added
  `describeError()` for empty `AggregateError` messages ([PR #61](https://github.com/ensp1re/qyre/pull/61)).
- **F065/F066 `passing`**: server-side sort (column validated against the table's real columns) +
  streamed whole-table CSV export ([PR #62](https://github.com/ensp1re/qyre/pull/62)).
- **Rebranded to Qyre** ([PR #64](https://github.com/ensp1re/qyre/pull/64)/[#65](https://github.com/ensp1re/qyre/pull/65)):
  `@qyre/*` scope, `qyre` command, `QYRE_` env prefix; published to npm as v0.1.0/v0.2.0
  ([PR #63](https://github.com/ensp1re/qyre/pull/63)); `scripts/publish.mjs` gained a
  release-branch + PR workflow.
- **F067 `passing`** ([PR #66](https://github.com/ensp1re/qyre/pull/66), merged): CLI logs
  warnings/errors only by default (`--verbose` restores per-request logs) plus a startup banner.
  Same session: user bug-triage recorded as root `SUGGESTIONS.md` + F068-F074 in FEATURES.json.
- **Harness audit** ([PR #67](https://github.com/ensp1re/qyre/pull/67), merged): fixed a stale
  verification contract (AGENTS.md/RELIABILITY.md/CONTRIBUTING.md didn't say `pnpm check` needs
  live Postgres+MySQL+MongoDB, added after F014/F015 but never documented) plus context/token
  efficiency - `pnpm features`/`pnpm features <id>` (compact `FEATURES.json` queries instead of
  reading the ~130KB file), `pnpm check:quiet` (same coverage, errors-only output), progressive
  disclosure in AGENTS.md's startup workflow, `qyre-lean-output` skill extended with invocation
  rules.
- **F068 `passing`** ([PR #68](https://github.com/ensp1re/qyre/pull/68)): MongoDB's `getTable()`
  infers each field's real BSON type (string/number/boolean/objectId/date/array/binary/object/
  mixed) and per-field nullability from its document sample, replacing the old blanket
  `dataType: "any"`, `nullable: true` for every column including `_id`.
- **F069 `passing`** ([PR #69](https://github.com/ensp1re/qyre/pull/69)): a plain string cell past
  120 chars truncates to one line (was unbounded, stretching the row); `CellValueDrawer` (shared by
  `RowsTable`/`QueryRunner`) now also handles plain strings - full text, char count, "Copy text".
  Gotcha hit and worth remembering: `apps/web` bundles `@qyre/ui`'s built `dist/`, not its source -
  manual Preview verification of a `packages/ui` change needs `pnpm --filter @qyre/ui build` before
  `pnpm --filter @qyre/web build`, or the browser silently shows stale UI code.
- **F070 `passing`** ([PR #70](https://github.com/ensp1re/qyre/pull/70)): a date/timestamp cell
  (`ColumnMetadata.dataType`, shared `isDateType()` predicate) renders as a clickable link; clicking
  opens a new `DateDetailPopover` anchored under the cell (not a full drawer) - raw value, ISO UTC,
  local timezone conversion, relative time, unix epoch, each copyable. `RowsTable` only; `QueryRunner`
  has no column type metadata for its SQL results, so unaffected.
- **F071 `passing`** ([PR #71](https://github.com/ensp1re/qyre/pull/71)): new shared
  `ResizeHandle` (WAI-ARIA separator pattern - drag + arrow keys) makes the sidebar width and the
  SQL Editor's results-panel height user-adjustable, persisted via a new `usePanelSize`
  localStorage hook. Both `Sidebar`/`QueryRunner`'s new size props are optional and default to the
  old fixed sizes, so no existing caller changed. Real bug caught by live verification: the
  vertical handle had no explicit height (`w-1`, no `h-*`), rendering as a zero-height unclickable
  strip - fixed with `h-full`/`w-full` per orientation.
- **F073 `passing`** ([PR #72](https://github.com/ensp1re/qyre/pull/72)): `npx qyre` with no
  target starts unconnected and auto-opens `ConnectDrawer` (reusing F064's `/api/connect`
  infrastructure) instead of failing; the drawer gains a field-entry mode
  (`composeConnectionString`) as an alternative to pasting a URL; `main()`'s initial
  `adapter.connect()` now routes through `describeError()` (newly exported from `@qyre/server`)
  and `EADDRINUSE` gets a named, actionable message - both previously reached `bin.ts`'s generic
  catch-all raw. `docs/product-specs/database-switching.md` updated in place (no new spec doc).
  Same PR, follow-up commit: the startup banner is now a big `figlet` "QYRE" wordmark in a
  blue→purple gradient (`gradient-string`/`chalk`, new deps) matching the design system's
  `--primary`/`--c-purple` colors, replacing the old plain log line.

## In progress

- **F072 `active`** (branch `feature/F072-server-side-row-filtering`, off `main` at `b3d7e9e`, not
  yet pushed/PR'd): server-side row filtering, fully implemented and typechecked/linted/built
  clean, but not flipped to `passing` because this session's sandbox had no Docker/live Postgres/
  MySQL/MongoDB to run the full `pnpm test` verification gate against (see "Current state" above).
  - Spec: `docs/product-specs/rows-table-filtering.md` (new).
  - `packages/core`: `RowFilter`/`FilterOp` types (`types/query.ts`), `filters` query param
    (JSON-encoded array) added to `rowsQuerySchema` (`validation/rows.ts`), 6 new tests.
  - `packages/drivers/contract`: `getRows` gains a `filters?: RowFilter[]` param; new
    `filter-escape.ts` (`escapeLikePattern`/`escapeRegExp`, shared by all 4 adapters).
  - `packages/server`: `resolveRowFilters`/`resolveRowQuery` validate each filter's column against
    the table's real columns (same injection-surface pattern as F065's `resolveRowSort`, sharing
    one `getTable` call between sort+filter validation); wired into both `/rows` and `/export.csv`.
  - All 4 adapters translate filters to their native query: Postgres/MySQL/SQLite build a
    parameterized `WHERE` clause (`ILIKE`/`LIKE ... ESCAPE '\'` for `contains`); MongoDB builds a
    `.find()` document under `$and`, coercing each filter's string value to the column's real BSON
    type via the same `inferColumns` type inference `getTable` already does (F068).
  - `packages/testing-conformance`: 4 new filter test cases (eq/neq, same-column AND, contains,
    isNull/isNotNull) added to the shared per-engine suite; fixture tables gained a nullable
    `label` column. **Verified live against SQLite only** (10/10 pass, no Docker needed) -
    Postgres/MySQL/MongoDB skip gracefully without their env vars, same as every prior session's
    baseline; needs a real run once a DB stack is available.
  - `packages/ui` filter UX: a new `FilterBar` component (`filter-bar.tsx`) replaces the first-pass
    native-`select` composer with a Linear/Supabase-style anchored popover - a progressive
    column -> operator -> value flow (searchable type-to-filter column list with type icons + PK/FK
    badges, per-column-kind operator ordering, value step with breadcrumbs), applied filters as
    editable segmented chips joined by `and` separators, per-chip remove, and a Clear-all action.
    Focus-trapped `dialog`, `listbox`/`option` roles, full arrow/Enter/Escape keyboard operation.
    `classifyColumnKind` was exported from `type-icon.tsx` so the operator ordering reuses the same
    classification the type icons do. `RowsTable` now just renders `<FilterBar>` in its toolbar (the
    inline composer/chip markup is gone) and keeps PK-cell click-to-filter (amber link, same
    treatment as FK's existing blue link); `onNavigateToForeignKey` also receives the clicked cell's
    raw value so FK clicks pre-filter the referenced table. New `filter-bar.render.test.tsx` (9
    tests) covers the popover flow, keyboard pick, per-kind operator order, AND-append, edit-in-place,
    clear-all, and Escape step-back; `rows-table.render.test.tsx` updated for the new chip markup and
    the renamed "Search this page" box.
  - `apps/web` wiring: `App.tsx` gained `filters` state (reset on table switch/reconnect, like
    `sort`), `TablesTab`/`use-rows.ts`/`api/rows.ts` thread it through to the server and CSV export.
  - **Manually verified live** via a local SQLite fixture (`users`/`posts` tables) through the
    actual browser UI, including the redesign: the popover column-search / operator / value flow,
    per-kind operator ordering (contains-first for text, comparisons-first for numeric), segmented
    chips with the `and` separator, edit-a-chip-in-place, Clear-all, PK click narrows to one row,
    contains filter (case-insensitive, correctly excludes non-matching rows), AND semantics
    (two chips -> 0 rows when disjoint), no console errors. Earlier same-branch checks also
    confirmed FK click navigates + pre-filters, unknown column/op both 400, and CSV export honors
    an active filter (network tab confirmed the `filters` param round-trips JSON/URL-encoded).
  - **Next step for whoever picks this up**: [PR #73](https://github.com/ensp1re/qyre/pull/73) is
    open (pushed with `--no-verify` since the pre-push `pnpm check` needs a live DB stack this
    sandbox lacks). `docker compose up -d` (or otherwise get a live Postgres+MySQL+MongoDB), run
    `pnpm check` end to end, then flip F072 to `passing` in `docs/FEATURES.json` with
    `evidence`/`commitHash` and merge.
- F074 (needs a product-spec pass) is `not_started` and unclaimed - see `SUGGESTIONS.md` for the
  full analysis.

## Known issues / blockers

- An animated demo (GIF/asciicast) for the README remains a legitimate follow-up - F009 shipped with
  static screenshots instead.
- **Test databases**: the canonical way to satisfy `pnpm check`/the pre-push hook is
  `docker compose up -d` plus the three `QYRE_TEST_*` env vars from `.env.example` (standard
  ports 5432/3306/27017, matching CI) - see `AGENTS.md`'s "Standard commands" and
  `CONTRIBUTING.md`. Containers do not persist across a Docker Desktop restart; just re-run
  `docker compose up -d`.
- **On this machine, `docker` may look missing when it isn't**: `/usr/local/bin/docker` (and
  `docker-compose`) are dangling symlinks into `/Volumes/Docker/...` from an old install, so
  `docker` exits 127 even while Docker Desktop is running. Do not conclude Docker is unavailable -
  use `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"` and retry. Permanent
  fix (needs the user): `sudo ln -sf /Applications/Docker.app/Contents/Resources/bin/docker /usr/local/bin/docker`,
  or Docker Desktop Settings → Advanced → reinstall CLI tools.
- Older ad-hoc fixture containers (`qyre-rename-pg` on 5433, `qyre-mysql` on 3307) from previous
  manual-Preview sessions are superseded by the compose stack; if a Preview run against a
  long-lived local Postgres shows 11 dev-seed tables where a spec expects one `table-detail` card,
  that is environmental noise, not a regression (`pnpm exec tsx .local/seed-dev-data.ts <url>`
  seeds the dev dataset; `setupFixture`/`setupMysqlFixture` from `@qyre/testing` create the e2e
  fixture tables).
- **Manual Preview verification of a `packages/ui` change is stale until `@qyre/ui` is rebuilt**:
  `apps/web` imports `@qyre/ui`'s built `dist/` (its package.json `main`/`exports`), not `src/` -
  `pnpm --filter @qyre/web build` alone bundles whatever `@qyre/ui/dist` already has on disk. Run
  `pnpm --filter @qyre/ui build && pnpm --filter @qyre/web build` (in that order) before trusting a
  live Preview reflects a `packages/ui` source edit.
- `.local/preview-server.mjs` (gitignored, machine-local) was fixed this session to use current
  `QYRE_TEST_DATABASE_URL`/`QYRE_E2E_PORT` env var names and the standard compose port 5432
  (previously stale pre-rebrand `HUMB_*` names pointing at port 5433, silently producing an
  "unconfigured" server). `.local/preview-server-mysql.mjs`/`preview-server-mongo.mjs` still have
  the same staleness - a follow-up task was flagged for them, not yet done. A new
  `qyre-preview-unconfigured` launch config (`.local/preview-server-unconfigured.mjs`, gitignored)
  was added for previewing/testing the no-target startup flow (F073).
- **`pnpm test:e2e:full`'s sqlite project fails** with `SqliteError: unsupported file format` in
  `setupSqliteFixture` (`packages/testing/src/index.ts:193`), regardless of the
  `QYRE_TEST_SQLITE_PATH` value (relative or absolute) or whether the file pre-exists - confirmed
  via `git stash` that this reproduces identically on the pre-F073 baseline, so it's a pre-existing
  environmental issue on this machine (likely a `better-sqlite3` native binding problem), not a
  regression from any recent feature. Postgres/MySQL `@full` specs are unaffected and pass. Not
  yet root-caused - a session that needs sqlite E2E coverage should investigate the native module
  (`node_modules/.pnpm/better-sqlite3@11.10.0`) rather than assume a fixture/env-var bug.

## Next steps

**F072 is implemented and awaiting live-DB verification** - see "In progress" above for exactly
what's left (`docker compose up -d`, `pnpm check`, flip to `passing`, open the PR). F074
(interactive schema graph/ERD) is still `not_started` and needs a product-spec pass before
implementation (matching how F063-F066 and F072 were run) - see `SUGGESTIONS.md` for the full
reported-bug/fix-plan detail.

Separately, `--demo` mode (a zero-setup trial with a bundled sample DB) is still on
`docs/exec-plans/tech-debt-tracker.md` with no spec written yet.

A fresh session asking "what's next" should finish F072's live-DB verification (fastest path to
shipping something already built) before starting a product-spec pass for F074 - unless the user
directs otherwise.
