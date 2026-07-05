# Product Contract: Connect and Inspect (MySQL Engine)

Qyre's product promise is universal: one command, any database, auto-detected. This contract covers
MySQL — the third engine Qyre supports end to end, after
[Postgres](connect-and-inspect-postgres.md) and [SQLite](connect-and-inspect-sqlite.md). It is the
single source of truth for what MySQL-engine scope means. Anything not listed here is out of scope
for this engine for now.

MySQL is architecturally the closest engine to Postgres Qyre has added so far: a network server,
schemas/tables/rows, a real SQL dialect. Most of this contract mirrors Postgres's directly; only the
differences are called out explicitly rather than silently assumed identical.

## One-sentence promise

A developer can point Qyre at a MySQL connection string, have it auto-recognized, and immediately
browse its structure and data in the same UI used for every other engine.

## CLI input shape

```bash
npx qyre <mysql-connection-string>
# examples recognized as MySQL:
npx qyre mysql://user:pass@localhost:3306/mydb
npx qyre mysql://localhost/mydb
```

Behavior:

- `qyre <target>` detects MySQL from the `mysql://` URL scheme, per `packages/drivers/mysql`'s
  `AdapterFactory.supports()` - the same detection seam every other engine uses (see
  `ARCHITECTURE.md`'s "Adding a new database engine").
- The rest of the launch behavior matches the Postgres contract: starts a local server on
  `QYRE_PORT` (default `7717`), opens the default browser, `Ctrl+C` shuts down cleanly and releases
  the connection pool.
- If the connection cannot be established (wrong credentials, unreachable host, wrong port), the CLI
  behaves like Postgres's failure path: the UI comes up and shows a clear, recoverable connection
  error rather than the CLI itself failing to start (the target is syntactically valid; whether it's
  reachable is a runtime concern the UI already handles for Postgres).

## Scope

In scope (MySQL engine):

- MySQL 8.x, one connection at a time (a connection pool, matching the Postgres adapter's shape).
- Read-only inspection: schemas (MySQL calls these "databases", but the concept maps directly),
  tables, columns, indexes, row counts.
- Paginated table data browsing (reuses the existing engine-agnostic UI and pagination contract - no
  new frontend work required, only the adapter).
- A read-only SQL query runner (SELECT-style statements only), reusing
  `@qyre/driver-contract`'s `assertReadOnly`/`ReadOnlyViolationError` heuristic layer - already
  shared across Postgres and SQLite, not re-implemented per engine.
- Local server health and runtime diagnostics endpoints (reused as-is - `/api/health` is
  engine-agnostic already).

Out of scope (for now, MySQL engine):

- Writes, schema edits, migrations, or destructive actions (same as every other engine).
- Multiple simultaneous connections.
- MySQL-compatible forks with meaningfully different semantics (MariaDB, etc.) - not excluded on
  purpose, just not verified against; revisit if a real compatibility gap surfaces.
- SSL/TLS connection options beyond whatever the driver library defaults to - a real gap if a user's
  MySQL requires custom TLS config, but not blocking initial scope (same posture Postgres shipped
  with).

## Concepts that don't map 1:1 from Postgres

- **Identifier quoting.** MySQL quotes identifiers with `` `backticks` ``, not `"double quotes"` -
  `ARCHITECTURE.md` already calls this out as the canonical example of "looks generic but actually
  differs per engine" logic that must live in the engine's own package, not be shared.
- **Schema/database terminology.** MySQL's `information_schema` treats "database" and "schema" as the
  same thing (unlike Postgres, where one database contains multiple schemas). Qyre's
  `DatabaseOverview` shape (a list of schemas, each with tables) still applies - each MySQL database
  the connected user can see maps onto one `SchemaMetadata` entry.
- **Row count.** Prefer an exact `COUNT(*)` the way SQLite does, not MySQL's `information_schema.tables.TABLE_ROWS`
  estimate (which can be significantly stale for InnoDB tables) - correctness over a cheap estimate,
  matching this product's existing preference (SQLite's spec makes the same call for the same reason).

## Read-only enforcement

Like Postgres, MySQL (InnoDB) supports an authoritative transaction-level read-only mode:
`START TRANSACTION READ ONLY` (or `SET SESSION TRANSACTION READ ONLY` for the connection/session).
`runReadOnlyQuery` must run inside one of these, exactly matching F006's Postgres precedent (the
`assertReadOnly` string heuristic stays as a fast, user-friendly first rejection; the transaction
mode is the real backstop). Prove it the same way F006 and the SQLite spec's read-only sections did:
a test that tries to sneak a write past the string check, confirming the read-only transaction (not
the regex) is what actually stops it.

## Primary end-to-end journey

Identical to Postgres's journey, run against a MySQL fixture instead:

1. Start Qyre against a MySQL database: `npx qyre mysql://user:pass@localhost:3306/mydb`.
2. The browser UI loads and shows a connected status.
3. The UI lists databases (as schemas) and tables.
4. The user opens a table and sees its columns and a paginated page of rows.

Per `docs/product-specs/connect-and-inspect-sqlite.md`'s established precedent (see F011), this
should extend the **same** Playwright `connect-and-inspect.spec.ts` as a third project/fixture, not
a duplicated spec.

## Acceptance criteria

- Running the CLI against a reachable MySQL database results in a browser UI that shows the database
  is connected.
- The UI can list at least schemas (databases) and tables for the connected database.
- Selecting a table shows its columns and a first page of rows.
- No write/DDL/DML-mutating action is reachable from the UI or the query runner, enforced by a
  read-only transaction (see "Read-only enforcement"), not only by string matching.
- The server starts, reports healthy, and shuts down cleanly, releasing the connection pool.
- If the MySQL client library uses a connection pool, an error listener is attached so a dropped
  connection degrades `/api/health` to `"disconnected"` instead of crashing the process - the exact
  gap F007's audit fixed for Postgres must not be reintroduced here.

## Failure states

- Unreachable database: the UI shows a clear, recoverable error with the reason and a retry path
  (same as Postgres).
- Invalid connection string: the CLI fails fast with actionable guidance.
- Port already in use: same behavior as every other engine.
