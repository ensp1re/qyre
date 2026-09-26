# Product Contract: CSV Import

Qyre already exports whole tables as streamed CSV (F066) and exposes permission-gated row inserts
through `RowMutationApi` (F099/F102). F117 adds the reverse path: a bounded, reviewable CSV import
into one existing table or collection, without allowing an upload to become an unbounded memory,
disk, request-body, or transaction.

## One-sentence promise

A user with insert permission can map a CSV file onto an existing table or collection, preview the
server's real type coercion before writing, and import valid rows atomically, never leaving a
partially imported file behind on SQL engines, with an exact source-line report for every rejected
row.

## Eligibility and affordance gating

- Import is available only for `kind === "table"` or `kind === "collection"`; views and
  materialized views never show the control and the server independently rejects them.
- Both permission tiers apply: the session must report `supportsRowMutations`, the target must have
  `permissions.insert === true`, and a `--read-only` session is rejected by the central mutation
  guard regardless of introspected grants.
- Import does not require a primary key. It only inserts new rows; unlike update/delete, it never
  needs to identify an existing row.
- The target must expose at least one introspected scalar column that can be mapped. Structured,
  binary, unknown, and null-only columns are excluded from the mapping UI and rejected server-side.
  MongoDB metadata is sampled rather than authoritative, so F117 imports only mapped top-level
  sampled fields; importing arbitrary or nested document shapes stays with the Extended JSON
  document editor.
- When import is unavailable, the write-shaped control is hidden rather than left as a dead action.

## Three-step workflow

1. **Inspect:** selecting one `.csv` file uploads it in `inspect` mode. The server streams the full
   file under the limits below and returns its header plus the first 20 raw rows. No write occurs.
2. **Map and validate:** each CSV header can map to one target column or be ignored. Exact
   case-sensitive name matches are selected initially. `validate` mode re-uploads the file, applies
   the mapping and the server's real coercion rules, and returns a dry-run preview plus line errors.
3. **Import:** after a successful dry run, `import` mode re-uploads the same file and mapping. The
   server parses and validates the whole file before writing anything; invalid rows are skipped
   and reported, and valid rows are inserted. The result states total, valid, inserted, and failed
   row counts and keeps the line errors visible.

Changing the file or any mapping invalidates the previous dry run. The final Import action is not
enabled until the current file/mapping combination has completed a dry run.

## HTTP contract

`POST /api/tables/:schema/:table/import.csv` accepts `multipart/form-data` with exactly:

- `mode`: `inspect`, `validate`, or `import`;
- `mapping`: required for `validate`/`import`, a JSON object from CSV header to target-column name or
  `null` (ignored); and
- `file`: exactly one CSV file.

The client appends scalar fields before `file`, allowing the server to validate mode/mapping before
it starts consuming the stream. A caller that sends a file first receives `400`, not implicit
buffering while the server waits for later fields.

Responses use shared `@qyre/core` contracts:

- inspection: `{ mode: "inspect", headers, rowCount, preview }`;
- validation/import: `{ mode, rowCount, validRows, insertedRows, failedRows, preview, errors }`;
- each preview item is `{ line, values }`; each error is `{ line, column?, message }`.

Malformed CSV, invalid multipart shape/mapping, or a limit breach (including a file truncated by the
size cap) rejects the request (`400` or `413`) before any row is written, so retrying the corrected
file never duplicates rows. Row-level validation/database failures are a normal `200` result that
carries the inserted count and line errors: `insertedRows: 0` on SQL engines after a rollback, and
the exact partial count on MongoDB.

## CSV dialect and mapping

- UTF-8, optional UTF-8 BOM, comma delimiter, RFC-4180-style double-quote escaping, CRLF or LF, and
  quoted multiline fields are accepted. Blank records are skipped.
- The first record is the header. Header names must be non-empty and unique; every later record must
  have the same field count.
- At least one header must map to a target. Mapped sources must exist, mapped targets must be real
  introspected columns, and two sources cannot map to the same target. Unmapped source fields are
  ignored. A mapped target omitted by a row is invalid; unmapped target columns are left to database
  defaults/nullability and are not guessed by Qyre.
- Source line numbers are the parser's physical record-ending lines (header is line 1), so quoted
  multiline records still point to the correct place in the source file.

## Coercion

Coercion reuses the same `FilterColumnKind` classification as row editing:

