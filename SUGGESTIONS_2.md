# Humb — Project Review & Suggestions (Round 2)

A second, independent review pass on branch `review/suggestions-2`. This document **complements**
`SUGGESTIONS.md` (treated as read-only) and deliberately avoids repeating its findings — no overlap
with H1/H2 (query-runner string handling), H3 (rows-route 500), M1 (symlink escape), M2 (redaction),
M3 (DNS rebinding), M4 (Mongo sort), M5 (`useAllTables` fan-out), M6 (pool-error logging), or its
Low items (stale copy, CSV injection, BSON `Timestamp`, `.env.example`, drawer focus traps, etc.).

This pass focuses on the **front-end runtime, data-freshness/lifecycle, adapter resilience, and
accessibility** — areas the first pass touched only lightly. Findings verified against running code
are marked as such. Priorities use the same local-first, localhost-bound, read-only threat model.

---

## Critical

_None found._ Consistent with the first review: no network-exposed auth surface, no RCE, no
third-party data exfiltration, clean dependency audit.

---

## High

### H1 — Connection status never auto-refreshes; the entire connection-transition system is dormant — reliability / UX

**Category:** Reliability / Observability
**Where:** `apps/web/src/hooks/use-health.ts`, `apps/web/src/App.tsx` (`refresh`),
`packages/server/src/index.ts` (`/api/health` transition logging)

`useHealth` has **no `refetchInterval`** — verified: the only polling hook in the app is
`use-console.ts` (3s). Health is fetched once on mount and thereafter only when the user manually
clicks Refresh. Two consequences:

1. **The UI's connection indicator goes stale.** If the database goes down (or comes back) while
   Humb is open, the status dot, title bar, and status bar keep showing the last-known state until
   the user manually refreshes. For a tool whose main job is "show me the state of this database
   right now," a silently-wrong connection light is a real trust problem.
2. **The server's transition logging is effectively dead code.** `/api/health` logs "Database
   connection restored." / "Database connection lost." _only when it is polled_ (it compares
   against `lastKnownStatus`). Since nothing polls it, those Console-tab events almost never fire.
   The careful transition-detection logic in the server never gets exercised in normal use.

**Why it matters:** This undercuts two advertised features at once — the live connection indicator
and the Console tab's connection event log — and does so invisibly (everything looks fine until a
disconnect happens and isn't reflected).

**Fix:** Add a modest `refetchInterval` (e.g. 5–10s) to `useHealth`, matching the console poll's
cadence. Consider pausing polling when the tab is hidden (`refetchIntervalInBackground: false`,
which is the default) to avoid needless load. Optionally have the health poll and console poll share
a cadence so transitions and their log entries stay in step.

**Impact:** The connection light becomes trustworthy, and the connection-event log actually works —
turning two half-wired features into working ones with a one-line change.

---

## Medium

### M1 — No React error boundary; any render error white-screens the whole app — reliability / DX

**Category:** Reliability (front-end robustness)
**Where:** `apps/web/src/main.tsx` (renders `<App>` under `QueryClientProvider`, no boundary);
verified `grep` finds no `ErrorBoundary` / `componentDidCatch` / `getDerivedStateFromError`
anywhere.

A single unhandled exception during render — a malformed cell value, an unexpected shape from a
future engine, a bug in a component — takes down the entire UI to a blank page with nothing but a
console stack. Given the app renders arbitrary database contents (arbitrary JSON, binary blobs,
deeply nested BSON), the cell-rendering path is exactly where an unanticipated value could throw.

**Why it matters:** The failure mode is maximally bad (whole-app blank screen) for what should be a
localized, recoverable problem (one cell, one table). It also makes such bugs hard to diagnose from
a user report ("it just went white").

**Fix:** Add a top-level error boundary in `main.tsx` (and ideally a narrower one around the
table/query result area) that renders a recoverable fallback with the error message and a "reload"
affordance, reusing the existing `ErrorState` component. Log the error to the console for
diagnosis.

