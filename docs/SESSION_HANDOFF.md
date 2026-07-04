# SESSION_HANDOFF.md

The structured handoff between sessions. Update this before ending any session. A fresh agent should
be able to resume from this file plus `docs/FEATURES.json` in a few minutes.

Validated by `scripts/check-handoff.mjs` (all sections must be present).

## Current state

- Date: 2026-07-04
- Latest commit: see `git log --oneline -1 origin/main`
- Build status: builds (`pnpm build`)
- Test status: unit + integration tests pass (`pnpm test`, with `HUMB_TEST_DATABASE_URL` set); smoke
  - full E2E pass (`pnpm test:e2e`, `pnpm test:e2e:full`)
- Verification status: `pnpm check:ci` passes with a live Postgres available

## Completed

- Repository skeleton, product contract, verification tooling (`pnpm check`, Lefthook, CI).
- **F001-F005 all `passing`** - the full connect-and-inspect journey (`pnpm test:e2e:full`) is green
  end to end: CLI starts the server (`HUMB_PORT` respected, static-serves the built `apps/web`),
  browser shows connection status, navigation tree + table metadata (columns/indexes/row count), and
  paginated rows. Each of F001/F003 needed a real audit before being trustworthy - passing
  package-level tests hid real gaps (`HUMB_PORT` ignored, no static serving, indexes/rowCount
  unimplemented, a `pg` array-type parsing bug) - see PRs #3-#7 for the full history.
