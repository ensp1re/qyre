# Plan 0010: Bug audit fixes

Status: Completed 2026-09-26 in PR #186 (all slices on one branch, per maintainer request); CI green on 9032869.
Owner: current engagement
Linked features: F160-F169
Trigger: a four-way code audit (SQL drivers, MongoDB driver + core, server + CLI, UI + web app).

## Objective

Fix the correctness bugs the audit confirmed, ordered by data-loss and safety impact. Every
finding below was traced through its real call path; the highest-impact ones were also executed
(classifier payloads run through `classifyStatement`; bson 7.3.3 behavior checked on Node 22).
Each slice must reproduce its bug in a failing test first, then fix it.

## Scope

In scope: the findings listed per slice. Out of scope: refactors beyond what a fix needs, the
Fastify advisory refresh deferred by plan 0009, and new features.

One additional security finding in SQL console statement handling is tracked privately per
[`SECURITY.md`](../../../SECURITY.md) and is intentionally not described here. It is slice F160 and
should land first.

## Slices (in execution order)

### F160 - SQL console safety hardening (security; details withheld)

Private finding plus two related safety gaps. Details live in the private advisory. Verification includes new shared
conformance cases across Postgres, MySQL, and SQLite (MongoDB not applicable: no SQL runner).

### F161 - SQLite column alter loses data and constraints

- `sqlite/src/schema/ddl.ts:144` sets `PRAGMA foreign_keys = OFF` inside the transaction opened by
  `renameAndAlterColumn` (`:183`); SQLite ignores the pragma there, so `DROP TABLE` of a parent
  fires `ON DELETE CASCADE`/`SET NULL` on children. Hoist the pragma outside the transaction.
- The rebuild (`:73-139`) recreates the table from `table_info` + index/trigger SQL only, dropping
  inline `UNIQUE` (auto-indexes have NULL SQL), `CHECK`, `COLLATE`, `AUTOINCREMENT`,
  `WITHOUT ROWID`, `STRICT`, generated columns, and FKs without a column list; composite FKs are
  split. Rewrite from `sqlite_master.sql` or refuse unsupported rebuilds.
- `sqlite/src/write/mutations.ts:29` re-fetches inserts by `rowid`, which throws on
  `WITHOUT ROWID` tables after the insert committed. Use `RETURNING *` or the PK.

### F162 - MySQL MODIFY COLUMN strips column attributes

`mysql/src/schema/ddl.ts:105-124` rebuilds the definition from type, nullability, and default only,
dropping `AUTO_INCREMENT`, `COMMENT`, charset/collation, `ON UPDATE CURRENT_TIMESTAMP`, and
generated expressions; expression defaults are emitted quoted (`DEFAULT 'CURRENT_TIMESTAMP'`,
error 1067). Carry `EXTRA`, `COLUMN_COMMENT`, `COLLATION_NAME`, `GENERATION_EXPRESSION`.

### F163 - MongoDB value fidelity

All in `packages/drivers/mongodb/src` unless noted:

- `write/mutations.ts:31` `Long.fromString` truncates/wraps validated text (`1.5` -> 1,
  `99999999999999999999` -> wrapped). Accept only in-range integer text.
- `core/src/mutation/editor-values.ts:14` accepts timestamps like `...+05` that `new Date()` can't
  parse; Invalid Date is stored as the epoch on update and throws a 500 on insert
  (`server/src/services/rows/row-mutation-validation.ts:164`).
- `write/mutations.ts:123,186` relaxed EJSON document round-trip turns `NumberLong`/`Double(1.0)`
  into Int32/Double on any save, and loses precision above 2^53. Use canonical EJSON.
- `write/mutations.ts:71` `Number(incoming)` demotes Int64 to Double and loses precision.
- `runtime/adapter.ts:240` re-samples the collection to type filters instead of using
  `filter.columnDataType`, so sparse-field filters flip to string compares nondeterministically.
