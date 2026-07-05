# @qyre/sqlite

SQLite driver for Qyre. Implements the `DatabaseAdapter` contract from `@qyre/driver-contract`.

The whole connection is opened in read-only mode (`better-sqlite3`'s `readonly: true`) - the
authoritative read-only backstop, equivalent to `@qyre/postgres`'s `READ ONLY` transaction. See
[`docs/product-specs/connect-and-inspect-sqlite.md`](../../../docs/product-specs/connect-and-inspect-sqlite.md).
