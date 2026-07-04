# Product Contract: Connect and Inspect (MongoDB Engine, Basic Browse)

Humb's product promise is universal: one command, any database, auto-detected. This contract covers
MongoDB - deliberately scoped down to **basic, read-only browsing** (databases, collections,
documents), not a full port of the SQL-shaped contract every other engine follows. Anything not
listed here is explicitly out of scope for this pass, not an oversight.

## Why this engine is scoped differently

Every other engine Humb supports (Postgres, SQLite, MySQL) shares one data model: fixed-schema
tables, columns, rows, and a real SQL dialect that Humb's read-only query runner (F006) can safely
gate with `assertReadOnly` plus a transaction/file-mode backstop. MongoDB has none of that:

- No fixed schema - each document in a collection can have different fields.
- No "tables" - the nearest analog is a collection of loosely-structured documents.
- No SQL - MongoDB's query interface is a language of its own (`find()` filters, aggregation
  pipelines), which does not fit `assertReadOnly`'s string-scan model or a read-only-transaction
  backstop the way SQL does.

Building a Mongo-query-language equivalent of the SQL query runner is a real, separate product
surface (a filter/aggregation input, its own read-only enforcement story) - explicitly deferred, not
part of this contract. This spec covers only enough to browse a Mongo database the same way a
developer would browse a Postgres one, minus the query runner.

## One-sentence promise

A developer can point Humb at a MongoDB connection string, have it auto-recognized, and browse its
databases, collections, and a page of each collection's documents - read-only, no query language
required.

## CLI input shape

```bash
npx humb <mongodb-connection-string>
# examples recognized as MongoDB:
npx humb mongodb://localhost:27017/mydb
npx humb mongodb+srv://user:pass@cluster.example.mongodb.net/mydb
```

Behavior:

- `humb <target>` detects MongoDB from the `mongodb://`/`mongodb+srv://` URL scheme, per
  `packages/drivers/mongodb`'s `AdapterFactory.supports()` - the same detection seam every other
  engine uses.
- The rest of the launch behavior matches every other engine: starts a local server on `HUMB_PORT`
  (default `7717`), opens the default browser, `Ctrl+C` shuts down cleanly.

## Concepts that don't map 1:1 from SQL engines

Per `@humbdb/core`'s existing `DatabaseOverview`/`TableMetadata`/`RowPage` shapes (already reused
unmodified by SQLite despite SQLite's own differences from Postgres - see that spec's precedent),
Mongo's concepts are mapped rather than modeled from scratch:

- **"Schema" = MongoDB database.** A Mongo connection can see multiple databases; each maps to one
  `SchemaMetadata` entry, same as MySQL's database-as-schema mapping.
- **"Table" = MongoDB collection.** Each collection in a database maps to one `TableMetadata` entry.
- **"Columns" = observed fields, best-effort.** MongoDB documents have no fixed columns. `getTable()`
  returns the field names observed across a **sample** of that collection's documents (not a full
  scan - sampling is the standard, honest way to describe a schemaless collection's shape; a fixed
  sample size, e.g. 100 documents, is enough for a representative preview without scanning huge
  collections). Every observed field is reported with `nullable: true` and no primary/foreign key
  metadata (`_id` is the closest analog to a primary key and should be flagged as such via
  `isPrimaryKey`, but there is no foreign key concept to detect).
- **"Rows" = documents.** `getRows()` returns a page of a collection's documents, each document
  mapped into a `Record<string, unknown>` shape `RowPage` already expects. Pages are ordered by
  `_id` ascending (F026) - MongoDB gives no ordering guarantee between separate `find()` calls
  without an explicit sort, so `skip()`/`limit()` alone can show the same document twice or skip one
  entirely across page requests, especially on a collection receiving writes. A page's **column set is
  the union of fields observed across that specific page's documents** (not just `getTable()`'s
  separate top-of-collection sample) - documents in the same collection can have different fields,
  so a fixed column set computed once at the table level could otherwise show blank columns for a
  page where no document happens to have that field, or miss a field that's common on this page but
  wasn't in the sample. A document missing a field present on other rows in the same page renders
  that cell empty, the same way a SQL `NULL` already does - no special-casing needed.
  Nested objects/arrays within a document render via the structured-cell viewer
  (`docs/product-specs/structured-cell-values.md`, F016) - **this engine depends on F016 shipping
  first**, since a real Mongo document's nested fields are unusable as flat JSON text in a table
  cell (unlike Postgres's occasional `jsonb` column, nesting is the common case here, not the
  exception).
