# @humbdb/postgres

PostgreSQL driver for Humb. Implements the `DatabaseAdapter` contract from `@humbdb/driver-contract`.

Read-only by policy: `runReadOnlyQuery` rejects non-SELECT statements (see `read-only.ts` and
[`docs/SECURITY.md`](../../../docs/SECURITY.md)).
