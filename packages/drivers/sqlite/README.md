# @qyre/sqlite

SQLite driver for Qyre. Implements the `DatabaseAdapter` contract from `@qyre/driver-contract`.

The connection opens normally when the file and directory are writable, enabling structured row
mutations and DDL; file/directory/open-mode facts gate capabilities. Read queries temporarily use
`PRAGMA query_only` as their authoritative backstop. See
[`docs/product-specs/connect-and-inspect-sqlite.md`](../../../docs/product-specs/connect-and-inspect-sqlite.md).