**Impact:** A rendering bug degrades to a single visible error panel instead of a dead page; users
can recover without restarting the CLI.

### M2 — Schema tree is not keyboard-accessible — accessibility

**Category:** Accessibility
**Where:** `packages/ui/src/components/schema-tree.tsx` `TreeRow`

Tree rows are `<div>`s. Table rows get `role="button"` + `aria-pressed` but **no `tabIndex` and no
`onKeyDown`**, so they are neither focusable nor operable by keyboard — a keyboard user cannot
select a table or expand/collapse a schema. There is also no tree semantics (`role="tree"` /
`role="treeitem"` / `aria-expanded`), so assistive tech announces a flat pile of buttons rather than
a navigable hierarchy.

**Why it matters:** The schema tree is the primary navigation surface of the app. Keyboard-only and
screen-reader users effectively can't navigate the database. This is the highest-traffic
accessibility gap in the UI (the first review only flagged drawer focus traps).

**Fix:** Make each row focusable (`tabIndex`), handle `Enter`/`Space` to activate and
`ArrowRight`/`ArrowLeft` to expand/collapse, and apply proper `role="tree"`/`role="treeitem"` +
`aria-expanded`/`aria-selected`. A headless tree primitive or a small roving-tabindex hook covers
this cleanly.

**Impact:** The core navigation becomes usable by keyboard and screen readers; meaningful WCAG
improvement on the most-used control.

### M3 — Adapters set no statement/query timeout; a slow query hangs the request and ties up a pool connection — reliability / scalability

**Category:** Reliability / Scalability
**Where:** `packages/drivers/postgres/src/index.ts`, `packages/drivers/mysql/src/index.ts`,
`packages/drivers/mongodb/src/index.ts` (verified: no `statement_timeout`, `maxTimeMS`,
`connectTimeout`, or per-query timeout anywhere in the driver packages).

The SQL editor lets a user run any read-only query, and `getRows`/`getTable` run against
user-chosen tables. A heavyweight query (a huge unindexed scan, a cartesian join, a `SELECT *` on a
massive table) will run to completion with no server-side cap. The request hangs, the browser
spinner spins indefinitely, and a pool connection is held the whole time. Enough of these and the
pool is exhausted and the app appears frozen.

**Why it matters:** It's easy to trigger accidentally against a real database, and there's no way to
cancel from the UI. "Just let me look at this table" turning into an unbounded hang is directly
counter to the product promise.

**Fix:** Set a sane default `statement_timeout` (Postgres) / `max_execution_time` (MySQL) /
`maxTimeMS` (Mongo) on the read-only query and row-fetch paths — e.g. 30s, ideally configurable via
a CLI flag or env var. Surface timeouts as a clear, actionable error. Consider a client-side
"cancel" that also helps.

**Impact:** Runaway queries fail fast with a clear message instead of hanging the UI and starving
the connection pool; the tool stays responsive on large/slow databases.

### M4 — Overview/table caches never refresh; schema changes are invisible until manual refresh — reliability / UX

**Category:** Reliability / Data freshness
**Where:** `apps/web/src/main.tsx` (`new QueryClient()` with all defaults),
`use-overview.ts` / `use-table.ts` / `use-rows.ts` (`retry: false`, no `staleTime` / `refetchInterval`)

With React Query defaults and no polling on these hooks, once the schema/overview is fetched it is
served from cache until the user clicks Refresh (or `refetchOnWindowFocus` happens to fire). If a
table is added/dropped or a column changes in the connected database, the tree and schema grid keep
showing the old structure. Combined with H1 (no health polling), the app's picture of the database
can drift silently from reality across the board.

**Why it matters:** A database inspector that shows a stale schema is quietly misleading — the one
thing it must get right is "what's actually there now."

