# Qyre

**A local-first database IDE you launch with one command - point it at any database, no driver to
choose, no account, no heavy GUI to install.**

[![CI](https://img.shields.io/github/actions/workflow/status/ensp1re/qyre/ci.yml?branch=main&label=CI)](https://github.com/ensp1re/qyre/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/qyre.svg)](https://www.npmjs.com/package/qyre)
[![node](https://img.shields.io/badge/node-%3E%3D20.11-brightgreen.svg)](package.json)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

```bash
npx qyre postgres://user:pass@localhost:5432/mydb
# or MySQL
npx qyre mysql://user:pass@localhost:3306/mydb
# or, for SQLite - zero credentials, just a file path
npx qyre ./app.db
```

That one command detects which engine you pointed it at, starts a local server, and opens your
browser straight into a dense, VS Code-style IDE for the connection: a schema tree, a SQL editor, a
row browser, a full-database schema overview, and more - all served from your own machine.

## Screenshots

| SQL Editor                                                                                   | Schema                                                                               | Tables                                                                        |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| ![SQL Editor: a joined query with results below the editor](docs/screenshots/sql-editor.png) | ![Schema tab: every table as a card, with PK/FK badges](docs/screenshots/schema.png) | ![Tables tab: a paginated, sortable row browser](docs/screenshots/tables.png) |

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

## Quick start (development)

```bash
pnpm install
pnpm check        # format, lint, typecheck, test, build, project-state checks
pnpm dev          # run packages in watch mode
```

## Status

Qyre is role-aware: it introspects the connected user's grants, shows only allowed write
affordances, and still lets the database make the authoritative decision on every operation.

| Capability                 | Postgres                 | MySQL                    | SQLite                   | MongoDB                        |
| -------------------------- | ------------------------ | ------------------------ | ------------------------ | ------------------------------ |
| Schema and row inspection  | Yes                      | Yes                      | Yes                      | Collections and documents      |
| Query editor               | Read and write SQL       | Read and write SQL       | Read and write SQL       | Not applicable                 |
| Data editing               | Transactional grid batch | Transactional grid batch | Transactional grid batch | Typed grid, BSON-preserving    |
| Schema editing             | Tables, columns, indexes | Tables, columns, indexes | Tables, columns, indexes | Collections and indexes        |
| Database/schema management | Databases and schemas    | Databases                | Not applicable           | List and drop databases        |
| CSV import and data export | Yes                      | Yes                      | Yes                      | Yes                            |
| Access/grants viewer       | Roles and grants         | Grants and active role   | File/connection facts    | Authenticated roles/privileges |
| Forced `--read-only` mode  | Yes                      | Yes                      | Yes                      | Yes                            |

New engines plug in as independent `packages/drivers/<engine>` adapter packages and are picked up
by the same detection path - no engine selector and no engine-specific branches in the UI.

## Security: role-aware writes, database-enforced boundaries

- Every API request requires a per-session bearer token, and the server binds to `127.0.0.1` only.
- Capabilities and table permissions control affordances but are advisory. The database remains the
  final authority; native denials become safe, structured errors without leaking engine text.
- `--read-only` is a hard session ceiling across every mutating route, regardless of database
  grants. Read queries keep their engine-level read-only backstops.
- Row mutations use structured, parameterized adapter operations. Destructive SQL and DDL require
  explicit confirmation, and transactional engines commit staged grid changes atomically.
- Qyre never transmits database contents, schemas, or credentials off the local machine.

See [`docs/SECURITY.md`](docs/SECURITY.md) for the full set of rules this project holds itself to,
or [`docs/CONNECTING.md`](docs/CONNECTING.md) for per-engine connection-string formats and
troubleshooting a connection.

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
[`CONTRIBUTING.md`](CONTRIBUTING.md).

Qyre follows a strict "the repository is the spec" model. If you're an AI coding agent, start with
[`AGENTS.md`](AGENTS.md) instead - a change is only done when it is verified by runnable evidence
and the repository can still build, test, and restart cleanly.

## License

[MIT](LICENSE)
