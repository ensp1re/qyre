# @qyre/postgres

PostgreSQL driver for Qyre. Implements the `DatabaseAdapter` contract from `@qyre/driver-contract`.

Read-only by policy: `runReadOnlyQuery` rejects non-SELECT statements (see `read-only.ts` and
[`docs/SECURITY.md`](../../../docs/SECURITY.md)).
