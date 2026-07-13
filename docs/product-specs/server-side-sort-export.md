# Product Contract: Server-Side Sort and Whole-Table Export

`RowsTable` (`packages/ui/src/components/rows-table.tsx`) currently sorts and exports only the rows
already loaded into the browser - one page (25 rows by default, `apps/web`'s `UI_PAGE_SIZE`).
Clicking a column header sorts those loaded rows client-side (`Array.sort`); "Export this page as
CSV" exports the same loaded page. Neither reflects the whole table, and both can silently mislead a
developer who assumes "sorted" or "exported" means the entire table rather than whatever happened to
be on screen.

## One-sentence promise

Sorting a table by a column reflects that column's order across the _entire_ table, not just the
loaded page, and whole-result export streams every matching row as CSV, JSON, or engine-appropriate
SQL without materializing or re-querying the result.

## Server-side sort

### Behavior

- `GET /api/tables/:schema/:table/rows` gains two optional query params, `sortColumn` and
  `sortDirection` (`"asc"` or `"desc"`, default `"asc"` when `sortColumn` is given without a
  direction). `DatabaseAdapter.getRows` gains a matching optional parameter.
- `sortColumn` is validated server-side against the table's actual column names (via the same
  introspection `getTable` already performs) before use - **not** interpolated into SQL directly
  from user input. An unrecognized `sortColumn` is rejected with `400` and a clear error message,
  the same treatment `rowsQuerySchema` already gives an invalid `page`/`pageSize`. This is the real
  injection surface this feature introduces: `page`/`pageSize` are already numeric-coerced by Zod,
  but a column name is a raw identifier that has to be checked against a known-good list rather than
  parameter-bound the way a value would be.