**Fix:** Decide on an explicit freshness policy rather than inheriting defaults: e.g. a global
`staleTime` that makes `refetchOnWindowFocus` meaningful for schema data, and/or a light background
refetch for the overview. At minimum, document that the tree is a snapshot and make the Refresh
affordance more discoverable.

**Impact:** The displayed schema tracks the real database with far less manual intervention, and the
freshness behavior becomes an intentional design choice instead of a framework default.

---

## Low

### L1 — Page size is hard-coded to 25 in the hook, diverging from the server default (50) and clamp (200) — consistency

**Where:** `apps/web/src/hooks/use-rows.ts` (`PAGE_SIZE = 25`) vs.
`packages/core/src/validation/rows.ts` (`default(50)`, `max(200)`) and
`packages/drivers/contract/src/pagination.ts` (`MAX_PAGE_SIZE = 200`). Three different page-size
numbers live in three layers with no shared constant, so it's unclear which is authoritative and a
change in one won't propagate. **Fix:** export a single default from `@humbdb/core` and consume it in
the hook and schema. **Impact:** One source of truth for pagination; no silent divergence.

### L2 — Search requires 2+ characters with no hint; single-char search silently does nothing — UX

**Where:** `packages/ui/src/components/schema-tree.tsx` (`query.trim().length > 1`). Typing one
character filters nothing and shows the full tree, with no indication why. On a database whose
tables are single-letter or very short this is surprising. **Fix:** either support single-character
search or show a subtle "keep typing…" hint below the input. **Impact:** Removes a small "is search
broken?" moment.

### L3 — Per-package `README.md` / root `Status` sections risk drift as engines are added — documentation

**Where:** Root `README.md` "Status" section and the various `packages/*/README.md`. The project has
strong central docs (`FEATURES.json`, `ARCHITECTURE.md`) plus `scripts/check-readme.mjs`, but prose
status blurbs (e.g. engine lists) still need manual updates each time an engine lands and are easy to
miss (the first review already caught one stale "Postgres or SQLite" string in the app). **Fix:**
generate engine lists from a single source (the adapter factory registry) where they appear in
docs/UI, or extend `check-readme.mjs`/`check-state` to assert the engine list matches the registered
factories. **Impact:** Docs and UI copy stay in lockstep with actual engine support mechanically.

### L4 — Status is conveyed by color alone in some spots — accessibility

**Where:** `packages/ui/src/components/schema-tree.tsx` `STATUS_DOT_COLOR` (green/red/grey dot). If
the adjacent text label isn't always present (e.g. collapsed sidebar rail), connection state is
distinguishable only by hue — a problem for color-blind users. **Fix:** pair the dot with a
shape/text/`aria-label` difference (e.g. a title/`aria-label` of "connected"/"disconnected"), not
just color. **Impact:** Connection state is perceivable without relying on color discrimination.

### L5 — `retry: false` everywhere means transient blips surface as immediate errors — reliability (minor)

**Where:** most hooks (`use-health`, `use-overview`, `use-table`, `use-rows`, `use-files`,
`use-console`) set `retry: false`. This is a reasonable default (fail fast, show a Retry button), but
for a tool talking to a possibly-flaky database connection, a single dropped request paints an error
state the user must manually dismiss. **Fix:** consider one quick retry (`retry: 1`) for the
read-only GETs where a transient reconnect is plausible, while keeping mutations at 0. **Impact:**
Fewer spurious error panels on momentary hiccups, without masking real failures.

---

## Cross-cutting observations (not defects)

- **Front-end architecture is clean:** the CodeMirror lifecycle in `query-runner.tsx` (mount-once +
  ref-synced props to preserve undo/selection) and the `use-rows` placeholder-data logic (keep prior
  page within the same table, drop it across a table switch) are both thoughtfully done.
- **The chip + drawer split for structured/binary cells** (`cell-value.tsx`) is a good call and well
  documented; the main gap around it is the missing error boundary (M1) for genuinely unexpected
  shapes.
