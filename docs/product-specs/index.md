# Product Specs Index

User-facing behavior specs. Each spec describes observable behavior and acceptance criteria so a
fresh agent can discover product scope quickly.

Humb's product is a universal database inspector: one CLI command auto-detects the target's engine
and opens a web UI for it. Each engine gets its own spec once supported; specs below describe a
single engine's behavior, not the whole product.

## Active Specs

- [`connect-and-inspect-postgres.md`](connect-and-inspect-postgres.md) - the Postgres engine
  contract, and the first engine this product supports end to end.
- [`connect-and-inspect-sqlite.md`](connect-and-inspect-sqlite.md) - the SQLite engine contract
  (F008, not yet implemented). File-based, no server/credentials - documents where it diverges from
  the Postgres contract (no schemas, no network "connection", file-handle-level read-only
  enforcement instead of a `READ ONLY` transaction).

## Rules

- Specs describe user-visible behavior and acceptance criteria, not implementation details.
- If implementation diverges from a spec, update one of them in the same session.
- Keep this index current.