- Each engine translates a validated sort to its native mechanism:
  - **Postgres/MySQL/SQLite**: `ORDER BY <quoted-column> ASC|DESC` appended to the existing
    `SELECT ... LIMIT ... OFFSET ...`, using each adapter's existing identifier-quoting convention
    (owned by each SQL driver's `src/sql.ts`).
  - **MongoDB**: `.sort({ [column]: direction === "asc" ? 1 : -1 })` on the `getRows` cursor.
- `RowsTable`'s header-click handler stops sorting the loaded array locally and instead calls a new
  `onSortChange` prop (same shape as the existing `onPageChange`), which `apps/web` uses to update
  `useRows`'s query params and refetch. Clicking the same header cycles asc -> desc -> unsorted,
  exactly as today's client-side behavior already does - only the mechanism moves server-side.
- Changing which table is selected resets sort state to unsorted, matching today's page-reset-on-
  table-change behavior.

### Out of scope (for now)

- Multi-column sort (single `sortColumn` only, matching today's UI, which only ever sorts by one
  column at a time).
- Sorting the SQL Editor's ad hoc query result table - an arbitrary query has no server-known column
  list to validate a `sortColumn` against, and no stable "whole result set" beyond its own 1,000-row
  cap (F050) to sort within. This spec only covers the Tables tab's `RowsTable`, which always has a
  concrete `schema`/`table` the server can introspect and reorder by.
- Extending the client-side text filter (`RowsTable`'s "Filter this page" box) to run server-side -
  a distinct, filter-shaped feature, not addressed here.

### Acceptance criteria

- Clicking a column header sorts the _entire_ table by that column: navigating to page 2 after
  sorting shows genuinely next-in-order rows, not page 2 of the original unsorted order re-sorted
  locally (verified against a table larger than one page).
- Sort persists across Next/Previous pagination until cleared or the table selection changes.
- Requesting a `sortColumn` that isn't a real column on that table returns `400`, not a silent
  no-op or a passed-through SQL error.
- All 4 engines (Postgres, MySQL, SQLite, MongoDB) sort identically for the same logical request
  (ascending/descending by a given column name).

## Whole-result export

### Behavior

- `GET /api/tables/:schema/:table/export.:format` streams every row matching the current validated
  `sortColumn`/`sortDirection`/`filters` query, where `format` is `csv`, `json`, or `sql`.
- CSV remains `text/csv` with a header and the existing formula-injection defense: text beginning
  with `=`/`+`/`-`/`@` is prefixed with an apostrophe before RFC-4180 quoting.
- JSON is one streamed array of objects (`application/json`), not NDJSON. SQL engines use normal
  JSON serialization. MongoDB uses relaxed Extended JSON so BSON values such as ObjectId, Date,
  Decimal128, Long, Binary, and Timestamp retain their type instead of being flattened to the
  grid's display representation.
- SQL export is a sequence of complete `INSERT INTO ... VALUES (...);` statements. It is available
  only when the adapter reports it. Each SQL adapter owns its identifier and literal formatting:
  Postgres and SQLite use their double-quote identifier rules, MySQL uses backticks and mysql2's
  value escaping, and binary/structured values use an engine-valid literal form. MongoDB never
  advertises SQL export, so the UI hides it and a direct `.sql` request receives `400`.

### Capability contract

`AdapterCapabilities` reports `rowExportFormats` and `jsonExportMode` (`json` or
`extended-json`). The UI renders only advertised formats and labels MongoDB's JSON choice
"Extended JSON". The server independently rejects a format the current adapter does not
advertise. Neither layer checks the engine name to decide format support.

### Single-pass streaming

- `DatabaseAdapter.streamRows` returns an async iterable for one validated table/sort/filter
  request. Export never loops over `getRows`, never applies OFFSET pagination, and never reruns the
  query.
- Postgres uses a cursor/query stream on one checked-out pool client; MySQL uses mysql2's native
  query stream; SQLite uses `better-sqlite3`'s statement iterator; MongoDB consumes its native find
  cursor as an async iterable.
- The server formats one row at a time through `Readable.from`, so Node stream backpressure reaches
  the adapter iterator. Ending or aborting the response closes the cursor/query stream and releases
  its client/connection in `finally`.
- Export is intentionally uncapped, because complete export is the feature. Memory remains bounded
  by the current driver batch/high-water mark plus one formatted row; no whole-result array or
  temporary file is created.
- Metadata is introspected once before streaming. Its ordered columns provide the CSV header and SQL
  target list, including for an empty table. MongoDB's CSV header uses its documented sampled
  top-level metadata; Extended JSON keeps every field present in each raw document.

### Selection behavior

F083's precedence remains exact: when any currently loaded rows are selected, the toolbar export
action exports only those selected rows as CSV from the browser. The whole-result format selector
is shown only when no rows are selected. This preserves the selected objects exactly as displayed
without pretending the browser's deliberately normalized MongoDB grid values are lossless Extended
JSON or sending display values back to the server as trusted database literals. Clearing selection
restores capability-driven whole-result CSV/JSON/SQL export.

### Out of scope (for now)

- Exporting the SQL Editor's query result set beyond its existing 1,000-row cap - same reasoning as
  server-side sort's scope note above (no stable "whole result set" concept for an ad hoc query).
- Progress indication for very large exports beyond a basic loading spinner (a progress bar tied to
  row count would need a total-row-count-in-advance guarantee this spec doesn't require).
- JSON Lines, compressed archives, custom delimiters/encodings, SQL transaction wrappers, batched
  multi-row INSERT syntax, and selected-row JSON/SQL export.

### Acceptance criteria

- CSV, JSON, and SQL downloads contain every filtered row in the current server sort order; SQL is
  absent for MongoDB and MongoDB JSON is relaxed Extended JSON.
- CSV applies formula-injection escaping. SQL quotes adversarial identifiers and string values with
  the connected adapter's own rules rather than interpolating untrusted names or display strings.
- A table larger than one page executes one database query/cursor with no OFFSET loop, begins the
  download before the full result is read, and keeps process memory bounded.
- An active page selection still exports only the selected rows as CSV; clearing it restores the
  whole-result format selector.
- All four engines have shared contract coverage for sort/filter propagation, single-pass
  iteration, cleanup, format availability, and empty-result output. SQL output is verified for
  Postgres/MySQL/SQLite; MongoDB SQL is explicitly not applicable.
