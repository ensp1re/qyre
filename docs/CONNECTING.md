# Connecting to a database

A user-facing reference for connection-string formats and common connection problems. If you're
looking for how the codebase is organized instead, see [`AGENTS.md`](../AGENTS.md).

## Connection string formats

Run `npx qyre <target>` with one of:

| Engine   | Format                                                            | Example                                    |
| -------- | ----------------------------------------------------------------- | ------------------------------------------ |
| Postgres | `postgres://user:pass@host:port/database`                         | `postgres://user:pass@localhost:5432/mydb` |
| MySQL    | `mysql://user:pass@host:port/database`                            | `mysql://user:pass@localhost:3306/mydb`    |
| MongoDB  | `mongodb://[user:pass@]host:port/database` or `mongodb+srv://...` | `mongodb://localhost:27017/mydb`           |
| SQLite   | a path to an existing file (no credentials)                       | `./app.db`, `/absolute/path/data.sqlite`   |

Qyre detects the engine from the target itself - `postgresql://` works the same as `postgres://`,
and anything that isn't a recognized URL scheme is treated as a candidate SQLite file path (it must
already exist; Qyre never creates a database file for you).

A password or other credential can also be passed as a query parameter (e.g. `?password=...`) if
your setup needs that form instead of `user:pass@host` - Qyre redacts it the same way in any logs
or diagnostics either way (see [`docs/SECURITY.md`](SECURITY.md)).

## Troubleshooting

**"No file found at ..."** - the SQLite path you gave doesn't exist. Qyre only opens existing
files; check the path is correct relative to where you ran `npx qyre` from, or use an absolute
path.

**"Unsupported database target protocol"** - the URL scheme wasn't recognized. Double-check it's
one of `postgres://`, `postgresql://`, `mysql://`, `mongodb://`, or `mongodb+srv://`, or a plain
file path for SQLite.

**Connection refused / timeout** - Qyre couldn't reach the database at all. Confirm the
host/port are correct and the database is actually running and accepting connections from where
you're running `qyre` (e.g. a database only listening on `127.0.0.1` inside a container won't be
reachable from your host without a published port).

**Authentication failed** - the username/password in the connection string are wrong, or the user
doesn't have permission to connect to that database/schema. The connecting user needs at least
read access; write and schema-editing affordances appear only for grants Qyre can introspect, while
the database rechecks the real permission on every attempt.

**The status bar says "disconnected" but I just connected fine** - Qyre polls the connection every
few seconds and will recover automatically once the database is reachable again; a transient
network blip doesn't need a restart. If it stays disconnected, check the database is still running.

**A write query is rejected as read-only** - see the next section. The connected role, database
state, connection mode, or Qyre's `--read-only` flag can all deliberately make a session read-only.

## The role-aware / local-first security model

Qyre shows write features only when the connected role and engine report support for them. Those
capabilities are advisory; the database remains authoritative, and a native denial is returned as
a redacted structured error.

Read statements always use the engine's read-only execution path. Write-capable SQL sessions
classify mutation/DDL/destructive statements separately, with destructive statements requiring an
explicit confirmation round-trip. Launching with `--read-only` overrides all grants and rejects
every mutating route before its handler runs.

Qyre binds to `127.0.0.1` only and never transmits your database's contents, schema, or credentials
anywhere off your machine - there's no telemetry and no external network calls. See
[`docs/SECURITY.md`](SECURITY.md) for the full set of rules this project holds itself to.
