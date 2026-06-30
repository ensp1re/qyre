# @humb/db-postgres

PostgreSQL adapter for Humb. Implements the `DatabaseAdapter` contract from `@humb/db-adapter`.

Read-only by policy: `runReadOnlyQuery` rejects non-SELECT statements (see `read-only.ts` and
[`docs/SECURITY.md`](../../docs/SECURITY.md)).