- text/identifier: the CSV text unchanged;
- numeric: a finite decimal/exponent literal; whitespace-only and non-numeric text are errors. SQL
  engines receive a JSON number only when it represents the literal exactly (so `1.0` and `1e3`
  still fit integer columns) and otherwise the exact trimmed text, so `bigint` and high-precision
  `numeric`/`decimal` values are never rounded through a JavaScript number. MongoDB receives the same values as grid inserts: a
  number for safe integers, `$numberLong` for larger 64-bit integers, and otherwise a double;
- boolean: case-insensitive `true`/`false` and `1`/`0`;
- date/time/datetime: a parseable ISO-8601-shaped string, passed through for SQL drivers and
  converted to MongoDB Extended JSON `$date` for a sampled Date field;
- objectId: a 24-character hexadecimal string, converted to MongoDB Extended JSON `$oid` before
  insertion;
- structured/binary/unknown/null-only: not importable.

An empty field becomes `null` only for a nullable target. For a non-nullable text/identifier target
it remains an empty string; for every other non-nullable kind it is a validation error. Qyre does
not pre-enforce database constraints such as uniqueness, checks, string lengths, or server-side
defaults; the connected database remains authoritative.

## Resource and transaction boundaries

- One file, at most 10 MiB; at most 10,000 data rows and 256 columns.
- At most two scalar multipart fields plus the file, with each scalar field capped at 64 KiB.
- The parser consumes the upload as a stream and never writes a temporary file. Import mode retains
  the coerced valid rows (bounded by the 10 MiB and 10,000-row caps) until the whole file has
  parsed, so no write starts before malformed, truncated, or over-limit input is rejected.
- SQL engines insert every valid row in one `mutations.commitBatch` call, which is one native
  transaction. A rejected operation rolls back the whole import: the result reports
  `insertedRows: 0` and the failed line receives an error stating that no rows were written.
- MongoDB uses `mutations.insertRow` one document at a time. A document is MongoDB's native atomic
  unit, and Qyre's supported standalone MongoDB topology cannot provide multi-document
  transactions, so a rejected document does not roll back or block the others. The result is an
  explicit partial result: `insertedRows` is the exact number written and each rejected line says
  that other rows were still inserted.
- Error details are bounded by the 10,000-row request cap, so every rejected input row can be
  returned without a second unbounded response surface.

## Audit behavior

One structured event is emitted per import request, not per row. It records operation `csv-import`,
target schema/table, mode, row/insert/failure counts, duration, and outcome (`success`, `partial`,
or `rejected` when an import wrote no rows). It never logs uploaded
field values, the file body, credentials, or raw database errors.

## Engine parity

- Postgres, MySQL, and SQLite: identical mapping/coercion/result behavior; one whole-import
  transaction through each engine's existing `commitBatch` implementation.
- MongoDB: identical mapping/coercion behavior for sampled top-level scalar fields; atomic
  one-document inserts through `insertRow` with an explicit partial result.
- Views/materialized views are not applicable targets on any engine. Collections are applicable
  only on MongoDB; SQL tables are applicable only on their SQL engines.

## Out of scope

- Creating a table/collection from CSV, schema inference, adding columns, or mapping nested MongoDB
  paths.
- Delimiters/encodings other than UTF-8 comma-separated CSV, saved mapping presets, upsert/update,
  background jobs, resumable uploads, and an undo operation. Whole-file atomicity on MongoDB is out
  of scope while its supported topology has no multi-document transactions.
- Client-side-only parsing. The browser may display server-returned raw preview rows, but the server
  is the only authority for parsing, limits, coercion, and writes.

## Acceptance criteria

- A permitted user can inspect, map, dry-run, and import a quoted/multiline CSV into each applicable
  engine; rows appear after the grid refreshes.
- Read-only, ungranted, view, and materialized-view targets expose no import action and the route
  rejects direct calls.
- Invalid mappings and type conversions name the CSV source line without inserting that row.
- A SQL constraint failure anywhere in the file rolls back the whole import and names the failed
  source line; a MongoDB document failure affects only that row and the result states how many
  rows were inserted.
- Malformed, over-cap, or size-truncated files write no rows on any engine.
- Files, rows, columns, fields, or parts beyond the fixed limits fail without unbounded buffering or
  temporary disk use.
