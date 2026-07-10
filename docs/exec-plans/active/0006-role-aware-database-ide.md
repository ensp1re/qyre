# Plan 0006: Role-Aware Database IDE (read-only MVP -> full IDE)

Status: Planned - no slice started.
Owner: unassigned
Linked features: F090-F121 (`docs/FEATURES.json`)

## Objective

Evolve Qyre from an intentionally read-only inspector into a complete, role-aware database IDE.
The application introspects what the connected database user is actually permitted to do and
exposes exactly that experience: a read-only user keeps today's polished read-only workflow
(unchanged, still the safe default), while users with broader grants progressively gain row
editing, arbitrary SQL execution, schema (DDL) management, and database administration - across
PostgreSQL, MySQL, SQLite, and MongoDB, and extensible to future engines.

## Architecture decisions (settled during planning; revisit only with cause)

1. **Two-tier capability model, advisory not authoritative.**
   - Tier 1 `ConnectionCapabilities` (session-level, fetched at connect and on reconnect): an
     `access` summary plus feature flags extending the existing `AdapterCapabilities` pattern
     (F063): `supportsSql` (existing), `supportsRowMutations`, `supportsDdl`,
     `supportsIndexManagement`, `supportsDatabaseManagement`, `supportsTransactions`, and a
     `readOnlyReason` (`"qyre-flag" | "replica" | "connection" | "grants" | null`).
   - Tier 2 `TablePermissions` (per-table `select/insert/update/delete` booleans) attached to
     `TableMetadata` by each engine's introspection.
   - **The database is always the authoritative enforcer.** Introspection only drives UI
     affordances and server-side pre-checks; grants can change mid-session, and some mechanisms
     (Postgres RLS, column grants) are invisible to coarse introspection. Engine
     "permission denied" errors must map to friendly, actionable messages (F120), never crashes.
2. **Contract grows by optional capability namespaces, not engine branches.**
   `DatabaseAdapter` gains required `getCapabilities()` plus optional namespaces:
   `mutations?: RowMutationApi` (insert/update/delete by key), `ddl?: SchemaDdlApi`
   (tables/columns/indexes + type catalog), `admin?: DatabaseAdminApi` (databases/schemas,
   roles viewer). Namespace absent = the engine cannot do it (flag false); namespace present but
   grants missing = the user cannot do it (flag/permission false). The server gates on both
   (defense in depth). No `engine === "x"` branching anywhere outside adapter packages.
3. **Row mutations are structured operations, not browser-built SQL** - mirroring how filters were
   done (F072): the browser sends typed JSON (values, key match), each adapter translates to
   parameterized SQL or MongoDB collection ops. Row identity requires a primary key (MongoDB:
   `_id`); tables without one are read-only in the grid, with the reason surfaced. Raw SQL writes
   exist only in the SQL editor path (decision 5).
4. **Pending-changes buffer with explicit commit** (TablePlus model): grid edits/inserts/deletes
   stage locally, show a preview of the generated statements/ops, and apply via one batch commit
   endpoint - transactional (all-or-nothing) on Postgres/MySQL/SQLite, ordered best-effort with
   per-op error reporting on MongoDB (documented in the row-editing spec).
