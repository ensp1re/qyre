# Product Contract: Connect and Inspect (SQLite Engine)

Qyre's product promise is universal: one command, any database, auto-detected. This contract covers
the SQLite engine — the second engine Qyre supports end to end, after
[Postgres](connect-and-inspect-postgres.md). It is the single source of truth for what SQLite-engine
scope means. Anything not listed here is out of scope for this engine for now.

SQLite is architecturally different from Postgres in one important way: there is no server process
to connect to. The "target" is a local file, not a network address. Every behavior below accounts
for that difference; where Postgres's contract doesn't apply 1:1, this doc says so explicitly rather
than silently reusing Postgres language that would be misleading.

## One-sentence promise

A developer can point Qyre at a `.sqlite`/`.db` file, have it auto-recognized as SQLite with zero
credentials or connection strings, and immediately browse its structure and data in the same UI used
for every other engine.

## CLI input shape

```bash
npx qyre <path-to-sqlite-file>
# examples recognized as SQLite:
npx qyre ./app.db
npx qyre ./local.sqlite
npx qyre /absolute/path/to/data.sqlite3
```

Behavior:

- `qyre <target>` detects SQLite from the target being a filesystem path (not a URL with a
  `scheme://`) whose file exists and is a valid SQLite database, per `packages/drivers/sqlite`'s
  `AdapterFactory.supports()` - the same detection seam every other engine uses (see
  `ARCHITECTURE.md`'s "Adding a new database engine"). File extension (`.db`, `.sqlite`, `.sqlite3`)
  is a hint for error messages, not the sole detection mechanism - a valid SQLite file with any
  extension must still be recognized.
- No credentials, host, or port are ever asked for or accepted for a SQLite target.
- The rest of the launch behavior matches the Postgres contract: starts a local server on
  `QYRE_PORT` (default `7717`), opens the default browser, `Ctrl+C` shuts down cleanly.
- If the path does not exist, the CLI prints an actionable error (the resolved absolute path it
  looked for) and exits non-zero - it must not silently fall through to "engine not recognized".
- If the path exists but is not a valid SQLite file (wrong format, corrupted), the CLI says so
  explicitly rather than a generic parse failure.

## Scope

In scope (SQLite engine):

- A single local SQLite file, opened read-only, one file at a time.
- Read-only inspection: tables, columns, indexes, row counts.
- Paginated table data browsing (reuses the existing engine-agnostic UI and pagination contract -
  no new frontend work required, only the adapter).
- A read-only SQL query runner (SELECT-style statements only), reusing `@qyre/driver-contract`'s
  `ReadOnlyViolationError` and the same heuristic-scan layer as Postgres (`assertReadOnly` logic
  should be shared/generalized from `packages/drivers/postgres/src/read-only.ts`, not
  copy-pasted - see `ARCHITECTURE.md`'s rule on reusing genuinely engine-agnostic logic).
- Local server health and runtime diagnostics endpoints (reused as-is from `@qyre/server` - `/api/health`
  is engine-agnostic already).

Out of scope (for now, SQLite engine):

- Writes, schema edits, migrations, or destructive actions (same as Postgres).
- Multiple attached databases (SQLite's `ATTACH DATABASE`) - one file, one connection.
- In-memory databases (`:memory:`) - there's nothing to point a file path at.
- WAL-mode concurrent-writer scenarios where another process is actively writing to the same file -
  Qyre only needs to read safely, not coordinate with writers (see "Read-only enforcement" below).

## Concepts that don't map 1:1 from Postgres

- **No "schemas".** SQLite has a single implicit namespace (conventionally called `main`). The
  adapter's `getOverview()` must still satisfy `@qyre/core`'s `DatabaseOverview` shape (a list of
  schemas, each with tables) for the UI to work unmodified - return one schema named `main`
  containing all user tables, not an empty or fabricated multi-schema structure.
- **No "connection" in the network sense.** "Connected" in `/api/health` and `ConnectionStatus`
  means "the file was opened successfully and is a valid SQLite database," not "a socket is live."
  `ping()` should confirm the file handle still works (e.g. `SELECT 1`), which also catches the file
  having been deleted or moved out from under Qyre after launch.
- **Row count estimates.** SQLite has no `pg_class.reltuples`-style planner estimate. Row counts are
  always exact via `COUNT(*)` - acceptable because SQLite files in this tool's use case (local dev
  databases) are typically small; do not build a fake estimate mechanism to mirror Postgres.

## Read-only enforcement

Postgres's authoritative backstop is a `BEGIN TRANSACTION READ ONLY` (see F006) - the database
engine itself refuses writes, independent of the string-based `assertReadOnly` heuristic. SQLite has
no equivalent transaction-level read-only mode, but it has something stronger available at the file
level: **open the database connection itself in read-only mode** (e.g. `OPEN_READONLY` /
`mode=ro`, depending on the driver library chosen). A file handle opened read-only cannot execute a
write statement no matter what SQL text reaches it - this is the SQLite equivalent of F006's
transaction backstop, and it must be implemented the same way: as the authoritative enforcement, not
just the heuristic keyword scan. Prove it the same way F006 did: a test that tries to sneak a write
past the string check (e.g. hidden in a query that doesn't contain an obvious write keyword) and
confirms only the read-only file handle - not the regex - is what actually stops it.

## Primary end-to-end journey

The primary end-to-end journey we protect (mirrors Postgres's, adapted for a file target):

1. Start Qyre against a SQLite file: `npx qyre ./fixture.db`.
2. The browser UI loads and shows a connected status.
3. The UI lists tables (under the single `main` schema).
4. The user opens a table and sees its columns and a paginated page of rows.

This should be the **same Playwright spec** as Postgres's `connect-and-inspect.spec.ts`, parameterized
by engine/fixture, not a duplicated spec - proves the UI is genuinely engine-agnostic rather than
accidentally Postgres-shaped. Tracked separately as **F011** (`docs/FEATURES.json`): F008 covers the
backend adapter and CLI wiring, manually verified end to end over the real HTTP path (the same
contract the UI already consumes unmodified); F011 is the Playwright automation of that same journey.

## Acceptance criteria

- Running the CLI against a valid, existing SQLite file results in a browser UI that shows the
  database is connected - no credentials or flags beyond the file path required.
- The UI can list at least the `main` schema's tables for the connected database.
- Selecting a table shows its columns and a first page of rows.
- No write/DDL/DML-mutating action is reachable from the UI or the query runner, enforced by the
  database file handle itself (see "Read-only enforcement"), not only by string matching.
- The server starts, reports healthy, and shuts down cleanly, releasing the file handle.

## Failure states

- File does not exist: the CLI fails fast with the resolved path it looked for and actionable
  guidance (e.g. "did you mean a relative path from the current directory?").
- File exists but is not a valid SQLite database: the CLI/UI says so explicitly, not a generic
  connection error.
- File becomes unavailable after launch (deleted, moved, permissions changed): `/api/health` reports
  `disconnected` rather than crashing the server - the exact failure mode F007's audit fixed for
  Postgres's connection pool must not be reintroduced here for SQLite's file handle.
- Port already in use: same behavior as Postgres (CLI reports the conflict and how to override the
  port) - this is engine-agnostic, already implemented.
