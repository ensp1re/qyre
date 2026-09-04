# Qyre

**A local-first database IDE you launch with one command - point it at any database, no driver to
choose, no account, no heavy GUI to install.**

[![CI](https://img.shields.io/github/actions/workflow/status/ensp1re/qyre/ci.yml?branch=main&label=CI)](https://github.com/ensp1re/qyre/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/qyre.svg)](https://www.npmjs.com/package/qyre)
[![node](https://img.shields.io/badge/node-%3E%3D20.11-brightgreen.svg)](package.json)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Current release: `v0.4.4`

```bash
npx qyre postgres://user:pass@localhost:5432/mydb
# or MySQL
npx qyre mysql://user:pass@localhost:3306/mydb
# or MongoDB
npx qyre mongodb://user:pass@localhost:27017/mydb
# or, for SQLite - zero credentials, just a file path
npx qyre ./app.db

# no connection string handy? Enter details interactively:
npx qyre --login
# or start empty and connect from the browser:
npx qyre
```

That one command detects which engine you pointed it at, starts a local server bound to
`127.0.0.1`, and opens your browser straight into a dense, VS Code-style IDE for the connection.
Nothing is installed globally, nothing phones home, and closing the terminal ends the session.

## What you get

- **SQL editor** - syntax highlighting and schema-aware autocomplete (keywords, tables, columns),
  a non-executing EXPLAIN plan view, query history you can re-load with one click, CSV/JSON result
  export, and Ctrl/Cmd+Enter to run. Destructive statements (DROP, DELETE without WHERE, ...)
  require an explicit confirmation step.
- **Tables** - a spreadsheet-style row browser with per-column filters, server-side sorting and
  pagination, and inline editing: typed editors per column type (temporal, numeric, boolean, enum,
  JSON, arrays, binary, and more), Add/Duplicate row, staged deletes, and a commit bar that
  previews every pending statement before anything is written. Transactional engines commit the
  whole batch atomically.
- **Schema** - an interactive graph of every table with primary-key badges and foreign-key edges
  (plus a compact grid view), and schema editing: create tables, add/alter/drop columns, and
  manage indexes where your role allows it.
- **Data transfer** - CSV import with a validating preview, CSV/JSON export of tables and query
  results.
- **Role-aware by design** - Qyre introspects what your database user may actually do and shows
  only those affordances: a read-only role sees no write controls at all, and the database always
  stays the final authority.
- **Database switching** - jump between databases on the same server (or recent connections) from
  a drawer, without restarting the CLI.
- **The small things** - dark and light themes, a console log of every operation Qyre ran, an
  opt-in Files tab for browsing local `.sql` files, and keyboard-first navigation throughout.

## Screenshots

| SQL Editor                                                                                   | Schema                                                                                                 | Tables                                                                                             |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| ![SQL Editor: a joined query with results below the editor](docs/screenshots/sql-editor.png) | ![Schema tab: an interactive graph of tables with FK edges and PK badges](docs/screenshots/schema.png) | ![Tables tab: a typed, editable row browser with filters and Add row](docs/screenshots/tables.png) |

## Supported engines

| Engine   | Target format                       | Notes                                              |
| -------- | ----------------------------------- | -------------------------------------------------- |
| Postgres | `postgres://user:pass@host:5432/db` | Full SQL, schemas, roles and grants                |
| MySQL    | `mysql://user:pass@host:3306/db`    | Full SQL, grants and active role                   |
| SQLite   | `./path/to/file.db`                 | Zero credentials - just the file path              |
| MongoDB  | `mongodb://user:pass@host:27017/db` | Collections, documents, typed BSON-preserving grid |

The engine is detected from the target - there is no engine selector. `mongodb+srv://` Atlas
targets work too. See [`docs/CONNECTING.md`](docs/CONNECTING.md) for per-engine formats, auth
parameters, and connection troubleshooting.

## Why not just use \_\_\_?

- **pgAdmin / DBeaver / a full desktop DB IDE** - heavy installs, an account or a project file to
  set up, and usually locked to one engine's ecosystem. Qyre is `npx qyre <target>` and a browser
  tab; nothing to install, nothing tied to a specific engine's tooling.
- **`psql` / a database's own CLI** - great for scripting, not for visually scanning a schema,
  browsing rows, or spotting a foreign key at a glance. Qyre complements the CLI rather than
  replacing it: role-aware safety, explicit write workflows, and a UI built for looking as well as
  changing data.
- **A cloud-hosted database GUI** - your connection string and query results leave your machine.
  Qyre binds to `localhost` only and never phones home (see "Security" below) - your data never
  leaves your machine.

Qyre isn't trying to be a heavier IDE with more buttons. It's trying to be the thing you reach for
when you just need to look at a database _right now_, regardless of which engine it is.

## CLI reference

```
qyre [target] [options]
```

| Option              | What it does                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `[target]`          | Connection string or SQLite file path. Omit it to start empty and connect from the browser.      |
| `--login`           | Guided interactive setup - engine, user, password, host, port, database - instead of a URL.      |
| `--read-only`       | Force the entire session read-only, regardless of what your database role would otherwise allow. |
| `-p, --port <port>` | Port for the local server (also `QYRE_PORT`).                                                    |
| `--files-dir <dir>` | Directory the Files tab may read `.sql` files from. Opt-in; disabled by default.                 |
| `--verbose`         | Log every HTTP request instead of only warnings and errors.                                      |
| `-v, --version`     | Print the installed version and exit.                                                            |
| `-h, --help`        | Print usage and exit.                                                                            |

Tip: if `npx postgres://...` errors with `EUNSUPPORTEDPROTOCOL`, you dropped the package name -
npx tried to install the URL. It's `npx qyre <url>`, or just `npx qyre --login`.

## How it works

The CLI parses your target, picks the matching adapter (`packages/drivers/<engine>`), and starts a
local Fastify server that serves the bundled React UI and a JSON API - the browser never talks to
your database directly, and the server only ever binds to loopback. Each engine is an independent
adapter package behind one shared contract, so new engines plug in without an engine selector or
engine-specific UI branches, and a shared conformance suite defines what "behaves like the
existing four" means.

## Status

Qyre is role-aware: it introspects the connected user's grants, shows only allowed write
affordances, and still lets the database make the authoritative decision on every operation.

| Capability                 | Postgres                 | MySQL                    | SQLite                   | MongoDB                     |
| -------------------------- | ------------------------ | ------------------------ | ------------------------ | --------------------------- |
| Schema and row inspection  | Yes                      | Yes                      | Yes                      | Collections and documents   |
| Query editor               | Read and write SQL       | Read and write SQL       | Read and write SQL       | Not applicable              |
| Data editing               | Transactional grid batch | Transactional grid batch | Transactional grid batch | Typed grid, BSON-preserving |
| Schema editing             | Tables, columns, indexes | Tables, columns, indexes | Tables, columns, indexes | Collections and indexes     |
| Database/schema management | Databases and schemas    | Databases                | Not applicable           | List and drop databases     |
| CSV import and data export | Yes                      | Yes                      | Yes                      | Yes                         |
| Forced `--read-only` mode  | Yes                      | Yes                      | Yes                      | Yes                         |

New engines plug in as independent `packages/drivers/<engine>` adapter packages and are picked up
by the same detection path - no engine selector and no engine-specific branches in the UI.

## Security: role-aware writes, database-enforced boundaries

- Every API request requires a per-session bearer token, and the server binds to `127.0.0.1` only.
- Capabilities and table permissions control affordances but are advisory. The database remains the
  final authority; native denials become safe, structured errors without leaking engine text.
- `--read-only` is a hard session ceiling across every mutating route, regardless of database
  grants. Read queries keep their engine-level read-only backstops (read-only transactions on
  Postgres/MySQL, `PRAGMA query_only` on SQLite), and Qyre's own statement classifier additionally
  rejects the writes those backstops permit - notably `SELECT ... INTO OUTFILE`, which writes a
  file on a MySQL server from inside a read-only transaction.
- Row mutations use structured, parameterized adapter operations. Destructive SQL and DDL require
  explicit confirmation, and transactional engines commit staged grid changes atomically.
- Qyre never transmits database contents, schemas, or credentials off the local machine.

See [`docs/SECURITY.md`](docs/SECURITY.md) for the full set of rules this project holds itself to,
[`SECURITY.md`](SECURITY.md) for reporting a vulnerability, or
[`docs/CONNECTING.md`](docs/CONNECTING.md) for per-engine connection-string formats and
troubleshooting a connection.

## Quick start (development)

```bash
pnpm install
pnpm check        # format, lint, typecheck, test, build, project-state checks
pnpm dev          # run packages in watch mode
```

Full setup - Node version, the Docker test-database stack, E2E suites - is in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Repository map

This repo is optimized to be legible to both humans and AI coding agents.

- [`AGENTS.md`](AGENTS.md) - start here if you are an agent. Short routing layer into the docs.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) - system map, layers, and package boundaries.
- [`FRONTEND.md`](FRONTEND.md) - UI rules and constraints.
- [`docs/`](docs/) - the system of record: product specs, plans, quality, reliability, security.
- [`apps/web`](apps/web) - the browser UI.
- [`packages/`](packages/) - CLI, server, core contracts, database adapters, UI kit, and config.

## Contributing

Setting up locally, running the test stack, and submitting a change: see
[`CONTRIBUTING.md`](CONTRIBUTING.md). New engine drivers are the ideal first contribution -
adapters are additive by design.

Qyre follows a strict "the repository is the spec" model. If you're an AI coding agent, start with
[`AGENTS.md`](AGENTS.md) instead - a change is only done when it is verified by runnable evidence
and the repository can still build, test, and restart cleanly.

## License

[MIT](LICENSE)
