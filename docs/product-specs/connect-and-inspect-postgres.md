# Product Contract: Connect and Inspect (Postgres Engine)

Qyre's product promise is universal: one command, any database, auto-detected. This contract covers
the Postgres engine specifically — the first engine Qyre supports end to end. It is the single
source of truth for what Postgres-engine scope means. Anything not listed here is out of scope for
this engine for now; it does not limit what other engines will eventually support.

## One-sentence promise

A developer can run a single terminal command pointed at a database, have Qyre automatically
recognize it's Postgres, and immediately browse its structure and data in a clean local web UI,
without installing a heavy database IDE or picking a driver.

## CLI input shape

Qyre launches against a database target and detects the engine from the target itself:

```bash
npx qyre <database-connection-string>
# examples recognized as Postgres today:
npx qyre postgres://user:pass@localhost:5432/mydb
npx qyre postgresql://localhost/mydb
```

Behavior:

- `qyre <target>` detects the database engine from the target (e.g. the `postgres://`/`postgresql://`
  scheme), parses it with that engine's adapter, starts a local server on a default port
  (configurable via `--port` or `QYRE_PORT`, default `7717`), and opens the default browser to the UI.
  Both must be an integer from 0 to 65535; an invalid `QYRE_PORT` fails startup with a clear error.
  Port `0` binds an OS-assigned free port, and the banner and browser use the bound port.
- If no target is provided, the CLI prints usage help and exits with a non-zero code.
- If the target's engine is recognized but not yet supported (see `packages/drivers/<engine>` in
  `ARCHITECTURE.md`), the CLI says so explicitly rather than treating it as a parse failure.
- If the target cannot be parsed or its engine cannot be determined at all, the CLI prints an
  actionable error explaining the expected formats and exits non-zero.
- `Ctrl+C` shuts the server down cleanly and releases the current database connection pool,
  including one the browser switched to after startup.

### Future engines (not yet supported, documented for design only)

- Additional engines (e.g. SQLite via `npx qyre ./local.db`, MySQL, etc.) are planned and must be
  added as new `packages/drivers/<engine>` packages (`sqlite`, `mysql`, ...) picked up by the same
  auto-detection path, never by special-casing the Postgres path.

## Scope

In scope (Postgres engine):

- Postgres, one connection at a time.
- Read-only inspection: schemas, tables, columns, indexes, approximate/explicit row counts. A
  relation whose exact count fails (no `SELECT` grant, an unpopulated materialized view) reports an
  unknown row count rather than failing the catalog. Primary and foreign keys come from
  `pg_constraint`, pairing composite key columns by position; enum columns are recognized from the
  type catalog (`typtype = 'e'`), not from the type's name.
- Paginated table data browsing.
- A read-only SQL query runner (SELECT-style statements only).
- Local server health and runtime diagnostics endpoints for verification.

Out of scope (for now, Postgres engine):

- Writes, schema edits, migrations, or destructive actions.
- Multiple simultaneous connections.
- Authentication / multi-user / remote hosting (Qyre is local-first and binds to localhost).
- Engines other than Postgres (tracked separately as each `packages/drivers/<engine>` package ships).

## Read-only vs write behavior

`--read-only` sessions and users without write grants stay read-only. Writes are grant-gated and
follow [`permissions-and-capabilities.md`](permissions-and-capabilities.md),
[`row-editing.md`](row-editing.md), and [`../SECURITY.md`](../SECURITY.md): destructive actions
require explicit, unambiguous user confirmation and must never be the default path.

## Primary end-to-end journey

The primary end-to-end journey we protect:

1. Start Qyre against a Postgres database.
2. The browser UI loads and shows a connected status.
3. The UI lists schemas and tables.
4. The user opens a table and sees its columns and a paginated page of rows.

See [`../RELIABILITY.md`](../RELIABILITY.md) for how this journey is verified.

## Acceptance criteria

- Running the CLI against a reachable Postgres database results in a browser UI that shows the
  database is connected.
- The UI can list at least schemas and tables for the connected database.
- Selecting a table shows its columns and a first page of rows.
- No write/DDL/DML-mutating action is reachable from the UI unless the connected user's grants
  allow it and the session is not `--read-only`.
- The server starts, reports healthy, and shuts down cleanly.

## Failure states

- Unreachable database: the UI shows a clear, recoverable error with the reason and a retry path.
- Invalid connection string: the CLI fails fast with actionable guidance.
- Port already in use: the CLI reports the conflict and how to override the port.
