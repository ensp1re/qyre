# Product Contract: Connect and Inspect Postgres

This is the finalized contract for Humb's first release. It is the single source of truth for what
that scope means. Anything not listed here is out of scope for now.

## One-sentence promise

A developer can run a single terminal command pointed at a Postgres database and immediately browse
its structure and data in a clean local web UI, without installing a heavy database IDE.

## CLI input shape

Humb launches against Postgres:

```bash
npx humb <postgres-connection-string>
# examples:
npx humb postgres://user:pass@localhost:5432/mydb
npx humb postgresql://localhost/mydb
```

Behavior:

- `humb <target>` parses the target, starts a local server on a default port (configurable via
  `HUMB_PORT`, default `7717`), and opens the default browser to the UI.
- If no target is provided, the CLI prints usage help and exits with a non-zero code.
- If the target cannot be parsed as a supported connection string, the CLI prints an actionable
  error explaining the expected formats and exits non-zero.
- `Ctrl+C` shuts the server down cleanly and releases the database connection pool.

### Future input shapes (not yet supported, documented for design only)

- Local file databases such as SQLite via `npx humb ./local.db` are a planned follow-up and must be
  added as a new adapter package (`db-sqlite`), not by special-casing the Postgres path.

## Scope

In scope:

- Postgres only (one connection at a time).
- Read-only inspection: schemas, tables, columns, indexes, approximate/explicit row counts.
- Paginated table data browsing.
- A read-only SQL query runner (SELECT-style statements only).
- Local server health and runtime diagnostics endpoints for verification.

Out of scope (for now):

- Writes, schema edits, migrations, or destructive actions.
- Multiple simultaneous connections.
- Authentication / multi-user / remote hosting (Humb is local-first and binds to localhost).
- Non-Postgres engines.

## Read-only vs write behavior

Humb is strictly read-only for now. Write capability is explicitly excluded and, when later
introduced, must follow the rules in [`../SECURITY.md`](../SECURITY.md): destructive actions require
explicit, unambiguous user confirmation and must never be the default path.

## First golden journey

The primary end-to-end journey we protect:

1. Start Humb against a Postgres database.
2. The browser UI loads and shows a connected status.
3. The UI lists schemas and tables.
4. The user opens a table and sees its columns and a paginated page of rows.

See [`../RELIABILITY.md`](../RELIABILITY.md) for how this journey is verified.

## Acceptance criteria

- Running the CLI against a reachable Postgres database results in a browser UI that shows the
  database is connected.
- The UI can list at least schemas and tables for the connected database.
- Selecting a table shows its columns and a first page of rows.
- No write/DDL/DML-mutating action is reachable from the UI.
- The server starts, reports healthy, and shuts down cleanly.

## Failure states

- Unreachable database: the UI shows a clear, recoverable error with the reason and a retry path.
- Invalid connection string: the CLI fails fast with actionable guidance.
- Port already in use: the CLI reports the conflict and how to override the port.
