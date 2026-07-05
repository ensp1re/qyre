# @qyre/mysql

MySQL driver for Qyre. Implements the `DatabaseAdapter` contract from `@qyre/driver-contract`.

Read-only by policy: `runReadOnlyQuery` rejects non-SELECT statements (see
[`docs/SECURITY.md`](../../../docs/SECURITY.md)), backed by a `START TRANSACTION READ ONLY`
transaction as the authoritative enforcement, not just the shared string heuristic.
