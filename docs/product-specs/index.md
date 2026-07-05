# Product Specs Index

User-facing behavior specs. Each spec describes observable behavior and acceptance criteria so a
fresh agent can discover product scope quickly.

Qyre's product is a universal database inspector: one CLI command auto-detects the target's engine
and opens a web UI for it. Each engine gets its own spec once supported; specs below describe a
single engine's behavior, not the whole product.

## Active Specs

- [`connect-and-inspect-postgres.md`](connect-and-inspect-postgres.md) - the Postgres engine
  contract, and the first engine this product supports end to end.
- [`connect-and-inspect-sqlite.md`](connect-and-inspect-sqlite.md) - the SQLite engine contract
  (F008 `passing`; Playwright e2e coverage split out as F011). File-based, no server/credentials -
  documents where it diverges from the Postgres contract (no schemas, no network "connection",
  file-handle-level read-only enforcement instead of a `READ ONLY` transaction).
- [`dashboard-ui.md`](dashboard-ui.md) - the engine-agnostic UI shape (title bar, sidebar, SQL
  Editor/Tables/Schema/Files/Console tabs, status bar) sitting on top of any engine's data contract.
  Tracked as the `DF-##` series (`docs/NAMING.md`), not `F###`. See
  `docs/references/design-system.md` for the design tokens.
- [`sql-editor.md`](sql-editor.md) - two engine-agnostic SQL Editor enhancements: query history
  (a right-anchored drawer, `localStorage`-backed) and schema-aware autocomplete (keywords + table
  names), which also means migrating the editor off a plain `<textarea>` onto CodeMirror 6. Tracked
  as F012 (history) and F013 (autocomplete + editor migration).
- [`connect-and-inspect-mysql.md`](connect-and-inspect-mysql.md) - the MySQL engine contract, closest
  to Postgres's of any engine so far (network server, real SQL, transaction-level read-only
  backstop) - only the differences (identifier quoting, schema/database terminology, row-count
  strategy) are called out. Tracked as F014.
- [`connect-and-inspect-mongodb.md`](connect-and-inspect-mongodb.md) - MongoDB, deliberately scoped
  to basic read-only browsing (databases/collections/documents) rather than a full port of the
  SQL-shaped contract - no query runner, and a weaker (code-level, not driver-level) read-only
  guarantee, both explicitly called out rather than glossed over. Tracked as F015; depends on F016.
  Both `passing`.
- [`structured-cell-values.md`](structured-cell-values.md) - an expandable tree viewer for any
  object/array cell value in `RowsTable`/`QueryRunner`'s result table, replacing today's flat
  `JSON.stringify`-to-text handling. Engine-agnostic by design (benefits Postgres/MySQL `json`/`jsonb`
  columns today), and a hard prerequisite for MongoDB's documents (F015) to render usably. Tracked as
  F016.
- [`error-handling.md`](error-handling.md) - a single Fastify `setErrorHandler` normalizing every
  route's error responses (found a real bug while testing F012: `/api/query` was leaking Fastify's
  default `{error: "Internal Server Error"}` shape instead of the real Postgres error message), plus
  a shared `ErrorState` UI component replacing today's inconsistent inline error text across
  `QueryRunner`/`RowsTable`/`SchemaGrid`/`FilesBrowser`/`ConsoleLog`. Tracked as F017.
- [`column-type-fidelity.md`](column-type-fidelity.md) - three defect categories found by
  systematically testing every column type each engine supports rather than just JSON: Postgres/
  MySQL `date`/`timestamp` values silently shifted by the server's local timezone, MySQL/SQLite
  `BIGINT`/`INTEGER` values silently losing precision past `Number.MAX_SAFE_INTEGER`, and binary
  columns rendering as a confusing JSON chip instead of a real hex viewer. Tracked as F019.
- [`adapter-capabilities.md`](adapter-capabilities.md) - replaces `apps/web`'s
  `engine === "mongodb"` string-check branching with a `capabilities.supportsSql` flag each adapter
  declares, so a future non-SQL engine doesn't need its own `apps/web` conditional. Tracked as F063,
  `passing`.
- [`database-switching.md`](database-switching.md) - lets a developer switch the running Qyre
  instance to a different database connection from the title bar's Settings button, without
  restarting the CLI. Tracked as F064, `passing`.
- [`server-side-sort-export.md`](server-side-sort-export.md) - `RowsTable`'s column sort and CSV
  export currently only cover the loaded page; this moves sort server-side and adds a whole-table
  streamed CSV export. Tracked as F065 (sort) and F066 (export), both `passing`.

## Rules

- Specs describe user-visible behavior and acceptance criteria, not implementation details.
- If implementation diverges from a spec, update one of them in the same session.
- Keep this index current.