- **Testing:** unit and integration coverage is solid at the package level, but there is no
  component/interaction test asserting keyboard operability of the tree (M2) or that the connection
  light updates on a status change (H1) — both would lock in the fixes above and are natural E2E or
  React Testing Library additions.

---

---

# Part B — Improvement & Design Suggestions (non-defect)

Everything above (and all of `SUGGESTIONS.md`) is defect-oriented. This part is the opposite: these
are **not bugs** — the code works — they are opportunities to raise quality, reduce future cost, and
grow the product. Organized by the requested dimensions. Severity here means _leverage / value of
doing it_, not risk of leaving it.

## Architecture

### B-A1 — Extract a shared SQL-adapter base for the `information_schema` engines — High

**What:** Postgres and MySQL adapters duplicate the same three shapes almost verbatim: `getOverview`
(query `information_schema.tables`, group into a `Map` by schema), `getTable` (columns +
`key_column_usage` for PK/FK), and — verified — `runReadOnlyQuery`'s entire transaction ceremony
(`getConnection` → `BEGIN/START TRANSACTION READ ONLY` → query → `COMMIT` → `catch` ROLLBACK →
`finally` release), which differs only in the keyword string. The pool `on("error")` handler and the
`export { assertReadOnly, ReadOnlyViolationError }` line are also copy-pasted per engine.

**Why it matters:** Every new SQL engine re-implements this boilerplate, and every fix (e.g. the
statement-timeout in Part A M3, or a change to read-only semantics) must be applied N times and can
drift. The Postgres/MySQL introspection is genuinely shared logic wearing two copies.

**Recommendation:** Introduce a `SqlAdapterBase` (or a set of shared helpers in
`@humbdb/driver-contract`) providing: a `runInReadOnlyTransaction(conn, beginSql, run)` helper, an
`information_schema`-based `getOverview`/`getTable` with small per-engine hooks (identifier quoting,
system-schema list, column-name casing). Keep genuinely engine-specific SQL (index catalogs, row-count
estimation) in each package, exactly as ARCHITECTURE.md already advises. SQLite/Mongo stay separate.

**Impact:** A new SQL engine becomes ~50–100 fewer lines and inherits fixes automatically; drift
between engines is structurally prevented.

### B-A2 — Model engine _capabilities_ explicitly instead of `engine === "mongodb"` string checks — High

**What:** The `DatabaseAdapter` contract assumes a relational world (`schema`, `table`, `indexes`,
`isPrimaryKey`/`isForeignKey`, `runReadOnlyQuery`). MongoDB is forced to fake some of it (`dataType:
"any"`, `nullable: true`, empty `indexes`) and to `throw` from `runReadOnlyQuery`, while the UI gates
the SQL editor off with a hard-coded `overview.data?.engine === "mongodb"` check in `App.tsx`.

**Why it matters:** The next non-relational or partially-relational engine (Redis, DynamoDB,
ClickHouse, a REST source) will multiply those `engine === "..."` special-cases across the UI and
server, which is exactly the "branch on engine type" the architecture explicitly forbids for the
data layer — it's just leaked into the presentation layer instead.

**Recommendation:** Add a `capabilities` descriptor to the adapter/overview (e.g.
`{ sqlQueryRunner: boolean, indexes: boolean, foreignKeys: boolean }`), and have the UI enable/disable
features off declared capabilities rather than engine names. Optionally split the contract into a
core `Introspectable` plus optional `SqlQueryCapable` interface so an engine that can't run SQL simply
doesn't implement it (no throwing stub).

**Impact:** Adding an engine with a different feature set becomes additive and declarative; the UI
stops accumulating per-engine conditionals.

### B-A3 — Centralize the adapter/factory registry — Medium

**What:** The factory list `[postgresAdapterFactory, sqliteAdapterFactory, mysqlAdapterFactory,
mongodbAdapterFactory]` is assembled inline in the CLI. The publish script keeps a separate hand-maintained
`PUBLISH_ORDER`, and detection protocols live in `@humbdb/core`'s `connection-target.ts`. Three places
must be updated in lockstep when an engine lands.

