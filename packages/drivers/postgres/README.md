# @humb/postgres

PostgreSQL driver for Humb. Implements the `DatabaseAdapter` contract from `@humb/driver-contract`.

Read-only by policy: `runReadOnlyQuery` rejects non-SELECT statements (see `read-only.ts` and
[`docs/SECURITY.md`](../../../docs/SECURITY.md)).
