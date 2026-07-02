# Plan 0002: SQLite Engine

Status: Active
Owner: unassigned
Linked features: F008, F011 (`docs/FEATURES.json`)

## Objective

Add SQLite as Humb's second engine (`npx humb ./app.db`), proving the driver-plugin architecture
(`packages/drivers/<engine>`) is genuinely reusable rather than accidentally Postgres-shaped, and
generalizing `@humb/core`'s connection-target parsing from Postgres-only to engine-detecting.

## Scope

In scope: F008 (backend adapter + CLI wiring) and F011 (Playwright e2e coverage, split out - see
F008's evidence in `docs/FEATURES.json`).

Out of scope: remote SQLite/Turso URLs (open product decision, not yet made - see
`.local/suggestions.md`, not agent-loaded), multiple attached databases, writes (same as Postgres).

## Verification path

- F008: `pnpm --filter @humb/core test && pnpm --filter @humb/driver-contract test && pnpm --filter @humb/sqlite test && pnpm --filter humb test`, plus manual live verification of the real HTTP path (no CI service dependency - SQLite is just a local file).
- F011: `pnpm test:e2e:full` (once the SQLite fixture is wired into `e2e/server.ts`).
- Re-verify Postgres is unaffected: `pnpm --filter @humb/postgres test` (with `HUMB_TEST_DATABASE_URL`), `pnpm test:e2e:full`, `pnpm test:e2e`.

## Risks and blockers

- `@humb/core`'s `parseConnectionTarget` was Postgres-only (hard-threw for any non-Postgres-URL
  input) - this was the real blocker to a second engine ever reaching `AdapterFactory.supports()`,
  not just a missing driver package. Generalizing it is the one change every future engine depends
  on; get it right once rather than special-casing per engine.
- `better-sqlite3` requires a native build (`pnpm install` compiles it) - added to
  `onlyBuiltDependencies` in root `package.json`. No CI risk expected (prebuilt binaries exist for
  common platforms), but worth watching on the first CI run after this lands.

## Progress log

- 2026-07-02: Implemented F008.
  - **`@humb/core`**: `parseConnectionTarget` no longer assumes Postgres - it now checks for a
    Postgres URL, a `file:` URL, or (the common case) a bare non-URL-shaped string treated as a
    candidate SQLite path, checked for existence at the parse boundary (fail-fast, matching
    Postgres's fail-fast-on-invalid-input behavior). `DatabaseEngine` gained `"sqlite"`.
  - **`@humb/driver-contract`**: moved `assertReadOnly`/`ReadOnlyViolationError`'s implementation
    here from `@humb/postgres` (it was already pure text scanning, no Postgres-specific SQL) so
    SQLite reuses it instead of duplicating it - `@humb/postgres` now re-exports from
    `@humb/driver-contract` instead of defining it locally. All 14 existing tests moved with it and
    still pass; re-verified `@humb/postgres`'s own suite (11/11) and the full Postgres
    connect-and-inspect journey are unaffected.
  - **`packages/drivers/sqlite`** (`@humb/sqlite`, new package): `better-sqlite3`-backed adapter.
    The whole connection is opened `readonly: true` in `connect()` - the authoritative read-only
    backstop, equivalent to `@humb/postgres`'s `READ ONLY` transaction (SQLite has no writable-CTE
    or stored-procedure equivalent for a string-scan bypass to hide behind, so a read-only file
    handle is both necessary and sufficient here). Verified this live: a direct second `Database`
    handle against the same file, opened readonly, genuinely refuses a raw `DELETE`
    ("attempt to write a readonly database"), independent of `assertReadOnly` entirely. Single
    implicit `"main"` schema (SQLite has no schema concept); exact `COUNT(*)` row counts (no
    `reltuples`-style estimate exists in SQLite); indexes via `PRAGMA index_list`/`index_info`,
    primary-key membership via `PRAGMA table_info`'s `pk` column (not every PK has an explicit index
    row - an `INTEGER PRIMARY KEY` rowid alias doesn't, a composite `PRIMARY KEY (a, b)` does -
    verified both cases with a real fixture before trusting the assumption).
  - **`packages/cli`**: registers `sqliteAdapterFactory` alongside `postgresAdapterFactory` in
    `resolveAdapter()`; updated the `--help` text.
  - **`packages/server`**: fixed a real bug caught during live verification, not just inspection -
    the health endpoint's `redactConnectionString(target.raw)` call assumed every target was a URL,
    so a SQLite file path (not a URL) came back as `<unparseable connection string>` in
    `/api/health` instead of the actual path. Fixed by skipping URL-based redaction for
    `engine === "sqlite"` (a filesystem path has no embedded credentials to redact).
  - Manually verified the entire real HTTP path end to end (built CLI, real SQLite fixture file):
    `/api/health` (connected, unredacted path), `/api/overview` (single `main` schema),
    `/api/tables/main/<table>` (columns/PK/rowCount), `/api/tables/main/<table>/rows` (pagination),
    `/api/query` (a read-only SELECT succeeds; a DELETE is rejected with 400, not 500, and the data
    is untouched), and clean `SIGINT` shutdown.
  - Split the Playwright e2e coverage out as F011 rather than pushing it through in the same pass
    (per `docs/PLANS.md`'s splitting rule) - it needs `e2e/server.ts` to start against either engine
    depending on the run, which is a distinct slice of work from the adapter/CLI itself.

## Open decisions

- Whether/how to support remote SQLite (a downloaded `.db` over HTTP(S)) or Turso/libSQL
  (`libsql://` URLs) - surfaced but not decided; see `.local/suggestions.md` (not agent-loaded).
  F008 as implemented is local-file-only.
- Whether F011's `e2e/server.ts` should take an engine/fixture flag, or whether SQLite gets its own
  lightweight webServer entry - decide when F011 is picked up.