- **No indexes reported for v1** - MongoDB index metadata (`db.collection.getIndexes()`) is real and
  fetchable, but not required for the basic-browse promise; a legitimate fast-follow once this ships,
  not a blocker.

## Scope

In scope (MongoDB engine, basic browse):

- MongoDB, one connection at a time.
- Read-only inspection: databases (as schemas), collections (as tables), best-effort field list per
  collection (sampled, not authoritative), document counts.
- Paginated document browsing (reuses the existing engine-agnostic UI and pagination contract).
- Local server health and runtime diagnostics endpoints (reused as-is).

Out of scope (for now, MongoDB engine):

- **A query runner of any kind.** No SQL, no Mongo filter/aggregation input. The SQL Editor tab
  should not be reachable/should be clearly disabled when connected to Mongo, rather than silently
  accepting SQL text that can never mean anything against a Mongo connection.
- Authoritative index metadata (see above).
- Writes, schema edits, migrations, or destructive actions (same as every engine).
- Multiple simultaneous connections, replica set / sharded cluster topology awareness beyond
  whatever the driver library's connection string handles by default.
- Aggregation pipelines, change streams, GridFS, or any Mongo-specific feature beyond plain document
  reads.

## Read-only enforcement

This is the one place this engine's guarantee is meaningfully weaker than every other engine's, and
that must be stated plainly rather than glossed over: Postgres and SQLite both have an
**authoritative backstop independent of Humb's own code being bug-free** (a `READ ONLY` transaction,
a file handle opened read-only) - even a bug in Humb's own logic cannot produce a write, because the
database/driver itself refuses one. MongoDB's official driver has no equivalent "open this connection
read-only" mode enforced by the server. For this basic-browse scope, the guarantee is instead:
**the adapter's code path never calls any Mongo write API** (`insertOne`, `updateOne`, `deleteOne`,
`drop`, `createIndex`, etc.) - enforced by code review and a lint-style check (e.g. a test asserting
the adapter module's source contains none of those method names), not by the database itself. Since
this pass has no query runner accepting arbitrary Mongo commands from the user, the actual attack
surface is narrow (only Humb's own adapter code runs against the connection at all) - but this is a
narrower guarantee than the other engines have, and should be revisited if a query-runner-equivalent
for Mongo is ever built (at which point a real driver/permission-level backstop becomes necessary,
the same way it was necessary before the SQL query runner shipped for Postgres/SQLite).

## Primary end-to-end journey

1. Start Humb against a MongoDB database: `npx humb mongodb://localhost:27017/mydb`.
2. The browser UI loads and shows a connected status.
3. The UI lists databases (as schemas) and collections (as tables).
4. The user opens a collection and sees its best-effort observed fields and a paginated page of
   documents.
5. The SQL Editor tab is not usable against a Mongo connection (see "Out of scope").

## Acceptance criteria

- Running the CLI against a reachable MongoDB database results in a browser UI that shows the
  database is connected.
- The UI can list at least databases and collections for the connected database.
- Selecting a collection shows its best-effort observed fields and a first page of documents; a
  document with a nested object/array field renders it via the structured-cell viewer (F016),
  expandable rather than flattened to raw JSON text.
- The SQL Editor tab does not silently accept or attempt to run SQL against a Mongo connection.
- No write operation is ever issued by Humb's own code against the connection (see "Read-only
  enforcement").
- The server starts, reports healthy, and shuts down cleanly.

## Failure states

- Unreachable database: the UI shows a clear, recoverable error with the reason and a retry path
  (same as every other engine).
- Invalid connection string: the CLI fails fast with actionable guidance.
- Empty collection, or a collection whose sampled documents share no common fields: the UI shows
  whatever fields were actually observed (even zero) rather than erroring - an empty/sparse result is
  a valid, expected state for a schemaless store, not a failure.
- Port already in use: same behavior as every other engine.
