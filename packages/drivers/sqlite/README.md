# @humb/sqlite

SQLite driver for Humb. Implements the `DatabaseAdapter` contract from `@humb/driver-contract`.

The whole connection is opened in read-only mode (`better-sqlite3`'s `readonly: true`) - the
authoritative read-only backstop, equivalent to `@humb/postgres`'s `READ ONLY` transaction. See
[`docs/product-specs/connect-and-inspect-sqlite.md`](../../../docs/product-specs/connect-and-inspect-sqlite.md).
