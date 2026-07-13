# @qyre/postgres

PostgreSQL driver for Qyre. Implements the `DatabaseAdapter` contract from `@qyre/driver-contract`.

Role-aware capabilities gate optional row-mutation, DDL, and database-admin APIs. Read statements
still use `runReadOnlyQuery`'s real read-only transaction; writes use parameterized adapter paths
and the database remains authoritative. See [`docs/SECURITY.md`](../../../docs/SECURITY.md).