- `query/filters.ts:9` numeric filters coerce to double: Decimal128 never matches, empty text
  becomes `$eq: 0`.
- `schema/introspection.ts:81` hardcodes `_id` as ObjectId: string/int `_id` collections can't be
  edited; 24-hex string `_id` targets the wrong document; bad id is a 500, not 404.
- `write/mutations.ts:74,91` nested BSON types are only recovered by matching key/index, so new
  array elements are stored as strings.
- `write/mutations.ts:119-132` optimistic document check is find-compare-replace, not atomic.
- `runtime/bson-values.ts:59` a stored `__proto__` field is lost; use `Object.create(null)`.

### F164 - SQL console result fidelity

- Postgres/MySQL/SQLite adapters return console rows keyed by name, so duplicate column names in
  joins (`SELECT * FROM a JOIN b`) show the last value in every same-named column. Use array rows.
- `drivers/contract/src/query/result-cap.ts:16` wraps SQL ending in a `--` comment inside `(...)`,
  commenting out the closing paren (syntax error on all SQL engines). Put a newline before `)`.
- `postgres/src/schema/quoted-identifiers.ts:69-107` rewrites unknown quoted identifiers into
  string literals: `AS "Full Name"`, bare `"u"` aliases, materialized views, `pg_catalog."x"`.
- `postgres/src/runtime/connection.ts:5-7` leaves `TIMESTAMPTZ` parsed as `Date`, truncating
  microseconds; timestamptz PK rows always report "stale" on edit. Add the string type parser.
- Postgres `row-export.ts:52` `formatLiteral` emits arrays as `'[1,2]'` (invalid array literal).

### F165 - Introspection robustness

- `postgres/src/schema/introspection.ts:146-158,244-256` FK targets joined on constraint name only:
  composite FKs cross-pair columns; same-named FKs on different tables swap targets. Use
  `pg_constraint.conkey/confkey` with `unnest ... WITH ORDINALITY`.
- Exact `COUNT(*)` failures abort `getAllTables` (Postgres tolerates only 42P01; MySQL counts all
  tables in one `UNION`): one unreadable table or unpopulated matview breaks the sidebar, and on
  MySQL also `getTable`/insert. Count per table and treat failures as unknown.
- Postgres enums named `*_enum`/`*set*` classify as text, so `contains` runs `enum ILIKE` and errors.

### F166 - CSV import atomicity and precision

- `server/src/services/transfer/csv-import.ts:261,302,305` commits 250-row batches while
  streaming, then fails on a later bad record, row cap, or size cap; the client sees an error after
  partial commit and a retry duplicates rows. The size-truncated last record is inserted before
  `truncated` is checked. Validate fully before committing, or return an explicit partial result.
- `csv-import.ts:89` `Number(trimmed)` silently rounds bigint/numeric values. Pass exact text.

### F167 - Grid editing integrity (UI)

- `ui/src/data-grid/table/rows-table.tsx:199-225` + `cells/editable-cell.tsx:265-272`: arrow keys
  move the highlight but not focus, so Delete nulls both the focused and highlighted cells and
  Enter edits the wrong cell.
- `web/src/features/table/ui/tables-tab.tsx:96-107,284`: `commitRef` is only refreshed on the Rows
  render, so Ctrl+S from Structure commits stale changes and can insert twice.
- `ui/src/data-grid/editing/inline-cell-editor.tsx:59`: clearing a nullable cell (or typing only
  spaces) stages `NULL`, violating `row-editing.md:173` ("empty string remains distinct from NULL").
- `tables-tab.tsx:88` + `app/app.tsx:226,319`: staged edits live in the unmounted Tables tab and are
  lost without warning when switching to SQL/Schema/Settings.
- `ui/src/data-grid/table/filter-bar.tsx:105-111`: changing the filter column keeps the old
  operator/value (`age contains "bob"`).
- `ui/src/primitives/date-time-input.tsx:264-276,393-396`: a half-typed time emits empty and wipes
  the date and time.