**Why it matters:** Adding an engine touches several unrelated files with no single source of truth;
easy to wire the driver but forget detection or publish order.

**Recommendation:** A single registry module (engine id → factory + URL protocols + capability
metadata) that the CLI, server, detection, and release script all consume. A test asserts the registry,
`PUBLISH_ORDER`, and `parseConnectionTarget` protocols agree.

**Impact:** "Add an engine" becomes one edit plus its driver package; consistency is mechanically enforced.

## Code quality & maintainability

### B-Q1 — `App.tsx` is a 290-line component with deeply nested tab-routing ternaries — Medium

**What:** The tab body is one large chained ternary (`status !== "connected" ? ... : tab === "sql-editor" ? ... : tab === "tables" ? ...`) mixing routing, loading/error/empty states, and data wiring in a single JSX tree.

**Why it matters:** It's hard to read, hard to test in isolation, and every new tab or state deepens the nesting. This is the app's top-level orchestrator and the most-edited file.

**Recommendation:** Extract one component per tab (`<TablesTab>`, `<SqlEditorTab>`, `<SchemaTab>`,
`<FilesTab>`, `<ConsoleTab>`) and a small `<TabRouter>`; keep `App` as composition + shared state. A
reusable `<AsyncBoundary loading error empty>` wrapper collapses the repeated
loading/error/empty scaffolding each tab hand-rolls.

**Impact:** Each tab becomes independently testable and readable; adding a tab is additive.

### B-Q2 — Centralize scattered tuning constants — Low

**What:** Magic numbers live in several packages: `PAGE_SIZE = 25` (hook), `default(50)`/`max(200)`
(rows schema), `MAX_PAGE_SIZE = 200` (pagination), `MAX_EVENTS = 200` (event log), `FIELD_SAMPLE_SIZE
= 100` (mongo), history `MAX_ENTRIES = 50`.

**Why it matters:** Related limits are defined independently (see Part A L1's three-way page-size
divergence) and can't be reasoned about or tuned in one place.

**Recommendation:** A small shared `constants`/`config` surface in `@humbdb/core` for the values that
cross layers (page sizes especially); leave truly local ones in place but name them.

**Impact:** One place to reason about limits; no silent divergence.

## Reliability

### B-R1 — Richer health signal (latency, last error) — Medium

**What:** `/api/health` reports `connected | disconnected | unconfigured` plus version. It discards
_why_ a ping failed and how slow it was.

**Why it matters:** For a diagnostics endpoint, "disconnected" with no reason or latency is the least
actionable answer; a slow-but-up database looks identical to a healthy one.

**Recommendation:** Include ping latency and the last connection error message (redacted) in the health
payload and surface them in the status bar / Console tab.

**Impact:** Users can distinguish "down," "slow," and "auth failed" at a glance.

### B-R2 — Harden CLI shutdown — Low

**What:** The `SIGINT`/`SIGTERM` handler calls `server.close()` then `adapter.disconnect()` then
`process.exit(0)` with no timeout or error handling; a hung close blocks shutdown forever, and a
second Ctrl-C isn't handled.

**Recommendation:** Add a shutdown timeout that force-exits, guard against re-entrancy, and exit
non-zero if teardown throws.

**Impact:** Ctrl-C always works, even when the database connection is wedged.

## Scalability & performance

### B-S1 — SQL-editor results are unbounded — High

**What:** Verified: `runReadOnlyQuery` appends no `LIMIT`. `SELECT * FROM huge_table` fetches every
row into the server, serializes it all to JSON, ships it to the browser, and renders every row into
the DOM (the result table has no virtualization). This can OOM the server, freeze the tab, or both.

**Why it matters:** It's a one-line query away and directly contradicts "just let me look at this
right now." It also compounds Part A M3 (no timeout).