5. **SQL editor write path via statement classification.** A shared `classifyStatement`
   (driver-contract, generalizing `assertReadOnly`'s scanner) labels statements
   read / mutation / ddl / destructive. Write-capable sessions run any statement; destructive
   classes (DROP/TRUNCATE/DELETE-or-UPDATE-without-WHERE/ALTER) require an explicit confirmed
   round-trip the server enforces - an unconfirmed destructive statement is rejected server-side,
   not just hidden client-side.
6. **Qyre-level read-only mode stays first-class.** `--read-only` CLI flag forces today's behavior
   regardless of database grants, enforced by one central server guard (single choke point all
   mutating routes pass through), with a visible UI badge. Read-only databases/users get the same
   guard automatically from introspection.
7. **Every mutation is audited** in the existing EventLog/Console (operation, target, row counts,
   duration, outcome). No off-machine telemetry, per SECURITY.md.
8. **No rewrite.** Existing routes, adapters, UI features, and the read-only enforcement stack
   (`assertReadOnly` + engine-level READ ONLY transactions) stay as-is for read paths. All work is
   additive; the only refactors are extracting `classifyStatement` from `read-only.ts` and
   extending `AdapterCapabilities`.

## Per-engine permission introspection matrix

| Engine   | Session tier                                                                                                                             | Per-table tier                                                                           | Restricted fixture                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Postgres | `pg_is_in_recovery()`, `default_transaction_read_only`, role attrs (`pg_roles`), `has_database_privilege`/`has_schema_privilege(CREATE)` | `has_table_privilege(current_user, t, 'SELECT/INSERT/UPDATE/DELETE')` batched per schema | `qyre_readonly` user, SELECT-only grants         |
| MySQL    | `@@global.read_only`, `@@session.transaction_read_only`, `information_schema.USER_PRIVILEGES`/`SCHEMA_PRIVILEGES`                        | `information_schema.TABLE_PRIVILEGES` + schema-level grants fallback                     | `qyre_readonly` user, SELECT-only grants         |
| SQLite   | file + directory writability (WAL/journal need dir write), `PRAGMA query_only`, read-only open flag                                      | uniform: whole file is writable or not                                                   | read-only file copy / `?mode=ro` target          |
| MongoDB  | `connectionStatus{showPrivileges:true}` -> authenticatedUserPrivileges action sets; unauthenticated local = full access                  | map `find/insert/update/remove` actions per db/collection resource                       | user with built-in `read` role on the fixture db |

Introspection failures (old engine versions, missing catalog access) degrade to read-only with a
logged warning - never to assumed-writable.

## Feature order and dependencies

- **Phase A - capability/permission foundation: F090 (spec) -> F091 (core+contract+server+web
  plumbing) -> F092/F093/F094/F095 (per-engine introspection + restricted fixtures, parallelizable)
  -> F096 (`--read-only` + central guard) -> F097 (permission-aware UI shell + e2e guard).**
- **Phase B - row editing: F098 (spec) -> F099 (insert) -> F100 (update) -> F101 (delete) ->
  F102 (batch commit) -> F103 (editable grid) -> F104 (insert/duplicate UI) -> F105 (delete +
  commit bar UI).**
- **Phase C - SQL editor write mode: F106 (classifyStatement) -> F107 (runQuery + server
  confirmation contract) -> F108 (editor UI).** Depends on Phase A only; can interleave with B.
- **Phase D - schema editing: F109 (spec) -> F110 (table lifecycle) -> F111 (column ops) ->
  F112 (indexes) -> F113 (table designer UI) -> F114 (structure tab UI).** Depends on A; UI
  reuses B's confirmation patterns.
- **Phase E - admin and data flows: F115 (database/schema lifecycle) -> F116 (database mgmt UI)
  -> F117 (CSV import; needs F099) -> F118 (JSON/SQL export; independent, read-only-safe) ->
  F119 (roles/grants viewer).**
- **Phase F - hardening: F120 (denial mapping + capability refresh) -> F121 (full role-matrix
  E2E + docs consolidation).** F121 is the plan's exit gate.

Every adapter-facing slice ships `@qyre/testing-conformance` cases across all four engines
(cross-engine parity rule, AGENTS.md), explicitly stating not-applicable engines. Every slice ends
with `pnpm verify:pr` and a PR per the standard delivery workflow.

## Scope and out-of-scope

In scope: everything in F090-F121. Out of scope (deliberate, revisit after F121): a MongoDB
query/aggregation editor (supportsSql stays false), user/role _management_ (F119 is a viewer),
multi-connection simultaneous sessions, query plan visualization, stored-procedure editing,
`--demo` mode (tracked in tech-debt), collaborative/remote features (violates local-first).

## Verification path

- Per-slice: the feature's `verification` command, then `pnpm verify:pr` (Docker stack, checks,
  smoke + full E2E) before its PR.
- Restricted-user fixtures land with the engine introspection slices (F092-F095) in
  docker-compose init + `@qyre/testing`, so permission behavior is integration-tested from the
  start, not mocked.
- Exit gate (F121): Playwright role-matrix suite - for each engine, a read-only session shows zero
  write affordances and every mutating API path returns a clean rejection; a writable session can
  edit a row, run a write statement, create/drop a table (engines where applicable) end-to-end.

## Risks and blockers

- **Introspection accuracy** (RLS, column grants, definer views): mitigated by decision 1 -
  advisory UI, authoritative DB, friendly denial mapping (F120).
- **SQLite ALTER limitations**: column drop/rename/retype needs the documented 12-step rebuild
  pattern; F111 owns it behind the same `ddl` namespace; F109's spec fixes semantics first.
- **MongoDB divergence**: no SQL, no schema DDL for columns; its `ddl` surface is
  collections + indexes + `_id`-keyed mutations. Fake relational metadata debt (tech-debt tracker
  2026-07-04) stays deferred but must not silently gate mutations - the grid keys on real PK/`_id`.
- **Safety regressions for read-only users**: F097's e2e guard lands before any write UI exists
  and every later slice keeps it green; `--read-only` guard (F096) is one choke point, not
  per-route logic.
- **Contract churn across 4 drivers**: phases add one namespace at a time; conformance cases are
  the drift alarm.

## Open decisions

- Whether `ConnectionCapabilities` travels inside `GET /api/overview` (extends existing
  `capabilities`) or as a separate `GET /api/capabilities` - decide in F090's spec pass; leaning
  extended-overview to keep the connect flow single-round-trip.
- Commit endpoint shape (single `/api/mutations/commit` vs per-table): decide in F098's spec.
- Type catalog exposure for the table designer (static per-adapter list vs introspected): decide
  in F109's spec.

## Progress log

- 2026-07-10: Plan created after full-codebase analysis; F090-F121 queued as `not_started` in
  `docs/FEATURES.json`. No implementation started.
