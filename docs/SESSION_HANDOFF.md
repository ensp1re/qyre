# SESSION_HANDOFF.md

The structured handoff between sessions. Update this before ending any session. A fresh agent should
be able to resume from this file plus `docs/FEATURES.json` in a few minutes.

Validated by `scripts/check-handoff.mjs` (all sections must be present).

## Current state

- Date: 2026-07-03
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

## In progress

- Also outstanding from this session (unrelated to F011): publishing the bare `humb` npm package
  (`packages/humb`) alongside `@humbdb/humb` failed with a 403 - npm's name-similarity policy
  flagged it as too close to existing packages (`humps`/`htm`/`dumi`/`pump`/`umi`). A dispute was
  filed with npm support; once cleared, retry with `node scripts/publish.mjs --only humb`. All
  `@humbdb/*` packages published fine at `0.0.3` in the meantime - `npx @humbdb/humb@latest`
  already works.

## Known issues / blockers

- The bare `humb` npm package is blocked pending npm's name-dispute review (see "In progress"
  above) - no code changes needed once it clears, just the retry command.
- An animated demo (GIF or asciicast) for the README remains a legitimate follow-up - F009 shipped
  with static screenshots instead (see that entry's evidence for why).

## Next steps

1. Pick up F013 (SQL Editor autocomplete + CodeMirror 6 migration) next - see
   `docs/exec-plans/active/0004-editor-ux-and-new-engines.md` for the full plan. Queued after it, in
   order: F014 (MySQL engine), F016 (structured-cell viewer), F015 (MongoDB engine, basic browse
   only - depends on F016). All were scoped with the user in this session before being added to
   `docs/FEATURES.json` - see that plan's specs (`docs/product-specs/sql-editor.md`,
   `connect-and-inspect-mysql.md`, `structured-cell-values.md`, `connect-and-inspect-mongodb.md`)
   for the decisions already made (editor migration, autocomplete depth, history scope, Mongo scope).