**Recommendation:** Auto-apply a result cap (e.g. wrap/append `LIMIT n+1`, detect the overflow, and
show "showing first N rows — refine your query"), make `n` configurable, and add row virtualization
(`@tanstack/react-virtual`) to the result and row tables.

**Impact:** Large queries stay responsive and safe; the UI handles wide/tall result sets gracefully.

### B-S2 — Virtualize the row/result tables — Medium

**What:** `RowsTable` (≤200 rows) and the query result table render every row as DOM nodes. With wide
tables (many columns) and the max page size, that's already thousands of cells; unbounded query
results (B-S1) make it worse.

**Recommendation:** Introduce row (and ideally column) virtualization so only visible cells mount.

**Impact:** Smooth scrolling on wide/large tables; headroom for larger page sizes later.

### B-S3 — Collapse `getTable`'s per-table query fan-out — Medium

**What:** Postgres `getTable` issues columns + PK + FK + indexes + row-count as separate round-trips
per table. (Distinct from `SUGGESTIONS.md` M5, which is about the _number of tables_ fetched.) On a
per-table basis it's 5 queries where 1–2 would do.

**Recommendation:** Combine the column/PK/FK introspection into a single catalog query per table; keep
index/row-count separate only where necessary.

**Impact:** Faster table detail loads, less DB chatter — multiplied by B-S wins on the Schema tab.

## Developer experience

### B-D1 — Add a `docker-compose.yml` for the local test stack — Medium

**What:** Integration tests need `HUMB_TEST_DATABASE_URL` / `_MYSQL_URL` / `_MONGO_URL`, discoverable
only from CI YAML. There's no committed `.env.example` (Part A / SUGGESTIONS.md) and no one-command
way to bring up Postgres+MySQL+Mongo locally.

**Recommendation:** Commit a `docker-compose.yml` matching the CI service versions plus a `.env.example`,
and a `pnpm test:integration` that points at them. Document in a human `CONTRIBUTING.md`.

**Impact:** A new contributor runs the full suite in minutes instead of reverse-engineering CI.

### B-D2 — Add a human-facing `CONTRIBUTING.md` — Medium

**What:** Onboarding docs (`AGENTS.md` and the `.cursor`/`.claude` skills) are written for coding
agents. A human contributor has no "clone → install → run → test → PR" quickstart.

**Recommendation:** A short `CONTRIBUTING.md` (prereqs, the docker-compose stack, `pnpm check`, branch/PR
conventions, where specs live) that links into the existing agent docs rather than duplicating them.

**Impact:** Lowers the barrier to outside contributions — important for a tool chasing GitHub reach.

### B-D3 — Ship a `--demo` mode with a bundled sample database — Medium

