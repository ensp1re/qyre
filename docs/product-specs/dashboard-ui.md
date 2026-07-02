# Product Contract: Dashboard UI Redesign

Unlike `connect-and-inspect-postgres.md`/`connect-and-inspect-sqlite.md`, which describe per-engine
backend/data contracts, this spec describes the **UI shape** that sits on top of them - engine
agnostic, applies identically to every `packages/drivers/<engine>` Humb supports. Source design:
`docs/references/design-system.md` (tokens) and `github.com/ensp1re/UserDashboard` (private,
Figma Make export). Tracked as the `DF-##` series in `docs/FEATURES.json` - see
`docs/exec-plans/active/0003-dashboard-ui.md` for the work breakdown.

## One-sentence promise

Humb's browser UI looks and feels like a fast, dense, developer-first IDE for the connected
database - not a generic admin-panel dashboard - regardless of which engine is behind it.

## Shape

A single-page app shell:

- **Title bar**: wordmark, connection breadcrumb (`engine@target -> database`), connection status
  dot, dark/light toggle, refresh, settings (settings itself is out of scope until something needs
  configuring beyond theme).
- **Sidebar**: collapsible, searchable tree of the connected engine's structure (mirrors
  `SchemaTree`'s existing data, restyled). Search highlights matches and force-opens ancestor paths.
- **Tab bar**: SQL Editor, Tables, Schema, Files, Console (see "Tabs" below).
- **Status bar**: connection status, engine + version, current schema/database, encoding.

## Tabs

- **SQL Editor**: line-numbered read-only query runner (ports `QueryRunner`). `Cmd/Ctrl+Enter` to
  run. Results panel below the editor, not a separate page.
- **Tables**: paginated row browser (ports `RowsTable`) with client-side search/sort over the
  fetched page. No write affordances (see "Out of scope").
- **Schema**: a grid of table cards, each showing its columns with PK/FK badges - a full-database
  overview, distinct from the existing single-table `TableDetail`.
- **Files**: a read-only browser for SQL-related files near the launch target (saved queries,
  migrations if present) - **not yet backed by any API**; needs a new, carefully-scoped read-only
  filesystem endpoint (see "Backend gaps").
- **Console**: a stream of recent connection/query events - **not yet backed by any API**; needs a
  new endpoint exposing recent structured events (see "Backend gaps").

## Backend gaps this redesign surfaces

Identified while reading the source design; each becomes its own `DF-##` slice, not silently bundled
into a UI-only change:

- **Engine + version in `/api/health`**: the status bar needs e.g. "PostgreSQL 16.1" /
  "SQLite 3.45.0" - `HealthResponse` doesn't carry this today. Add via `SELECT version()`
  (Postgres) / `sqlite_version()` (SQLite) pragma, engine-agnostic on the `DatabaseAdapter`
  contract like everything else.
- **Foreign-key metadata**: the Schema tab's FK badges need to know which columns reference another
  table. `ColumnMetadata`/`IndexMetadata` in `@humb/core` have no FK concept yet - Postgres has this
  in `information_schema.key_column_usage`/`table_constraints`; SQLite has it via
  `PRAGMA foreign_key_list`. Add as a genuinely engine-agnostic contract field, implemented per
  engine, same pattern as `IndexMetadata` (F003).
- **Read-only file browsing (Files tab)**: needs its own security-scoped design before any backend
  work starts - see `docs/SECURITY.md`'s untrusted-input rules. Do not implement as "read any path
  the client asks for." Candidate scope: only files matching `*.sql` under a directory the CLI was
  explicitly pointed at (e.g. via a new `--files-dir` flag), never arbitrary filesystem traversal
  from the launch cwd. Decide and document the exact boundary as part of that `DF-##` entry before
  writing the endpoint.
- **Recent activity/event log (Console tab)**: needs an in-memory ring buffer of recent query/health
  events on the server (no persistence requirement) and an endpoint to read it. Structured logging
  already exists (Fastify/pino) but isn't queryable by the frontend today.

## Out of scope

- Anything write/mutation-shaped: the source mock's "Add row" button, bulk row-selection-as-edit,
  inline cell editing. Humb is read-only (`docs/PRODUCT_SENSE.md`). Port the surrounding visual
  pattern where harmless (e.g. row checkboxes purely for "copy selected as CSV" is fine; wiring them
  to a real mutation is not).
- Settings panel content (the gear icon is chrome-only until there's something real to configure).
- Multi-connection / connection switching UI (Humb is one connection at a time - `docs/SECURITY.md`).

## Acceptance criteria

- The shell renders identically in light and dark mode using only the tokens in
  `docs/references/design-system.md` - no ad hoc hex values in component code.
- Every existing passing feature's underlying data flow (F001-F008, F011 once done) is preserved
  exactly - this redesign changes presentation, not the API contracts described in the
  `connect-and-inspect-*` specs. Re-verify the full connect-and-inspect journey after each `DF-##`
  slice.
- No control implies a write; the query runner's read-only enforcement (F006) is unaffected.