- Architecture reorganization (PR #5, rules in `docs/CODE_ORGANIZATION.md`): `@humbdb/core` split into
  `types/`/`validation/`/etc.; `@humbdb/ui` split into one component per file; renamed
  `db-adapter`/`db-postgres` to `packages/drivers/contract`/`packages/drivers/postgres`
  (`@humbdb/driver-contract`/`@humbdb/postgres`).
- `docs/FEATURES.json` gained a `commitHash` field (PR #8's follow-up): `passing` features must
  record the actual pushed git SHA, not just prose, enforced by `scripts/check-features.mjs`.
- Structure guides added: `apps/web/STRUCTURE.md` (feature-based growth path) and
  `packages/server/STRUCTURE.md` (Fastify plugin/route growth path) - see PR #9.
- `.local/` added to `.gitignore` (personal, never-committed scratch scripts); `@humbdb/testing`
  gained a generic `runStatements()` helper to support this without adding new root dependencies.
- **F006 `passing`** (PR #10): read-only SQL query runner. Auditing it found a real, exploitable
  security bug - a writable CTE bypassed the leading-keyword read-only check and actually deleted
  data. Fixed with a full-statement keyword scan plus (the authoritative backstop) running queries
  inside a real Postgres `READ ONLY` transaction. Also fixed a rejected query returning HTTP 500
  instead of 400, and built the missing `QueryRunner` UI.
- **F007 `passing`** (commit `5259102`, PR pending): health/runtime diagnostics endpoint. Auditing
  `/api/health` (built in F001) the same way as F001/F003/F006 found a real crash bug, not just a
  coverage gap: node-postgres's `Pool` emits an unhandled `"error"` event when an idle client's
  connection is severed by the database (restart, network blip, admin kill) - with no listener, that
  crashes the entire Node process instead of `/api/health` ever getting a chance to report
  `"disconnected"`. Confirmed live: started the CLI against a real Postgres container, stopped the
  container, and watched the whole server die instead of degrading gracefully. Fixed with
  `pool.on("error", ...)` in `packages/drivers/postgres/src/index.ts`'s `connect()`, logging instead
  of crashing - re-verified live that killing the database now leaves the server up and
  `/api/health` correctly reports `"disconnected"`, and that a subsequent `SIGINT` still shuts down
  cleanly. Added a regression test (`postgres-adapter.integration.test.ts`) that reproduces the exact
  failure via `pg_terminate_backend` on an idle pooled connection against a real database - confirmed
  it fails without the fix and passes with it. Broadened F007's verification command to also run
  `pnpm --filter @humbdb/postgres test`, matching F006's precedent, since the fix lives there, not in
  `@humbdb/server`.
- Backlog planning (PR #12): added F008 (SQLite driver, with a full product spec at
  `docs/product-specs/connect-and-inspect-sqlite.md`), F009 (README rewrite), F010 (npm publish, incl.
  `scripts/publish.mjs` for lockstep version bump + release). No product code changed.
- **F008 `passing`** ([PR #13](https://github.com/ensp1re/humb/pull/13), merged): SQLite as Humb's
  second engine (`npx humb ./app.db`). See `docs/exec-plans/active/0002-sqlite-engine.md` for full
  detail (F011, its e2e slice, is now also `passing` - see this file's "Completed" entry below). In
  short: generalized `@humbdb/core`'s
  `parseConnectionTarget` from Postgres-only to engine-detecting (this was the real blocker to any
  second engine, not a missing driver package); moved `assertReadOnly` from `@humbdb/postgres` to
  `@humbdb/driver-contract` so both engines share it; built `@humbdb/sqlite` on `better-sqlite3` with the
  whole connection opened `readonly: true` as the authoritative read-only backstop (verified live,
  independent of the string-scan heuristic); wired `sqliteAdapterFactory` into the CLI. Caught and
  fixed a real bug during live verification (not package tests, which all passed): `/api/health`
  redacted a SQLite path as `<unparseable connection string>` since redaction assumed every target is
  a URL. Scoped to backend + CLI - Playwright e2e coverage split out as **F011** (now `passing`).
- Moved `docs/exec-plans/active/0001-postgres-inspection.md` to `completed/` (F001-F007 all
  `passing`).
- **DF-01 `passing`** (dashboard UI redesign, foundation slice): the user shared a private design
  repo (`github.com/ensp1re/UserDashboard`, a Figma Make export) to implement as Humb's new UI - a
  VS Code-style Postgres/SQL IDE (title bar, searchable sidebar tree, SQL Editor/Tables/Schema/
  Files/Console tabs, status bar), not a generic dashboard. See
  `docs/exec-plans/completed/0003-dashboard-ui.md` for full detail and the `DF-02`..`DF-09` breakdown.
  This slice: extracted the full token set into `docs/references/design-system.md`; added
  `.claude/skills/humb-design-system/SKILL.md` so future UI work discovers it automatically; added
  `docs/product-specs/dashboard-ui.md` (the engine-agnostic UI contract + backend gaps the design
  surfaces: engine+version in `/api/health`, FK metadata, a scoped Files-browsing endpoint, a
  Console/activity-log endpoint); wired the real tokens into `apps/web`'s Tailwind config (previously
  scaffolded but completely unused - zero regression risk, verified live via build/typecheck/e2e/a
  Preview screenshot); added `cn()` to `packages/ui`. Also introduced the `DF-##` ID series
  alongside `F###` (`docs/NAMING.md`, `scripts/check-features.mjs`) for frontend/design-driven work.
  [PR #14](https://github.com/ensp1re/humb/pull/14), merged.
- **DF-02 `passing`** (commit `2b3179c`, corrected in commit `0238265` - see below): rebuilt
  `apps/web`'s shell to the actual IDE layout - title bar, collapsible sidebar with a
  searchable/highlightable schema tree, a five-tab bar (SQL Editor/Tables/Schema/Files/Console),
  and a status bar, all pure Tailwind against DF-01's tokens, no inline styles. Existing data flows
  were preserved, just redistributed across tabs instead of one long page. Files/Console are
  placeholder empty states pending DF-06/DF-07's backends. Added `lucide-react` to `@humbdb/ui` for
  the shell's icons.
- **DF-02 correction, DF-04 `passing`, DF-09 `passing`** (commit `0238265`): the user flagged that
  DF-02's first pass had captured DF-01's token doc correctly but drifted from
  `github.com/ensp1re/UserDashboard`'s actual component patterns, called dark mode "bad for the
  eyes" with no way to change it, and asked for mobile support. Re-cloned and read the real
  `App.tsx` (previously only skimmed for token extraction) and ported its patterns directly:
  hierarchical sidebar tree (connection -> schema -> table, was flat schema -> table) matching the
  source's TreeNode depth/indent/hover exactly; a real spreadsheet-style Tables tab (type/PK
  sub-header row via a new shared `TypeIcon` helper, sortable columns, row-number + checkbox
  columns, CSV export + "copy selected as CSV") - this is DF-04's exact scope, implemented now
  since Tables was the specific complaint rather than deferred again, so DF-04 is `passing` too;
  Schema tab restyled to the source's per-column row pattern; VS Code-style attached tab bar;
  status bar moved to `bg-sidebar` with colored status text; title bar with a real breadcrumb
  split (prefix/database name) and `h-9` sizing. Root cause of "too dark, bad for the eyes": the
  theme toggle was wired inert (chrome-only, deferred to DF-09) with no way to leave dark mode -
  since that's the actual mechanism of the complaint, implemented DF-09 now instead of deferring
  again (`apps/web/src/hooks/use-theme.ts` toggles `.dark` and persists to `localStorage`, plus a
  pre-paint inline script in `index.html` so there's no flash of the wrong theme on load) - DF-09
  is `passing`. Added mobile support the source has none of: the sidebar becomes an off-canvas
  overlay drawer with a backdrop below the `md` breakpoint (opened via the title bar's hamburger,
  shares the same `open` state as the desktop collapse-to-rail); tab bar scrolls horizontally;
  title/status bars hide secondary text at narrow widths. Verified live via Preview across
  desktop/tablet/mobile and both themes against a real Postgres fixture.
- **DF-03 `passing`** (commit `39bfc95`, [PR #20](https://github.com/ensp1re/humb/pull/20)): added
  the SQL Editor's line-numbered gutter, the one piece of `QueryRunner` left unstyled after the
  DF-02 correction pass. A scrollable line-number column
  (`packages/ui/src/components/query-runner.tsx`) stays in sync with the textarea via a real
  `onScroll` handler - the source design (`github.com/ensp1re/UserDashboard`'s `SqlEditor`) never
  needed this since its query never scrolls, so there was no reference behavior to copy. Verified
  live via Preview against a real SQLite fixture: line numbers align and stay synced while
  scrolling a 60-line query, in both light and dark mode. Re-ran `pnpm --filter @humbdb/postgres
test` and `pnpm test:e2e:full` against a real `postgres:16-alpine` container - no regression.
- **DF-05 `passing`** (commit `3a51660`, [PR #21](https://github.com/ensp1re/humb/pull/21)): the
  Schema tab no longer requires a sidebar selection - a new `SchemaGrid`
  (`packages/ui/src/components/schema-grid.tsx`) lays out every table in the database as a card,
  reusing `TableDetail`'s exact column-row pattern (PK badge, `TypeIcon`, indexes, row count)
  unchanged rather than inventing a new one. A new `useAllTables` hook (`apps/web`) fans the
  existing single-table `/api/tables/:schema/:table` endpoint out across every table via
  `useQueries`, sharing its query key with `useTable` so an already-viewed table is served from
  cache. FK badges stay deferred to DF-08 (no backend FK metadata yet). Strengthened
  `e2e/connect-and-inspect.spec.ts` to assert the grid renders before any table selection,
  proving the behavior actually changed - this made the sidebar's table-name assertion ambiguous
  (`getByText` now also matched the grid), fixed by scoping it to a role locator. Verified live
  via Preview against a real 3-table Postgres fixture in both light/dark mode and at tablet width.
- **DF-06 `passing`** (commit `36791ae`, [PR #22](https://github.com/ensp1re/humb/pull/22)): the
  Files tab is real now, backed by a new security-scoped filesystem endpoint. Documented the
  security boundary in `docs/product-specs/dashboard-ui.md` _before_ writing any endpoint code, per
  `docs/SECURITY.md`: opt-in only via a new `--files-dir <dir>` CLI flag (resolved/validated at
  startup - no flag means `GET /api/files` returns `{ enabled: false, tree: [] }`, never a silent
  scan of the launch cwd), one fixed root for the process's lifetime, `*.sql` extension allowlist,
  directories pruned if they contain no `.sql` file anywhere below them, no symlink following.
  `GET /api/files/content?path=...` validates client input defensively even though the root is
  fixed - rejects `..` segments and non-`.sql` extensions, then requires the resolved path to still
  start with the root (the actual traversal stopper); a rejected path is `400`, matching F006's
  precedent. New `FileNode`/`FilesOverview`/`FileContent` types + `fileContentQuerySchema` in
  `@humbdb/core`; new `FilesBrowser` (`packages/ui`) - tree + preview share one scrollable container,
  so there's no separate-scroll-sync problem like DF-03's gutter had. Verified live via Preview +
  curl against a real `--files-dir` fixture: tree shows only `.sql` files, selection/preview works,
  a traversal attempt returns `400` with no leaked content, and the disabled-state message renders
  correctly with no flag - all in both light and dark mode. `pnpm --filter @humbdb/server test`
  (30/30, real temp-dir/symlink fixtures, no mocks) and `pnpm --filter humb test` (11/11) pass;
  `pnpm test:e2e:full` against a real `postgres:16-alpine` container - no regression.
- **DF-07 `passing`** (commit `185e1ae`, [PR #23](https://github.com/ensp1re/humb/pull/23)): the
  Console tab is real now, backed by a new bounded in-memory event log
  (`packages/server/src/event-log.ts`, `EventLog` - no persistence requirement). Wired to two real
  event sources already inside the server, not synthetic data: `POST /api/query` logs `info` on
  success (duration + row count), `warn` when `ReadOnlyViolationError` rejects a query, `error` for
  any other failure; `GET /api/health` logs a transition (not every poll, never the first
  observation) when `ping()`'s result actually changes. New `GET /api/console` (read) and
  `DELETE /api/console` (clear - safe, since it only resets Humb's own diagnostic buffer, not the
  connected database, matching DF-04's CSV-export precedent). New `ConsoleEvent`/`ConsoleEvents`
  types in `@humbdb/core`; new `ConsoleLog` (`packages/ui`) - level-colored stream with a Clear
  action; `useConsoleEvents` polls every 3s while connected (paused by React Query when the tab
  loses focus - confirmed that's why a headless Preview session never saw the auto-poll fire on
  its own, not a bug). Fixed a real, pre-existing gap surfaced while wiring this up: the title
  bar's global Refresh button only refetched health+overview, never Files (DF-06) or the new
  Console data - `refresh()` now refetches both. Verified live via Preview against a real Postgres
  fixture: a successful and a rejected query both appear with correct level colors after a manual
  refresh; Clear empties the log; both light and dark mode render correctly. `pnpm --filter
@humbdb/server test` (37/37) and `pnpm test:e2e:full` against a real `postgres:16-alpine`
  container - no regression.
- **DF-08 `passing`** (commit `c7173fb`, [PR #24](https://github.com/ensp1re/humb/pull/24)): the
  DF series' last two deferred backend gaps. New `DatabaseAdapter.getVersion(): Promise<string>`,
  implemented per engine like every other engine-specific concern (`IndexMetadata`'s F003
  precedent) - Postgres parses `"PostgreSQL 16.4"` out of `SELECT version()`'s full string; SQLite
  formats `"SQLite " + sqlite_version()`. New `HealthResponse.engineVersion` field, populated only
  when actually connected; `StatusBar` shows it in place of the bare engine id, falling back to
  the bare id if the version call ever fails. New `ColumnMetadata.isForeignKey: boolean`, detected
  via `information_schema.table_constraints`/`key_column_usage` (Postgres) and
  `PRAGMA foreign_key_list` (SQLite) - `TableDetail` (reused by `SchemaGrid` and the single-table
  view) now renders the FK badge and blue column-name color the source design always had, closing
  out DF-05's deferred badge. New integration tests for both adapters create a real second table
  with an actual FK constraint, not a mocked shape, plus a `getVersion()` format assertion.
  Verified live via Preview against a real Postgres fixture with a genuine FK
  (`orders.user_id -> humb_demo_users.id`): FK badge renders correctly, status bar reads
  `"PostgreSQL 16.14"` instead of the bare `"postgres"` it showed before - both in light and dark
  mode. `pnpm test` (all packages) and `pnpm test:e2e:full` against a real `postgres:16-alpine`
  container - no regression; `pnpm check` (full monorepo) passes. **The DF series (DF-01..DF-09)
  is now entirely `passing`.**
- **F009 `passing`** (commit `7936c48`, [PR #25](https://github.com/ensp1re/humb/pull/25)): full
  README rewrite - it still said "Early skeleton... most product behavior is not implemented yet",
  stale since F001-F008 and the whole DF series are `passing`. Working quick-start (both Postgres
  and SQLite targets); CI/npm/license badges (CI badge verified against the real workflow via
  `gh api repos/ensp1re/humb/actions/workflows`); a "Why not just use ___?" section (pgAdmin/
  DBeaver-style GUIs, a database's own CLI, cloud-hosted DB GUIs); the read-only-enforced-by-the-
  database security story from F006/F008. Demo asset: asked the user directly whether to ship
  static screenshots now, connect the Chrome extension for a real animated GIF, or skip the visual
  demo - chose static screenshots. New `scripts/capture-readme-screenshots.mjs` starts a real
  server against a live Postgres fixture (with an added FK-constrained table) and drives a real
  Playwright browser through the SQL Editor/Schema/Tables tabs, saving real screenshots (not
  mockups) to `docs/screenshots/` (a new directory - `docs/generated/` is gitignored for
  build-time ephemera, but these need to be committed to render on GitHub/npm). New
  `scripts/check-readme.mjs` (F009's verification command) wired into a new `check:readme` script
  and folded into `check:state`/`pnpm check`, so a future README regression fails loudly.
  `node scripts/check-readme.mjs` and `pnpm check` both pass. Follow-up
  ([PR #27](https://github.com/ensp1re/humb/pull/27), merged): reworded the security section so
  read-only reads as the current phase, not a permanent ceiling, per the user - full write/IDE
  features are a stated future direction once read-only inspection is solid.
- **F010 `passing`** (commit `370c645`, [PR #28](https://github.com/ensp1re/humb/pull/28)): fixed
  the `apps/web/dist` monorepo-relative path tech debt tracked since F001
  (`docs/exec-plans/tech-debt-tracker.md`) - `packages/cli`'s `defaultWebRoot()` located the built
  UI via a path relative to its own file, which only resolved inside this monorepo checkout; once
  published and installed standalone, that traversal would escape into unrelated directories and
  the server would silently serve API-only, no UI. Fixed by bundling `apps/web`'s build directly
  into the `humb` package: `tsup.config.ts`'s `onSuccess` hook copies it into `packages/cli`'s own
  `dist/web`, included automatically since `files: ["dist"]` already covers the whole tree.
  `defaultWebRoot(here)` is now exported and takes an explicit directory (a testable pure function
  like `resolvePort`/`resolveFilesRoot`) - tries the bundled `dist/web` first, falls back to the
  old monorepo-relative path for local dev/test. New `turbo.json` task dependency
  (`humb#build -> @humbdb/web#build`) since there's no `package.json` edge between them for turbo to
  infer build order from. Added npm-discoverability metadata (keywords, homepage, repository,
  bugs) to `packages/cli/package.json`. New `scripts/verify-npm-package.mjs` (F010's second
  verification command) packs the `humb` package exactly as `pnpm publish` would, extracts it into
  a fresh temp directory with zero relationship to this repo, and starts the real server from
  there against a real SQLite file - proving `GET /` serves the actual UI and `GET /api/health`
  reports a real connection from a location that could never accidentally still see the
  monorepo's `apps/web/dist`. `node scripts/verify-npm-package.mjs` and
  `node scripts/publish.mjs --dry-run` both pass; `pnpm test`/`pnpm test:e2e`/`pnpm test:e2e:full`
  (real `postgres:16-alpine` container) and `pnpm check` all pass.
- **F011 `passing`** (commit `126ad1b`, [PR #35](https://github.com/ensp1re/humb/pull/35)):
  `e2e/connect-and-inspect.spec.ts` now runs once per engine via two Playwright projects
  (`postgres`, `sqlite`) against two `webServer` instances, instead of only ever exercising
  Postgres - the same spec body, branching only its fixture setup call on
  `testInfo.project.name`, proving the UI is genuinely engine-agnostic. `@humbdb/testing` gained
  SQLite equivalents of the Postgres fixture helpers (`ensureSqliteFile`, `setupSqliteFixture`,
  `requireTestSqlitePath`) producing the identical table/rows shape so the spec's assertions hold
  unmodified. Moved the `@humbdb/web` build step out of the `webServer` commands into the
  `test:e2e`/`test:e2e:full` npm scripts themselves, avoiding two `vite build` processes racing to
  write `dist/` concurrently once a second `webServer` entry existed. `pnpm test:e2e` and
  `pnpm test:e2e:full` (real Postgres container, both projects, run twice to confirm idempotency)
  and `pnpm check` all pass.
- **F012 `passing`** (commit `8f86d9a`): new `QueryHistoryDrawer` (packages/ui) opened from a new
  toolbar icon on `QueryRunner`, listing past successful queries most recent first; clicking a card
  prefills the editor without running it. New `useQueryHistory` hook (apps/web, `localStorage`,
  matches `useTheme`'s existing pattern) capped at 50 entries, re-running a query already in history
  moves it to the front instead of duplicating it, only recorded on a successful run. New
  `e2e/query-history.spec.ts` (`@full`) proves the full journey on both engine projects. Adding a
  second `@full` spec against the same live Postgres surfaced a real, pre-existing concurrency bug:
  `@humbdb/testing`'s `setupFixture` DROP+CREATE wasn't safe under concurrent Playwright workers
  (two concurrent `CREATE TABLE`s raced `pg_class`'s uniqueness constraint) - fixed with a Postgres
  advisory lock around the whole operation, benefiting every `@full` Postgres test, not just this
  one. `pnpm --filter @humbdb/ui`/`@humbdb/web` build/typecheck, `pnpm test:e2e`/`test:e2e:full`
  (both projects, run twice), and `pnpm check` all pass. Manually verified live via Preview: empty
  state, correct relative timestamps, prefill-without-running, dedup-on-rerun, a rejected query
  never recorded, persistence across reload, both themes.
- **F017 `passing`** (commit `053b023`): a single Fastify `app.setErrorHandler` (`packages/server`)
  normalizes every route's uncaught-error response into `{ error: <real message> }`, fixing the
  actual bug found while testing F012 (Fastify's default handler put the real detail in `message`,
  not `error`, and the frontend read the wrong field). New shared `fetchJson`
  (`apps/web/src/api/fetch-json.ts`) replacing every `api/*.ts` fetcher's own bespoke error logic,
  distinguishing a network-unreachable failure from a real server error. New shared `ErrorState`
  component (`packages/ui`) - centered, same footprint as the loaded view, Retry action - replacing
  inconsistent inline error text in `QueryRunner`, `RowsTable`, `SchemaGrid`, `FilesBrowser`
  (tree-load and per-file content-load), and `ConsoleLog`. `pnpm check` (full monorepo) and
  `pnpm test:e2e`/`test:e2e:full` (both projects) pass. Manually verified live via Preview:
  reproduced the exact original bug report (`SELECT * FROM orders_items`) and confirmed it now shows
  the real Postgres message centered with a working Retry, in both themes.
- **F013 `passing`** (commit `d315870`): `QueryRunner` (`packages/ui`) migrated from a plain
  `<textarea>` + hand-rolled gutter to CodeMirror 6 (`@codemirror/lang-sql`,
  `@codemirror/autocomplete`, `codemirror`'s `basicSetup`), reskinned to the design system's tokens
  in both themes. New `packages/ui/src/sql-completion.ts` (unit-tested): schema-aware completion -
  read-only-relevant SQL keywords everywhere, real table names after `FROM`/`JOIN` sourced from a new
  `tableNames` prop `apps/web` derives from the already-fetched schema overview (no new backend
  endpoint, no fetching inside `packages/ui`). Column-name completion is explicitly out of scope.
  Preserves the `sql`/`onSqlChange`/`onRun` prop contract and `data-testid="query-runner"` exactly.
  Found and fixed a real bug live: CodeMirror's own `defaultKeymap` binds `Mod-Enter` to
  `insertBlankLine`, silently intercepting the Ctrl/Cmd+Enter-to-run binding (confirmed via a real
  Playwright run - it was inserting a blank line instead of running) - fixed with `Prec.highest`.
  Updated `e2e/query-history.spec.ts` for CodeMirror's contenteditable `.cm-content`; new
  `e2e/sql-editor-autocomplete.spec.ts` covers keyword completion, table-name completion, and the
  Ctrl/Cmd+Enter run path on both engine projects. `pnpm --filter @humbdb/ui test`/build/typecheck,
  `pnpm --filter @humbdb/web` build/typecheck, `pnpm test:e2e:full` (both projects, run twice) and
  `pnpm test:e2e` all pass; `pnpm check` (full monorepo) passes. Manually verified live via Preview:
  syntax highlighting and editor chrome correct in both themes, a real query runs and returns
  results.
- **F018 `passing`** (commit `a316bd3`): the read-only query runner tolerates double-quoted string
  values against Postgres (e.g. `WHERE department="Support"`) - found live by the user right after
  F013 shipped. Not a Humb bug (SQL reserves `""` for identifiers, `''` for strings), but Postgres
  is stricter about it than MySQL (treats `"..."` as a string by default) or SQLite (falls back to
  a string when the token isn't a real identifier). New `coerceUnknownQuotedIdentifiers`
  (`packages/drivers/postgres`) rewrites a double-quoted token to a single-quoted string literal
  only when it matches no real column/table name in the connected database (fetched via
  `information_schema`, skipped entirely when the query has no double quotes) - a token that does
  match a real identifier is left untouched, so no currently-working query changes meaning.
  Postgres-only; tracked separately from plan 0004's six slices since it isn't one of them - see
  `docs/product-specs/sql-editor.md`'s new "Double-quoted string values" section. `pnpm --filter
@humbdb/postgres test` (20/20, new unit + integration tests reproducing the exact reported query)
  and `pnpm check` both pass; `pnpm test:e2e:full` - no regression. Manually verified live via
  Preview: the exact reported query now returns rows, and a real double-quoted column reference
  still resolves as an identifier.
- **F014 `passing`** (commit `9ccde55`): MySQL as Humb's third engine. New `@humbdb/mysql`
  (`mysql2/promise`) mirrors `@humbdb/postgres`'s shape - backtick identifier quoting, exact
  `COUNT(*)` row counts, a `START TRANSACTION READ ONLY` backstop proven live by opening it directly
  (bypassing the adapter and `assertReadOnly`) and confirming MySQL itself refuses a write, and a
  `pool.on("error", ...)` listener (F007 precedent) attached to the promise pool's underlying
  callback pool. `packages/core` gained `mysql://` detection; `packages/cli` wired
  `mysqlAdapterFactory` in. New `"mysql"` Playwright project/e2e fixture
  (`setupMysqlFixture`/`requireTestMysqlUrl` in `@humbdb/testing`, a MySQL named-lock mirroring
  `setupFixture`'s Postgres advisory-lock precedent). Found and fixed two real bugs while wiring
  this up: (1) every e2e `webServer` instance was silently inheriting every test-DB env var at once
  (Playwright's config process sets them all and spawns every instance from that same process), so
  the old "whichever var is truthy" engine selection in `e2e/server.ts` was routing the new `"mysql"`
  project to SQLite instead - fixed with an explicit `HUMB_E2E_ENGINE` env var per `webServer`
  entry, confirmed via direct per-port health-endpoint checks; (2) a real, reproduced concurrency
  race in `setupSqliteFixture` (DROP+CREATE not race-safe across concurrent Playwright workers, once
  a third engine project pushed total parallelism higher) - fixed the same way F012 fixed the
  analogous Postgres race (the whole sequence now runs in one transaction with a `busy_timeout`),
  confirmed via 4 repeated full-parallelism `pnpm test:e2e:full` runs with zero flakes afterward.
  Also needed a `tsconfig.base.json` `"@humbdb/mysql"` `paths` entry (tsx/tsc resolve every other
  workspace package straight to its source file this way, not through `node_modules` - a brand-new
  package silently fails to resolve without one - found by empirically tracing why `@humbdb/mysql`
  alone failed to import from `e2e/server.ts` when every other driver package worked) and
  `turbo.json`'s `"test"` task env allowlist extended to `HUMB_TEST_MYSQL_URL`. `pnpm --filter
@humbdb/mysql test` (13/13, unit + integration against a real MySQL 8 container) and `pnpm check`
  both pass; `pnpm test:e2e:full` (all three engine projects, run 4x) and `pnpm test:e2e` pass with
  zero flakes. Manually verified live via Preview against a real MySQL container with an
  FK-constrained fixture: Schema tab PK/FK badges, Tables tab pagination, and a SQL Editor query
  using a double-quoted string value (MySQL's own default dialect behavior - confirmed distinct from
  F018's Postgres-only fix, no adapter-side coercion needed here).
- **F016 `passing`** (commit `16dfd4b`; redesign `57fd354`, first pass `070f995`): structured
  (object/array) cell values. `CellValue` (`packages/ui/src/components/cell-value.tsx`) replaces
  `formatCell`'s flat `JSON.stringify`-to-text handling in `RowsTable`/`QueryRunner` with a
  compact single-line chip (`{ N keys }` / `[ N items ]` plus a dimmed truncated JSON preview for
  scanability) that never grows the row; clicking it opens `CellValueDrawer` (right-anchored,
  `QueryHistoryDrawer`'s pattern) with an expandable tree - root expanded, deeper levels built
  lazily on click - syntax-colored primitives, the source column name, a copy-as-JSON button with
  a check-flash confirmation, and Esc/backdrop/X to close. Engine-agnostic and already live for Postgres/MySQL `jsonb`/`json` columns,
  not Mongo-specific - a prerequisite for F015. The first pass (`070f995`) expanded the tree inline
  inside the cell; the user flagged that it blew up row heights and broke the table layout, so it
  was redesigned to the chip + drawer split the same day (the spec's original out-of-scope note
  anticipated exactly this) - spec Behavior/Acceptance revised to match. Bugs found and fixed
  along the way: (1) a second e2e fixture table made the Schema tab render two `table-detail`
  cards, breaking `connect-and-inspect.spec.ts`'s singular-card assertion under concurrent `@full`
  specs - fixed by adding the jsonb column (`profile`, populated for one row only) to the existing
  shared `humb_demo_users` fixture table instead; (2) a primitive value nested inside an expanded
  structured value rendered as a bare text node with no element boundary of its own - fixed by
  wrapping the primitive branch in its own `<span>`. Verified:
  `pnpm --filter @humbdb/ui test/build/typecheck`, `pnpm --filter @humbdb/web build`, `pnpm check`,
  and `pnpm test:e2e:full` (`e2e/structured-cell-values.spec.ts` walks chip -> drawer -> three
  nested levels -> close, Postgres-only via `test.skip`, all pass) - plus a manual live Preview
  pass (chip row height 29.75px vs 27.25px plain rows; drawer expanded to the primitive array
  items in both the Tables tab and a SQL Editor result).
- **F019 `passing`** (commit `f850c43`): cross-engine column type fidelity. Prompted by the user
  asking to systematically test every column type across Postgres/MySQL/SQLite while F016 was
  fresh - seeded a wide-type fixture table (`type_zoo`) against live containers and inspected the
  actual JSON each engine's rows endpoint returned, rather than assuming driver defaults were safe.
  Found and fixed three real defect categories (see
  `docs/product-specs/column-type-fidelity.md` for full detail): (1) Postgres/MySQL
  `date`/`timestamp without time zone` columns silently shifted by the server's local UTC offset
  (confirmed live on a UTC+2 host: a stored `2024-01-15` came back as `"2024-01-14T22:00:00.000Z"`
  - the wrong calendar date) - fixed with `pg`'s `types.setTypeParser` for OIDs 1082/1114 and
    mysql2's `dateStrings: true`; (2) MySQL/SQLite `BIGINT`/`INTEGER` values silently lost precision
    past `Number.MAX_SAFE_INTEGER` (confirmed live: a stored `9007199254740993` came back as
    `9007199254740992`) - fixed with a magnitude-aware mysql2 `typeCast` and per-statement
    `stmt.safeIntegers(true)` + a `normalizeRow` mapping in `@humbdb/sqlite`; (3) `bytea`/`blob`/`BLOB`
    columns rendered as a confusing `{ type: "Buffer", data: [...] }` JSON chip - fixed with a new
    `BinaryValue` chip (`binary · N bytes` + hex preview) and a `CellValueDrawer` hex-dump view (UTF-8
    decode attempt + offset/hex/ASCII dump, capped at 1024 bytes). Caught two second-order
    regressions before shipping, not just the primary bugs: MySQL's built-in `bigNumberStrings`
    stringifies by column type not value magnitude, breaking `ping()`'s `=== 1` check and
    `getTable()`'s `rowCount` (both backed by a `LONGLONG` `COUNT(*)`) - caught by
    `@humbdb/mysql`'s own integration tests failing; SQLite's `defaultSafeIntegers` is database-wide
    and would have flipped every internal pragma/`COUNT(*)` query to `BigInt` too, breaking
    `notnull`/`unique` comparisons the same way - caught by tracing the API's scope before
    committing, confirmed via `@humbdb/sqlite`'s existing integration tests still passing with the
    per-statement version instead. Verified: `pnpm --filter @humbdb/postgres test` (20/20),
    `pnpm --filter @humbdb/mysql test` (13/13), `pnpm --filter @humbdb/sqlite test` (14/14),
    `pnpm --filter @humbdb/ui test` (18/18), `pnpm check` (real Postgres+MySQL), and
    `pnpm test:e2e:full` all pass - zero regression to F016's jsonb chip/drawer flow. Manually
    verified live via Preview: a `bytea` cell containing "hello world" decoded correctly in both the
    compact chip and its hex-dump drawer.
- **F015 `passing`** (commit `44a4f15`): MongoDB as Humb's fourth engine, basic read-only browsing
  only - see `docs/product-specs/connect-and-inspect-mongodb.md` for the full contract and why it's
  narrower than the SQL engines'. New `@humbdb/mongodb` on the official `mongodb` driver: databases
  map to schemas, collections to tables, documents to rows; `getTable()` samples 100 documents
  (`$sample`) for a best-effort observed-fields list (`_id` flagged as the primary key, no indexes
  for v1); `getRows()` unions fields per-page rather than reusing that sample, since documents in
  the same collection can differ. `runReadOnlyQuery` always throws (no SQL dialect for a read-only
  backstop to run inside) and the adapter's own code never calls a Mongo write API - verified by a
  source-scan unit test, not just code review; the SQL Editor tab is disabled client-side when
  connected to Mongo (`TabBar` gained `disabledTabs` support), confirmed live even as the default
  initial tab. Applied F019's column-type-fidelity rigor proactively here rather than discovering
  it live later: confirmed against a real container before writing any fix that BSON `Long`/
  `Decimal128` serialize to useless shapes by default (`{high,low,unsigned}` and
  `{"$numberDecimal":...}`) - normalized to a plain number (when safe) or exact string, matching
  F019's bigint convention; BSON `Binary` normalized to the same `{ type: "Buffer", data: [...] }`
  shape Node's own `Buffer` produces, reusing F019's existing binary-value chip/hex-dump viewer
  instead of a second representation; `ObjectId`/`Date` already serialize cleanly and were left
  untouched. Verified: `pnpm --filter @humbdb/core test` (22/22), `pnpm --filter @humbdb/mongodb
test` (14/14: factory unit tests, the write-API source scan, and integration tests against a real
  MongoDB container), `pnpm --filter @humbdb/humb test` (13/13), `pnpm --filter @humbdb/ui`/`@humbdb/web`
  build/typecheck, and `pnpm check` (live Postgres+MySQL+MongoDB) all pass; `pnpm test:e2e:full`
  re-run against a fresh container confirms zero regression to the other three engines from
  `e2e/server.ts`'s new `"mongodb"` branch (no Playwright project exercises Mongo itself in this
  pass - decided when picked up: package-level tests plus a manual live pass matched the spec's own
  suggested bar, given there's no query runner to exercise). Also added a MongoDB service to CI's
  `check` job (`.github/workflows/ci.yml`) and a `.local/preview-server-mongo.mjs` script (backed by
  a new `e2e/server.ts` `"mongodb"` branch) for manual verification. This was this plan's sixth and
  final slice - `docs/exec-plans/active/0004-editor-ux-and-new-engines.md` moved to `completed/`.

## In progress

- Also outstanding from this session (unrelated to F011/F012/F017): publishing the bare `humb` npm
  package (`packages/humb`) alongside `@humbdb/humb` failed with a 403 - npm's name-similarity
  policy flagged it as too close to existing packages (`humps`/`htm`/`dumi`/`pump`/`umi`). A dispute
  was filed with npm support; once cleared, retry with `node scripts/publish.mjs --only humb`. All
  `@humbdb/*` packages published fine at `0.0.3` in the meantime - `npx @humbdb/humb@latest`
  already works. A later retry also hit a 401/404 from an expired local npm auth token (unrelated to
  the dispute) - fixed by `npm login`; keep the two failure modes distinct when retrying.
  `scripts/publish.mjs`'s `run()` helper now reports a failed command with one clean line instead of
  a raw Node stack trace ([PR #38](https://github.com/ensp1re/humb/pull/38), merged).

## Known issues / blockers

- The bare `humb` npm package is blocked pending npm's name-dispute review (see "In progress"
  above) - no code changes needed once it clears, just the retry command.
- An animated demo (GIF or asciicast) for the README remains a legitimate follow-up - F009 shipped
  with static screenshots instead (see that entry's evidence for why).
- The local Postgres fixture container (`humb-rename-pg`, port 5433) does not persist across a
  Docker Desktop restart - if `pnpm test:e2e:full`/manual Preview testing gets `ECONNREFUSED`,
  recreate it: `docker run --rm -d --name humb-rename-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16-alpine`,
  then reseed (`pnpm exec tsx .local/seed-dev-data.ts postgres://postgres:postgres@localhost:5433/postgres`
  for the large dev dataset; `setupFixture` from `@humbdb/testing` for the small e2e fixture table).
  Note it has accumulated the full dev-seed dataset (11 tables) across sessions, not just the
  fixture table - a Schema-tab assertion that expects exactly one `table-detail` card will fail
  against it (harmless environmental noise, not a regression; verified F014 against a throwaway
  clean container instead - see that entry's evidence).
- The local MySQL fixture container (`humb-mysql`, port 3307, `MYSQL_ROOT_PASSWORD=root` /
  `MYSQL_DATABASE=humb_test`) likewise does not persist across a Docker Desktop restart - recreate
  it with `docker run --rm -d --name humb-mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=humb_test -p 3307:3306 mysql:8`
  (takes longer than Postgres to become ready on first boot); `setupMysqlFixture` from
  `@humbdb/testing` creates the e2e fixture table.

- Split the two-pass project review (`SUGGESTIONS.md`, `SUGGESTIONS_2.md` - the two-pass review
  merged in [PR #45](https://github.com/ensp1re/humb/pull/45)) into tracked work, per each file's own
  closing reminder, then deleted both review docs. Critical/High/Medium defect findings from both
  passes became 14 new `not_started` `docs/FEATURES.json` entries, **F020-F033** (query-runner SQL
  corruption, read-only false-positive rejection, rows-route 500, Files-tab symlink escape,
  connection-string redaction gap, DNS-rebinding host check, Mongo pagination stability, Schema-tab
  fan-out, pool-error logging, health-poll dormancy, missing error boundary, schema-tree keyboard
  a11y, missing statement timeouts, stale-cache freshness policy). The Low-priority findings from
  both passes plus every Part B (non-defect, improvement/design) suggestion became 35 new rows in
  `docs/exec-plans/tech-debt-tracker.md`. No product code changed this session
  ([PR #46](https://github.com/ensp1re/humb/pull/46)).
- **F020 `passing`** (commit `3342268`): the Postgres query runner's `coerceUnknownQuotedIdentifiers`
  regex-replaced every `"..."` token in the raw SQL text, so it also rewrote quotes inside `'...'`
  string literals and `$$...$$` dollar-quoted blocks, and had no notion of schema names or
  query-local aliases/CTE names - all three silently corrupted valid queries (confirmed live against
  a real Postgres container before fixing anything, reproducing all three cases from the review).
  Replaced the regex with a single-pass tokenizer that treats string literals and dollar-quoted
  blocks as opaque spans; added schema names to the known-identifiers set
  (`information_schema.schemata`); added a best-effort regex heuristic (`collectLocalIdentifiers`)
  recognizing `AS alias`/`AS "alias"` and `name AS (...)` shapes so query-local aliases/CTE names
  aren't miscoerced. `docs/product-specs/sql-editor.md`'s "Double-quoted string values" section
  updated with the new behavior and acceptance criteria. `pnpm --filter @humbdb/postgres test`
  (31/31: 15 unit tests including new cases for string-literal/dollar-quote/schema/alias/CTE
  corruption, plus 3 new live integration tests reproducing each originally-reported case against a
  real Postgres container) and `format:check`/`lint`/`typecheck` all pass.
- **F021 `passing`** (commit `e1a78ad`): `assertReadOnly`'s multiple-statement guard checked for `;`
  against raw SQL (only comments stripped), so filtering by any value containing a semicolon (a URL,
  an encoded blob, free text) was wrongly rejected as "multiple statements". Now runs the same `;`
  check against the same `stripLiterals`-masked text the forbidden-keyword scan already uses, so a
  `;` inside a string literal or quoted identifier is no longer mistaken for a second statement,
  while a real second statement is still rejected and a single trailing `;` is still tolerated.
  `docs/product-specs/sql-editor.md` gained a new "Multi-statement / semicolon detection" section.
  `pnpm --filter @humbdb/driver-contract test` (25/25, 4 new/updated cases) and `pnpm --filter
@humbdb/postgres test` (32/32, including a new live integration test against a real Postgres
  container) both pass; `format:check`/`lint`/`typecheck` all pass. Note: `@humbdb/postgres` depends
  on `@humbdb/driver-contract`'s built `dist` at runtime (tracked tech debt,
  `docs/exec-plans/tech-debt-tracker.md`) - rebuild `@humbdb/driver-contract` before re-running the
  Postgres suite after touching `read-only.ts`, or the old behavior will silently still be in effect.
- **F022 `passing`** (commit `de28ebd`): `GET /api/tables/:schema/:table/rows` called
  `rowsQuerySchema.parse()`, which throws a `ZodError` straight into the global error handler on
  invalid input (e.g. `?page=abc`). Since `ZodError` carries no `statusCode`, the handler's 500
  default applied, with a raw stringified array of Zod issues as the message - a client-input
  problem reported as a server fault with an unreadable body. Switched to
  `rowsQuerySchema.safeParse`, matching `/api/query`'s existing pattern: a clean 400 with a readable
  message. `docs/product-specs/error-handling.md` updated - corrected its stale claim that the rows
  route didn't have this class of bug, and added an acceptance criterion for it. `pnpm --filter
@humbdb/server test` (34/34, including a new test asserting 400 for `?page=abc`) and
  `format:check`/`lint`/`typecheck` all pass.

## Next steps

**F023-F033 are `not_started` and unprioritized among themselves** - pick one (the remaining
security items - F023/F024/F025 - are good next picks) or ask the user which to tackle first; at
most one may be `active` at a time. Every other feature in `docs/FEATURES.json` is `passing`
(F001-F022, DF-01-DF-09). Before starting new work: re-read this file's "Known issues / blockers"
(the bare `humb` npm package dispute is the one open item), or ask the user what they'd like next.
If picking a new feature area instead, write its product spec under `docs/product-specs/` and add a
`docs/FEATURES.json` entry before writing code (this repo's working contract - see `AGENTS.md`), and
consider whether it warrants its own `docs/exec-plans/active/NNNN-*.md` plan doc if it's more than
one slice.