**What:** (Echoed from the repo's own `.local/suggestions.md`.) There's no zero-setup way to try Humb;
every path needs a real database. A `npx humb --demo` that opens a bundled sample SQLite DB removes the
last barrier to a 30-second trial.

**Impact:** Dramatically lowers trial friction — the single highest-leverage adoption lever for a CLI dev tool.

## Testing

### B-T1 — A shared adapter-conformance test suite every engine must pass — High

**What:** Each driver has its own integration test, but there's no _single parametrized contract test_
asserting all adapters behave identically (pagination clamping, empty-collection/table handling,
bigint/date fidelity, read-only rejection, error shapes).

**Why it matters:** Cross-engine consistency is the whole architectural bet; today it's verified
ad hoc per engine, so an engine can silently diverge (exactly the class of bug F019 fixed).

**Recommendation:** A `@humbdb/testing` conformance suite that takes an adapter factory + a seeded
fixture and runs one shared spec against Postgres, MySQL, SQLite, and Mongo.

**Impact:** New engines are held to the same behavioral contract mechanically; regressions surface once, centrally.

### B-T2 — Component tests for `@humbdb/ui` — Medium

**What:** `QUALITY_SCORE.md` records "zero component-level test coverage" for the UI kit; it's only
exercised via E2E. The trickiest logic (cell chip/binary rendering, tree search/highlight, CSV
escaping, sort) has no fast unit coverage.

**Recommendation:** Add React Testing Library tests for `CellValue`, `SchemaTree` (search + keyboard
once Part A M2 lands), `RowsTable` (sort/filter/CSV), and the drawers.

**Impact:** Fast feedback on UI logic; locks in the accessibility and rendering fixes from Part A.

### B-T3 — Guard that integration tests actually ran, and add axe checks to E2E — Low

**What:** Integration tests skip silently when env vars are unset (green locally without a DB); E2E has
no accessibility assertions.

**Recommendation:** In CI, assert the DB env vars are present so a skip is a failure; add `@axe-core/playwright`
smoke checks to the E2E journey.

**Impact:** "Green" always means the DB paths and basic a11y were verified, not skipped.

## Documentation

### B-DOC1 — Document the per-engine connection-string formats and the security model for users — Medium

**What:** The README pitches `npx humb <url>` but there's no user-facing reference for accepted URL
shapes per engine (TLS params, `mongodb+srv`, socket paths), troubleshooting, or a diagram of the
read-only/local-first security model that the code actually implements well.

**Recommendation:** A `docs/` user guide (or expanded README sections): connection-string cookbook per
engine, common errors, and a one-diagram security model. Consider generating an OpenAPI/typed API doc
from the existing Zod schemas.

**Impact:** Fewer "how do I connect to X" issues; the strong security story becomes legible to users, not just agents.

## UI/UX & product features

### B-U1 — Foreign-key navigation — Medium

**What:** `getTable` already knows which columns are foreign keys, but FK cells aren't clickable. Jumping
from an FK value to the referenced row is the single most-loved feature of database GUIs.

**Recommendation:** Make FK cells link to the referenced table filtered to the referenced key.

**Impact:** Turns Humb from a viewer into a navigator; high perceived value for modest effort (the metadata already exists).

### B-U2 — Run `.sql` files from the Files tab — Medium

**What:** The Files tab previews `.sql` files but can't execute them; the query runner and file browser
are disconnected features that obviously compose.

**Recommendation:** Add "Open in editor" / "Run" from a previewed file into the SQL editor (subject to
the same read-only gate).

**Impact:** The Files tab gains a purpose beyond preview; a natural, low-cost workflow win.

### B-U3 — Switch connections without restarting the CLI — Low

**What:** The target is fixed at launch; inspecting a second database means Ctrl-C and re-run.

**Recommendation:** A connection switcher (recent targets, enter a new URL) — larger scope, worth a spec.

**Impact:** Multi-database workflows without terminal round-trips.

### B-U4 — Server-side sort + full-table export — Low

**What:** Column sort in `RowsTable` is client-side over the current page only, so it's really "sort
these 25 rows," which can mislead. CSV export likewise covers only the current page.

**Recommendation:** Offer server-side `ORDER BY` for true sorting and a "export whole table" path
(streamed) distinct from "export this page."

**Impact:** Sort/export mean what users expect on large tables.

### B-U5 — Loading skeletons and a keyboard-shortcut surface — Low

**What:** Loading states are plain "Loading…" text; the only shortcut (⌘Enter) is undiscoverable
beyond one hint. **Recommendation:** Add lightweight skeletons for the tree/table and a small shortcut
help affordance (and a command palette later). **Impact:** More polished perceived performance and discoverability.

---

## Reminder

Once these suggestions have been reviewed and split into individual tasks (feature entries in
`docs/FEATURES.json` and/or rows in `docs/exec-plans/tech-debt-tracker.md`), **this
`SUGGESTIONS_2.md` file should be cleaned up and removed from the project.** It is a transient review
artifact, not a maintained document. (The same applies to `SUGGESTIONS.md`, per its own note.)
