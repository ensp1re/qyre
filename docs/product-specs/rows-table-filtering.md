# Product Contract: Server-Side Row Filtering

`RowsTable` supports both quick page-local narrowing and database-backed whole-table queries.
Typing in Search narrows the loaded page immediately; Enter commits the same text as a
whole-table search. Structured filters remain the precise, column-aware query path.

## One-sentence promise

Filtering a table by a column reflects a real `WHERE`/`.find()` query against the whole table
(not just the loaded page), works identically across all 4 engines including MongoDB, and
clicking a primary- or foreign-key value drills straight into the matching row(s).

## Server-side filtering

### Behavior

- `GET /api/tables/:schema/:table/rows` and `GET /api/tables/:schema/:table/export.csv` (F066)
  both gain one optional query param, `filters` - a JSON-encoded array of
  `{ column: string; op: FilterOp; value?: string }`. `DatabaseAdapter.getRows` gains a matching
  optional `filters: RowFilter[]` parameter.
- `FilterOp` is a fixed whitelist: `"eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "contains" |
"isNull" | "isNotNull"`. `value` is required for every op except `isNull`/`isNotNull`, which
  ignore it.
- Multiple filters combine with `AND` (matching the "+ add filter" UI below - there's no UI
  affordance for `OR`, so the API doesn't need to represent it either).
- `search=<text>` is an optional whole-table free-text query. The server resolves it against the
  real table metadata, then each adapter ORs case-insensitive textual matching across every
  non-binary column. It combines with structured filters using `AND`, is honored by export, and
  returns an exact `RowPage.total` just like an active filter.
- Each filter's `column` is validated server-side against the table's real columns (the same
  `getTable` introspection `resolveRowSort` already uses for `sortColumn` - see
  `server-side-sort-export.md`'s injection-surface note) before use. An unrecognized column is
  rejected with `400`, same treatment as an unrecognized `sortColumn`. The server also validates
  that `op` is meaningful for the selected column's engine-aware capability (for example,
  `contains` is valid for scalar text and supported structured columns, but not numeric
  columns). This is the real
  injection surface here too: `op` is already whitelisted by a Zod enum and `value` is always
  parameter-bound (SQL engines) or passed as a native driver value (MongoDB), never interpolated
  into a query string.
- Each engine translates the validated filter list to its native mechanism:
  - **Postgres/MySQL/SQLite**: a parameterized `WHERE <quoted-column> <op> $n` clause per filter,
    ANDed together and appended before `ORDER BY`/`LIMIT`/`OFFSET`. `eq`/`neq`/`lt`/`lte`/`gt`/
    `gte` map to `=`/`!=`/`<`/`<=`/`>`/`>=`; `contains` maps to a case-insensitive `LIKE`/`ILIKE`
    (Postgres uses `ILIKE`; MySQL/SQLite's default collation is already case-insensitive) with the
    value wrapped in `%...%` and its own `%`/`_`/escape-char occurrences escaped via an `ESCAPE`
    clause, so a literal `%` or `_` in the searched-for text isn't treated as a wildcard; `isNull`/
    `isNotNull` map to `IS NULL`/`IS NOT NULL` (no bound parameter). The value itself is always
    bound as a parameter (never string-concatenated), same as `LIMIT`/`OFFSET` already are - the
    database driver/engine handles converting the bound text parameter against a numeric or date
    column, matching how parameter binding already works for every other bound value in these
    adapters today.
    For PostgreSQL JSON/JSONB and native arrays, MySQL JSON, and declared SQLite JSON, `contains`
    searches the database's textual representation with the same escaped substring contract. The
    user enters an ordinary word, symbol, or number; the UI never requires a JSON document merely
    to search structured data.
  - **MongoDB**: a `.find({...})` filter document, one key per column. `eq`/`neq` -> `{$eq}`/
    `{$ne}`; `lt`/`lte`/`gt`/`gte` -> `{$lt}`/`{$lte}`/`{$gt}`/`{$gte}`; `contains` -> `{$regex:
<escaped value>, $options: "i"}` (regex metacharacters in the value escaped first, same
    reasoning as SQL's `LIKE` escaping above, just for regex instead of `%`/`_`); `isNull`/
    `isNotNull` -> `{$eq: null}`/`{$ne: null}`. Unlike the SQL engines, MongoDB documents store
    native BSON types (a number field holds a number, not a string), so a raw string `value` won't
    match a numeric/boolean/date/ObjectId field as-is - the adapter coerces `value` using the same
    per-field type inference `getTable`'s `inferColumns` already performs (F068) before building
    the filter document. BSON sentinels such as MinKey and MaxKey remain displayable as normalized
    structured values but are not exposed as normal scalar filter types in metadata or the UI.
    Object/array `contains` accepts ordinary text and recursively searches object keys, values,
    nested objects, and array members with native aggregation expressions. It does not use
    deprecated server-side JavaScript (`$where`/`$function`). Binary values remain unavailable.
- `RowsTable`'s toolbar gets a `Filter` button (funnel icon) sitting next to the page-local
  `Search this page` box, which stays a distinct, page-local free-text narrow (F065's spec already
  flagged this as a "distinct, filter-shaped feature, not addressed here"; this is that feature).
  The Filter button opens an anchored **popover with a progressive three-step flow** rather than a
  row of always-visible dropdowns, so a filter reads as a sentence being built and the common case
  is two or three keystrokes:
  1. **Column** - a searchable, type-to-filter list of the table's real columns, each with its
     type icon (reusing `TypeIcon`'s numeric/text/boolean/date mapping) and a PK/FK badge; the
     search input holds keyboard focus and arrow/Enter drive the highlight (`aria-activedescendant`).
  2. **Operator** - a list of operators supported by the picked column's engine-aware capability
     (e.g. `contains` for text, comparisons for numeric/date/time, equality for ObjectId/boolean)
     so irrelevant choices are not shown;
     each shows a readable word (`equals`, `greater than`) with the SQL symbol as a muted hint.
     Picking `is null`/`is not null` applies immediately (no value step).
  3. **Value** - a type-appropriate control: text/ObjectId text, number, true/false, date, time,
     datetime, a catalog-backed enum selector for equality, or ordinary text for structured
     key/value/array substring search on every engine.
     The column and operator already chosen show as breadcrumb tokens at
     the popover's head, each clickable to re-pick that step. Escape walks one step back, then
     closes.
     Keyboard selection and value application read the focused control's live value, so a final
     keystroke followed immediately by Enter cannot be lost to a delayed React render. Returning from
     the operator step remounts and focuses the column search input, keeping the second Escape inside
     the dialog so it closes without requiring a mouse click.
- Applied filters render as compact **segmented chips** in the toolbar (type icon · column ·
  operator symbol · value), joined by small `and` separators to make the AND semantics visible.
  Clicking a chip reopens the popover to **edit that filter in place**; clicking its `×` removes
  just that one. A `Clear` action appears once two or more filters are active. No raw-SQL filter
  input, so the same flow works uniformly on MongoDB.
- Adding, editing, or removing a filter resets pagination to page 0 and refetches, the same way
  changing sort already does. Changing the selected table clears all active filters, matching
  sort's existing reset-on-table-change behavior.
- Typing in Search filters only the currently loaded page without a request. Pressing Enter commits
  the trimmed value to `search`, resets pagination, and searches the whole table. The field shows
  transient progress while that server query runs; exact footer totals communicate its scope without
  a persistent badge. Clearing removes both the draft and committed search.
- With an active server filter/search, the footer uses exact `RowPage.total` (for example,
  `25 of 438 matching rows`), never the unfiltered catalog estimate. With only page-local search it
  reports both page matches and the available table/matching total.
- Accessibility/keyboard: the popover is a focus-trapped `dialog` (focus restored to the trigger on
  close), the column and operator lists use proper `listbox`/`option` roles, and the whole compose
  flow is operable without a mouse.

### Out of scope (for now)

- `OR` logic between filters, or grouping (`AND`-only, made visible by the `and` chip separators).
- Filtering the SQL Editor's ad hoc query result table - same reasoning `server-side-sort-export.md`
  already gives for excluding it from sort: no server-known column list to validate a filter
  column against, and no stable "whole result set" to filter within beyond its own 1,000-row cap
  (F050).
- Enum/dropdown value pickers based on live distinct values. Authoritative catalog enum values are
  used for equality filters; Qyre does not run a distinct-values query to invent options.
- Filtering on nested/embedded MongoDB document fields (dot-notation paths) - only top-level
  document fields, matching `getTable`'s existing column list.

### Acceptance criteria

- A single `column eq value` filter returns exactly the matching rows, verified against a table
  with more rows than one page, identically across all 4 engines.
- Requesting a `filters` entry with a column that isn't a real column on that table returns `400`.
- Requesting a valid column with an unsupported operator for its type/engine returns `400` before
  the adapter runs the row query.
- `contains` matches case-insensitively and correctly handles a searched-for value that itself
  contains a literal `%`/`_` (Postgres/MySQL/SQLite) or regex metacharacter (MongoDB) instead of
  treating it as a wildcard.
- Structured `contains` accepts ordinary text and matches nested keys, values, and array members
  across PostgreSQL JSON/arrays, MySQL JSON, declared SQLite JSON, and MongoDB objects/arrays.
- Typing search text changes only the current page; pressing Enter searches every non-binary
  column across the whole table and resets to page 0.
- Active server filters/searches return an exact matching total and the footer does not display the
  unfiltered estimate as though it were the filtered count.
- `isNull`/`isNotNull` filter correctly without a `value` param.
- Two filters combine with `AND` (verified with two filters that individually match more rows
  than they do together).
- `GET .../export.csv` honors the same active filters as `GET .../rows`.
- Clearing all filters or switching the selected table returns the full, unfiltered table.

## Click-to-filter

### Behavior

- Clicking a primary-key cell's value in `RowsTable` replaces the current table's active filters
  with a single `{ column: <pk column>, op: "eq", value: <stringified cell value> }` filter and
  resets to page 0 - a "drill into this row" action, not an additive one (adding to whatever
  filters happened to already be active would be surprising).
- Clicking a foreign-key cell's value keeps its existing behavior (`onNavigateToForeignKey`
  switches to the referenced table) and additionally seeds that table's filters with a single
  `{ column: <referenced column>, op: "eq", value: <stringified cell value> }` filter, so the
  referenced table opens already narrowed to the referencing row instead of showing the whole
  table.
- Both work identically for MongoDB's `_id` column, which is already marked `isPrimaryKey: true`
  (F068) - no special-casing needed beyond the general primary-key click behavior above.

### Out of scope (for now)

- A visible affordance distinguishing "this cell is clickable to filter" beyond the existing PK/FK
  column-header badges and the foreign-key cell's existing underline style - primary-key cells
  gain the same clickable-link treatment foreign-key cells already have.

### Acceptance criteria

- Clicking a primary-key value filters the current table down to just that row.
- Clicking a foreign-key value navigates to the referenced table pre-filtered to the referencing
  row, verified on a SQL engine (real FK) and on MongoDB (`_id`, since Mongo has no enforced FKs
  but `references` can still point at a conventionally-named `_id`-holding collection field).
