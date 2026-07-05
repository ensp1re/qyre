# Qyre

**A local-first database IDE you launch with one command - point it at any database, no driver to
choose, no account, no heavy GUI to install.**

[![CI](https://img.shields.io/github/actions/workflow/status/ensp1re/qyre/ci.yml?branch=main&label=CI)](https://github.com/ensp1re/qyre/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/qyre.svg)](https://www.npmjs.com/package/qyre)
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
  replacing it: same read-only safety, a UI built for looking, not just querying.
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

Postgres, MySQL, and SQLite are all fully supported engines today: connect, browse the schema
(tables, columns, indexes, primary/foreign keys, row counts), page through rows, run read-only SQL
queries, browse `.sql` files near the launch target, and watch a live log of recent connection/query
activity. MongoDB is also supported for basic read-only browsing (schemas/collections, documents,
pagination) - no SQL dialect, so it has no query runner (browse collections directly instead). New
engines plug in as independent `packages/drivers/<engine>` adapter packages and are picked up by the
same detection path - no changes to the CLI, server, or UI.

## Security: read-only today, enforced by the database itself

Today, Qyre is strictly read-only, and that's not enforced by just an app-level string check you
could work around with a clever query:

- Every query is scanned and rejected up front if it isn't `SELECT`/`WITH`/`EXPLAIN`/`SHOW`/
  `TABLE`/`VALUES` - but that scan is only the first layer.
- The authoritative backstop is the database connection itself. Postgres and MySQL queries run
  inside a real `READ ONLY` transaction; SQLite's connection is opened with `readonly: true`. Even
  a disguised write - a writable CTE, a stored function that hides a `DELETE` behind an innocuous
  `SELECT` - gets refused by the database, not by Qyre's string check.
- Qyre binds to `127.0.0.1` only and never transmits your database's contents, schema, or
  credentials anywhere off your machine.

Read-only is a deliberate first phase, not a permanent ceiling: inspection has to be rock-solid
before any write/mutation feature is even considered (see
[`docs/PRODUCT_SENSE.md`](docs/PRODUCT_SENSE.md)'s "Read before write" rule). A future full
IDE-style write experience - creating tables, managing users/roles, and the like - is on the
roadmap, but it'll ship as its own carefully-scoped feature with explicit confirmation and
permission scoping, not a quiet loosening of what's described above.

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