### F168 - Pagination and cache staleness

- No engine adds a primary-key/`_id` tiebreaker to ORDER BY, so paging duplicates/skips rows with
  equal sort values and Postgres pages are nondeterministic. Fix in the shared contract.
- `web/src/features/table/model/data/use-rows.ts:57-62`: placeholder data keeps `hasMore`, so fast
  Next clicks land on an empty page.
- `web/src/features/table/model/structure/use-table-ddl.ts:17-23`: column DDL invalidates table
  metadata but not rows, so Rows shows old/dropped columns as "unknown".

### F169 - Connection and CLI hygiene

- `core/src/connection-target.ts:90`: switching MongoDB databases rewrites the URI path, changing
  the default `authSource`, so root users fail to authenticate. Preserve the original auth DB.
- `cli/src/guided-login.ts:41` and `ui/src/connection/connect-drawer.tsx:29` trim passwords;
  pasting a URL into the drawer drops query options (`sslmode`, `authSource`).
- `cli/src/index.ts:302`: SIGINT disconnects the startup adapter, not the current `ctx.adapter`
  after a browser-side connect/switch.
- `server/src/app.ts:105`, `cli/src/index.ts:123`: `--port 0` prints/opens `:0`; `QYRE_PORT` is
  parsed loosely (`3000abc` -> 3000, `70000` -> RangeError).
- `ui/src/data-grid/cells/date-detail-popover.tsx:81`: zone-less DATE/TIMESTAMP values are shown
  shifted by the browser timezone.
- `web/src/features/schema/model/use-graph-positions.ts:20`: positions read once, so switching
  databases on the Schema tab can merge the old database's layout into the new one.

## Verification path

Per slice: a failing test reproducing each bug first (shared `@qyre/testing-conformance` case for
adapter behavior, stating verified and not-applicable engines), then the slice's `verification`
command from `docs/FEATURES.json`, ending in `pnpm verify:pr`.

## Risks and blockers

- F161/F162 touch DDL paths that rewrite user tables; tests must assert data and constraints
  survive, not just that the ALTER succeeds.
- F163 canonical EJSON changes the document editor's text format (`{"$numberLong": ...}`); the UI
  must stay readable. Needs a decision (below).
- F167 lifting staged edits into `App` changes component ownership; keep it to state location.

## Decisions

1. F163: relaxed EJSON stays the editor format, but Int64 and whole-number Doubles are written in
   canonical form and saves parse canonically, so untouched values keep their BSON types.
2. F166: validate the whole file first, then insert all rows in one transaction on SQL engines.
   MongoDB (no multi-document transactions on standalone) and MySQL non-transactional tables report
   an explicit partial result instead of claiming a rollback.
3. F161: rewrite the stored `CREATE TABLE` text, changing only the target column; refuse (400) only
   unparseable definitions, generated target columns, and virtual tables.

## Progress log

- 2026-09-26: Audit completed; plan proposed.
- 2026-09-26: All slices implemented in parallel streams, merged, then cross-reviewed per layer
  (drivers, server/core/CLI, UI/web); review findings fixed with regression tests. Verified locally
  against Postgres 16 and MySQL 8 (unit, integration, conformance, smoke and full E2E). MongoDB
  could not be installed in the session environment; its changes are unit-tested and rely on CI's
  Mongo service. Remaining environment-only failures match `main` (SQLite chmod cases under root,
  Mongo integration, MongoDB E2E projects, MySQL E2E cases confused by extra local databases).
- 2026-09-26: CI surfaced one Mongo-only regression (BSON Timestamp subclasses Long, so grid edits
  demoted Timestamp fields); fixed in 9032869 with a unit reproduction. CI green, both jobs.
- Follow-ups not done here: Postgres `ALTER COLUMN TYPE` drops an explicit `COLLATE`; MongoDB
  CSV import stays non-atomic across documents; `set_config(...)` in a read query persists on the
  pooled Postgres session (pre-existing).
