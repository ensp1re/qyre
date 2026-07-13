# @qyre/mongodb

MongoDB driver for Qyre. Implements the `DatabaseAdapter` contract from `@qyre/driver-contract`,
including collection/document browsing, whole-document Extended JSON editing, collection/index
DDL, and supported database administration - see
[`docs/product-specs/connect-and-inspect-mongodb.md`](../../../docs/product-specs/connect-and-inspect-mongodb.md)
for why this engine's contract is narrower than the SQL engines'.

MongoDB has no SQL query runner. Its authenticated privilege actions drive capabilities and
per-collection permissions; the server's `--read-only` guard can still force the whole session
read-only regardless of those grants.
