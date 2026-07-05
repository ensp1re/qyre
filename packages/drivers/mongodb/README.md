# @qyre/mongodb

MongoDB driver for Qyre. Implements the `DatabaseAdapter` contract from `@qyre/driver-contract`,
scoped to basic read-only browsing (databases, collections, documents) - see
[`docs/product-specs/connect-and-inspect-mongodb.md`](../../../docs/product-specs/connect-and-inspect-mongodb.md)
for why this engine's contract is narrower than the SQL engines'.

Read-only by policy, not by driver/server enforcement: `runReadOnlyQuery` always throws (there is
no query runner for Mongo in this pass), and the adapter's own code path never calls a Mongo write
API - see that spec's "Read-only enforcement" section for why this guarantee is weaker than the SQL
engines' transaction/file-mode backstops.
