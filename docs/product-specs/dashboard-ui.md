# Product Contract: Dashboard UI Redesign

Unlike `connect-and-inspect-postgres.md`/`connect-and-inspect-sqlite.md`, which describe per-engine
backend/data contracts, this spec describes the **UI shape** that sits on top of them - engine
agnostic, applies identically to every `packages/drivers/<engine>` Qyre supports. Source design:
`docs/references/design-system.md` (tokens) and `github.com/ensp1re/UserDashboard` (private,
Figma Make export). Tracked as the `DF-##` series in `docs/FEATURES.json` - see
`docs/exec-plans/active/0003-dashboard-ui.md` for the work breakdown.

## One-sentence promise

Qyre's browser UI looks and feels like a fast, dense, developer-first IDE for the connected
database - not a generic admin-panel dashboard - regardless of which engine is behind it.

## Shape

A single-page app shell:

- **Title bar**: wordmark, connection breadcrumb (`engine@target -> database`), connection status
  dot, dark/light toggle, refresh, settings (settings itself is out of scope until something needs
  configuring beyond theme).
- **Sidebar**: collapsible, searchable tree of the connected engine's structure (mirrors
  `SchemaTree`'s existing data, restyled). Search highlights matches and force-opens ancestor paths;
  a query of exactly one character shows a "keep typing" hint instead of silently falling back to
  the unfiltered tree (the 2-character minimum wasn't otherwise discoverable, F037). The
  schema/table overview backing it polls every 30s while connected (F033), in addition to the
  manual Refresh button and React Query's default refetch-on-focus, so a table added/dropped
  outside Qyre doesn't stay invisible indefinitely. Keyboard-operable (F031): each row is a real
  `role="treeitem"` (nested under `role="tree"`/`role="group"`), focusable, with `Enter`/`Space` to
  select/activate and `ArrowRight`/`ArrowLeft` to expand/collapse a schema. The connection row's
  status is conveyed by a distinct icon shape (check/alert/plain circle) plus an `aria-label`, not
  color alone, so color-blind users can distinguish connection state (F038).
- **Tab bar**: SQL Editor, Tables, Schema, Files, Console (see "Tabs" below).
- **Status bar**: connection status, engine + version, current schema/database, encoding.

## Tabs

- **SQL Editor**: line-numbered read-only query runner (ports `QueryRunner`). `Cmd/Ctrl+Enter` to
  run - the toolbar chip shows the platform-appropriate label (`⌘ Enter` / `Ctrl Enter`) and the Run
  button's `title` repeats it, since a single always-visible hint wasn't enough for discoverability
  (F040). Results panel below the editor, not a separate page.
- **Tables**: paginated row browser (ports `RowsTable`) with client-side search/sort over the
  fetched page. Next is only enabled when a next page actually has rows - `useRows` probes the next
  page's offset alongside the current page's fetch, instead of guessing `hasMore` from
  `rows.length === pageSize` (wrong exactly on an exact-page-size boundary, F036). Row rendering is
  virtualized (`@tanstack/react-virtual`, F051) - only visible rows (plus overscan) mount as DOM
  nodes, so a wide table doesn't mount thousands of cells. No write affordances (see "Out of
  scope").
- **Schema**: a grid of table cards, each showing its columns with PK/FK badges - a full-database
  overview, distinct from the existing single-table `TableDetail`. Backed by one batched
  `GET /api/tables` request (F027) that returns every table's metadata in a single response,
  instead of the browser fanning one request out per table - the previous shape didn't scale to
  schemas with hundreds of tables (hundreds of concurrent requests, each running its own catalog
  queries). The per-table catalog query count itself is unchanged (tracked separately as tech debt).
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
  table. `ColumnMetadata`/`IndexMetadata` in `@qyre/core` have no FK concept yet - Postgres has this
  in `information_schema.key_column_usage`/`table_constraints`; SQLite has it via
  `PRAGMA foreign_key_list`. Add as a genuinely engine-agnostic contract field, implemented per
  engine, same pattern as `IndexMetadata` (F003).
- **Read-only file browsing (Files tab)**: security boundary decided below (DF-06).
- **Recent activity/event log (Console tab)**: needs an in-memory ring buffer of recent query/health
  events on the server (no persistence requirement) and an endpoint to read it. Structured logging
  already exists (Fastify/pino) but isn't queryable by the frontend today.

## Files tab security boundary (DF-06)

Decided before writing any endpoint code, per `docs/SECURITY.md`'s untrusted-input rule and the
"Backend gaps" note above. The server never reads an arbitrary path a client sends - the boundary
is fixed at CLI startup, not per-request:

- **Opt-in, not default-on**: file browsing is disabled unless the user passes a new `--files-dir
  <dir>` CLI flag. With no flag, `GET /api/files` responds `{ enabled: false, tree: [] }` and the
  Files tab shows an explanatory empty state - it never silently scans the launch cwd.
- **One fixed root, resolved once at startup**: `--files-dir` is resolved to an absolute path and
  validated (must exist and be a directory) when the CLI starts, exactly like the database target
  itself. Every request is scoped to that single root for the life of the process.
- **Extension allowlist**: only `*.sql` files are ever listed or readable. Directories are listed
  (to preserve folder structure like `migrations/`, `queries/`) but pruned from the response if they
  contain no `.sql` file anywhere below them, so the tree only ever shows SQL-relevant content.
  `.`-prefixed entries and `node_modules` are skipped while walking, so pointing `--files-dir` at a
  whole repo by mistake doesn't dump its entire tree.
- **Per-request path validation on the content-read endpoint** (`GET /api/files/content?path=...`):
  the `path` query value is untrusted client input even though the root is fixed. Reject any path
  containing a `..` segment outright, require the extension to be `.sql`, then resolve it against
  the root and require the resolved absolute path to still start with the root - this is what
  actually stops lexical traversal, not the extension check alone. A rejected path is a `400`,
  matching F006's precedent for query-runner rejections (a client mistake, not a server fault).
- **No symlink following, on the tree _and_ the content-read endpoint (F023)**: the tree walk
  classifies entries via `fs.Dirent.isDirectory()`/`isFile()`, which do not resolve symlinks - a
  symlink anywhere under the root (in either direction) is silently excluded from the tree rather
  than followed. The content-read endpoint reads whatever path it's given, though, so a symlink
  _inside_ the root pointing outside it - pre-existing, or created by anything with filesystem
  write access - could still be read even though the lexical check above passed (that check only
  sees the symlink's own in-root path, not where it points). `resolveSqlFilePath` closes this:
  after the lexical check, it resolves the path with `realpathSync` (following every symlink in the
  chain) and re-asserts the result still starts with the root's own `realpathSync`'d form before
  the caller ever reads it. A path that doesn't exist yet is left as-is - nothing to resolve, and
  the caller's existing 404 handling covers it.
- **Why this shape**: Qyre's server has no auth and binds to localhost only (`docs/SECURITY.md`'s
  local-first boundary), so the real threat isn't another user on the machine - it's a malicious or
  compromised web page in the same browser making an unauthenticated request to
  `http://127.0.0.1:<port>/api/files/content?path=../../../../etc/passwd`. The fixed root + allowlist
  - traversal check is what makes that request harmless regardless of what a client asks for.

## Out of scope

- Anything write/mutation-shaped: the source mock's "Add row" button, bulk row-selection-as-edit,
  inline cell editing. Qyre is read-only (`docs/PRODUCT_SENSE.md`). Port the surrounding visual
  pattern where harmless (e.g. row checkboxes purely for "copy selected as CSV" is fine; wiring them
  to a real mutation is not).
- Settings panel content (the gear icon is chrome-only until there's something real to configure).
- Multi-connection / connection switching UI (Qyre is one connection at a time - `docs/SECURITY.md`).

## Acceptance criteria

- The shell renders identically in light and dark mode using only the tokens in
  `docs/references/design-system.md` - no ad hoc hex values in component code.
- Every existing passing feature's underlying data flow (F001-F008, F011 once done) is preserved
  exactly - this redesign changes presentation, not the API contracts described in the
  `connect-and-inspect-*` specs. Re-verify the full connect-and-inspect journey after each `DF-##`
  slice.
- No control implies a write; the query runner's read-only enforcement (F006) is unaffected.
