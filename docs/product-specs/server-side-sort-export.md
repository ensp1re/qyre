# Product Contract: Server-Side Sort and Whole-Table Export

`RowsTable` (`packages/ui/src/components/rows-table.tsx`) currently sorts and exports only the rows
already loaded into the browser - one page (25 rows by default, `apps/web`'s `UI_PAGE_SIZE`).
Clicking a column header sorts those loaded rows client-side (`Array.sort`); "Export this page as
CSV" exports the same loaded page. Neither reflects the whole table, and both can silently mislead a
developer who assumes "sorted" or "exported" means the entire table rather than whatever happened to
be on screen.

## One-sentence promise

Sorting a table by a column reflects that column's order across the _entire_ table, not just the
loaded page, and exporting to CSV exports every row in the table, not just the ones currently on
screen.

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
    (already used for table/column names elsewhere in each adapter - see `quoteIdent` in
    `packages/drivers/sqlite/src/index.ts` and its Postgres/MySQL equivalents).
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

## Whole-table CSV export

### Behavior

- A new endpoint, `GET /api/tables/:schema/:table/export.csv`, streams every row of the table as
  `text/csv` - honoring the current sort (if any) from the query params above, using the same
  `toCsv`-equivalent escaping `RowsTable` already applies (leading `=`/`+`/`-`/`@` prefixed with an
  apostrophe to block spreadsheet formula injection - F035).
- The server fetches and streams the table in bounded batches (e.g. `MAX_PAGE_SIZE`-sized chunks via
  repeated internal `getRows` calls, or an engine-native streaming cursor where available) rather
  than materializing the whole table in memory before responding - mirrors F050's `capResultRows`
  philosophy of never holding an unbounded result set in memory, but for the export path, which by
  definition must not be capped at `runReadOnlyQuery`'s 1,000-row limit (F050) since exporting the
  whole table is the entire point of this feature.
- The existing "Export this page as CSV" button becomes "Export all rows as CSV," calling this new
  endpoint and downloading the streamed response - replacing the page-only export rather than
  keeping both, since page-only export was the compromise this spec exists to fix, not a mode worth
  preserving alongside the fix. The selected-rows "Copy as CSV" action (checkbox multi-select) is
  unrelated and unaffected - it explicitly means "copy these specific rows I picked," which only
  makes sense for currently-loaded/selected rows.

### Out of scope (for now)

- Export formats other than CSV (e.g. JSON, SQL `INSERT` statements).
- Exporting the SQL Editor's query result set beyond its existing 1,000-row cap - same reasoning as
  server-side sort's scope note above (no stable "whole result set" concept for an ad hoc query).
- Progress indication for very large exports beyond a basic loading spinner (a progress bar tied to
  row count would need a total-row-count-in-advance guarantee this spec doesn't require).

### Acceptance criteria

- "Export all rows as CSV" downloads a CSV containing every row in the table (verified against a
  table with more rows than one page), honoring the current sort if one is active.
- The exported CSV applies the same formula-injection escaping as today's page-only export.
- Exporting a large table does not require holding the entire result set in server memory at once
  (verified via a table with a large row count not causing a memory spike server-side, and the
  download starting before the whole table has been read from the database).
