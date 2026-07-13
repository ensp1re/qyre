# @qyre/mysql

MySQL driver for Qyre. Implements the `DatabaseAdapter` contract from `@qyre/driver-contract`.

Role-aware capabilities include active-role grants and gate optional row-mutation, DDL, and
database-admin APIs. Read statements still use a `START TRANSACTION READ ONLY` backstop; writes use
parameterized adapter paths and MySQL remains authoritative. See
[`docs/SECURITY.md`](../../../docs/SECURITY.md).
