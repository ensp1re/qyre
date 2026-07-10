# Plan 0006: Role-Aware Database IDE (read-only MVP -> full IDE)

Status: Planned - no slice started. Revised 2026-07-10 after a second-pass adversarial
review (code audit + market research); see "Second-pass revisions" below.
Owner: unassigned
Linked features: F090-F128 (`docs/FEATURES.json`)

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
     (Postgres RLS, column grants, MySQL roles) are invisible to coarse introspection. Engine
     "permission denied" errors must map to friendly, actionable messages (F120), never crashes.
     Introspection failure degrades to read-only, never assumed-writable.
2. **The local server gets real authentication before any mutating route exists (F122).**
   Today `packages/server` has no auth at all: the Host-header guard (F025) stops DNS rebinding,
   but any local process/user can call every API, and cross-origin CSRF is blocked only implicitly
   by Fastify's JSON content-type requirement. Before write routes land, the CLI mints a random
   per-session bearer token, embeds it in the served UI, and every `/api` route requires it
   (`pgweb`/`DbGate` precedent for local web DB tools). Security headers (CSP, X-Frame-Options,
   nosniff) land with it - CSP also neutralizes DB-data-driven exfil via the F086 image previews.
3. **Contract grows by optional capability namespaces, not engine branches.**
   `DatabaseAdapter` gains required `getCapabilities()` plus optional namespaces:
   `mutations?: RowMutationApi`, `ddl?: SchemaDdlApi`, `admin?: DatabaseAdminApi`. Namespace
   absent = the engine cannot do it; namespace present but grants missing = the user cannot do it.
   The server gates on both (defense in depth). No `engine === "x"` branching outside adapters.
4. **Row mutations are structured operations, not browser-built SQL** (the F072 filter pattern).
   Row identity requires a primary key (MongoDB: `_id`); tables without one are read-only in the
   grid, with the reason surfaced. **SQL engines and MongoDB get different editing surfaces**:
   SQL engines get grid editing (flat column -> value maps, parameterized SQL); MongoDB gets a
   document editor (whole-document Extended JSON round-trip, Compass model) because flat cell
   edits cannot express nested documents and the display pipeline already serializes BSON types
   (dates as ISO strings, F081) - naive round-tripping would corrupt them.
5. **Pending-changes buffer with explicit commit** (TablePlus model): SQL grid edits/inserts/
   deletes stage locally, show a preview of the generated statements, and apply via one batch
   commit endpoint - transactional (all-or-nothing) on Postgres/MySQL/SQLite. MongoDB document
   edits save per-document with confirmation (Compass model) rather than batching.
6. **SQL editor write path via statement classification.** A shared `classifyStatement`
   (driver-contract, generalizing `assertReadOnly`'s scanner) labels statements
   read / mutation / ddl / destructive. Destructive classes (DROP/TRUNCATE/DELETE-or-UPDATE-
   without-WHERE) require an explicit confirmed round-trip the server enforces. **The write path
   must bypass Postgres's `coerceUnknownQuotedIdentifiers` rewrite** - that DWIM coercion is safe
   for reads but must never silently alter a mutation's SQL.
7. **Qyre-level read-only mode stays first-class.** `--read-only` CLI flag forces today's behavior
   regardless of database grants, enforced by one central server guard (single choke point all
   mutating routes pass through), with a visible UI badge.
8. **Every mutation is audited** in the EventLog/Console (operation, target, row counts, duration,
   outcome) AND through the server's structured pino logger, so the audit trail survives the
   EventLog's 200-entry in-memory cap in the terminal scrollback. No off-machine telemetry.
9. **Tables and views are distinct kinds (F124).** All three SQL drivers currently read
   `information_schema.tables` with no `table_type` filter, so views appear as editable "tables".
   `TableMetadata` gains a `kind` (`table | view | materialized-view | collection`); editing and
   DDL gate on `kind === "table"`/`"collection"`; views render read-only with a badge.
10. **Introspection is batched before it is multiplied (F123).** `GET /api/tables` currently
    fans out `getTable` per table (>= 4 catalog queries each, unbounded `Promise.all`) - already
    slow on large databases, and per-table permission checks would multiply it. Adapters gain a
    batched all-tables metadata path (one/few catalog queries per engine) that F092-F095 attach
    permissions to.
11. **No rewrite.** Existing routes, adapters, UI features, and the read-only enforcement stack
    stay as-is for read paths. All work is additive; the only refactors are extracting
    `classifyStatement`, extending `AdapterCapabilities`, and the batched introspection path.

## Per-engine permission introspection matrix

| Engine   | Session tier                                                                                                                             | Per-table tier                                                                                                                                                                                     | Restricted fixture                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Postgres | `pg_is_in_recovery()`, `default_transaction_read_only`, role attrs (`pg_roles`), `has_database_privilege`/`has_schema_privilege(CREATE)` | `has_table_privilege(current_user, t, 'SELECT/INSERT/UPDATE/DELETE')` batched per schema (works for views too)                                                                                     | `qyre_readonly` user, SELECT-only grants         |
| MySQL    | `@@global.read_only`, `@@session.transaction_read_only`, `information_schema.USER_PRIVILEGES`/`SCHEMA_PRIVILEGES`                        | Union of `TABLE_PRIVILEGES` + schema/user-level grants **+ role grants** (`ROLE_TABLE_GRANTS`, 8.0.19+, or `SHOW GRANTS ... USING`) - plain `TABLE_PRIVILEGES` misses privileges granted via roles | `qyre_readonly` user, SELECT-only grants         |
| SQLite   | file + directory writability (WAL/journal need dir write), `PRAGMA query_only`, read-only open flag                                      | uniform: whole file is writable or not                                                                                                                                                             | read-only file copy / `?mode=ro` target          |
| MongoDB  | `connectionStatus{showPrivileges:true}` -> authenticatedUserPrivileges action sets; unauthenticated local = full access                  | map `find/insert/update/remove` actions per db/collection resource                                                                                                                                 | user with built-in `read` role on the fixture db |

## Feature order and dependencies

- **Phase A - security + capability foundation: F122 (session token + security headers, first -
  protects even the read-only product) -> F090 (spec) -> F091 (capability plumbing) -> F123
  (batched introspection) -> F124 (table kinds) -> F092/F093/F094/F095 (per-engine introspection +
  restricted fixtures, parallelizable) -> F096 (`--read-only` + central guard) -> F097
  (permission-aware UI shell + e2e guard).**
- **Phase B - row editing: F098 (spec) -> F099 (insert) -> F100 (update) -> F101 (delete) ->
  F102 (batch commit) -> F103 (SQL editable grid) -> F104 (insert/duplicate UI) -> F105 (delete +
  commit bar UI) -> F125 (MongoDB document editor).**
- **Phase C - SQL editor: F106 (classifyStatement) -> F107 (runQuery + server confirmation
  contract) -> F108 (editor UI) -> F127 (column-level autocomplete, read-only-safe) -> F126
  (query cancellation + long-op handling).** Depends on Phase A only; can interleave with B.
- **Phase D - schema editing: F109 (spec) -> F110 (table lifecycle) -> F111 (column ops) ->
  F112 (indexes) -> F113 (table designer UI) -> F114 (structure tab UI).** All DDL gates on
  `kind` (F124).
- **Phase E - admin and data flows: F115 (database/schema lifecycle) -> F116 (database mgmt UI)
  -> F117 (CSV import; needs F099) -> F118 (JSON/SQL export + single-pass streaming export fix)
  -> F128 (EXPLAIN viewer, read-only-safe) -> F119 (roles/grants viewer).**
- **Phase F - hardening: F120 (denial mapping + capability refresh) -> F121 (full role-matrix
  E2E incl. auth-token assertions + docs consolidation).** F121 is the plan's exit gate.

Every adapter-facing slice ships `@qyre/testing-conformance` cases across all four engines
(cross-engine parity rule, AGENTS.md), explicitly stating not-applicable engines. Every slice ends
with `pnpm verify:pr` and a PR per the standard delivery workflow.

## Scope and out-of-scope

In scope: everything in F090-F128. Out of scope - deliberate, each with a reason, revisit after
F121:

- **Editable SQL-query results** (Beekeeper/DataGrip have it): mapping arbitrary SELECT results
  back to base-table row identity is complex and error-prone; the editable grid covers the
  workflow. Revisit only with real demand.
- **Manual transaction sessions in the editor** (BEGIN held across requests): requires sticky
  per-browser-session connections on the pooled server - high complexity, low local-tool value;
  the batch commit endpoint covers the atomicity use case.
- **SSH tunnels**: `ssh -L` composes with `qyre` today; a bundled tunnel manager is a large
  dependency surface. TLS URL parameters pass through to each driver already.
- **Multiple query consoles/tabs, saved snippets**: history + Files tab cover most of it for a
  single-connection local tool; workspace-state redesign not justified yet.
- A MongoDB query/aggregation editor (`supportsSql` stays false), user/role _management_ (F119 is
  a viewer), multi-connection simultaneous sessions, stored-procedure editing, `--demo` mode
  (tech-debt tracker), collaborative/remote features (violates local-first).

## Verification path

- Per-slice: the feature's `verification` command, then `pnpm verify:pr` before its PR.
- Restricted-user fixtures land with the engine introspection slices (F092-F095) in
  docker-compose init + `@qyre/testing`, so permission behavior is integration-tested, not mocked.
- Exit gate (F121): Playwright role-matrix suite - per engine, a read-only session shows zero
  write affordances and every mutating API path returns a clean rejection (with and without a
  valid session token); a writable session edits+commits a row (SQL grid or Mongo document), runs
  a write statement through destructive confirmation, and creates+drops a table where applicable.

## Risks and blockers

- **Introspection accuracy** (RLS, column grants, MySQL roles, definer views): mitigated by
  decision 1 - advisory UI, authoritative DB, friendly denial mapping (F120).
- **better-sqlite3 is synchronous**: a long SQLite statement blocks the whole Node event loop
  (health checks, every other request) and cannot be cancelled in-thread. F126 must either run
  SQLite work on a worker thread or explicitly document SQLite as non-cancellable with bounded
  statement patterns; large imports/table rebuilds (F111, F117) must chunk their work.
- **MongoDB BSON fidelity**: display values are already serialized (ObjectId -> hex, Date -> ISO
  string); naive edit round-trips would corrupt types. F125's document editor works in Extended
  JSON with server-side EJSON parse/serialize; F098's spec fixes the exact format (relaxed vs
  canonical) and the changed-fields-vs-replace semantics.
- **SQLite ALTER limitations**: column retype/constraint changes need the documented rebuild
  pattern (`PRAGMA foreign_keys=OFF`, rebuild, `PRAGMA foreign_key_check`); F111 owns it; F109's
  spec fixes semantics first. Native ADD/RENAME/DROP COLUMN (3.35+) used where possible.
- **Safety regressions for read-only users**: F097's e2e guard lands before any write UI exists
  and every later slice keeps it green; F096's guard is one choke point, not per-route logic.
- **CSV export currently re-runs the query per page (OFFSET pagination)** - O(n^2) on large
  tables; F118 replaces the export path with single-pass streaming (cursor/stream per engine).
- **Contract churn across 4 drivers**: phases add one namespace at a time; conformance cases are
  the drift alarm.

## Open decisions (ranked by risk)

1. **MongoDB document-edit semantics** (F098/F125): changed-fields `findOneAndUpdate` vs
   whole-document replace, and relaxed vs canonical EJSON in the editor. Wrong choice silently
   corrupts data types - decide in F098's spec with live Compass comparison.
2. **SQLite execution isolation** (F126): worker thread (real cancellation, more moving parts) vs
   documented non-cancellable (simple, but one bad query freezes the server). Decide in F126 with
   a spike; leaning worker thread for writes only.
3. **Token transport** (F122): cookie (needs SameSite/CSRF care) vs Authorization header from the
   SPA (breaks plain `<a download>` links - export URLs need token query params or fetch+blob).
   Decide in F122; leaning header + fetch-based downloads.
4. Whether `ConnectionCapabilities` travels inside `GET /api/overview` or a separate endpoint -
   decide in F090's spec; leaning extended overview (single round-trip).
5. Commit endpoint shape (single `/api/mutations/commit` vs per-table) - decide in F098's spec.
6. Type catalog exposure for the table designer (static per-adapter list vs introspected) -
   decide in F109's spec.

## Second-pass revisions (2026-07-10)

An adversarial review (code audit + market research: TablePlus, DataGrip, Beekeeper, pgweb,
DbGate, MongoDB Compass) found and fixed these first-pass gaps:

- Added F122 (server auth + security headers) - the no-auth local server was the largest missed
  risk; write features without it would let any local process mutate the connected database.
- Added F123 (batched introspection) and F124 (table kinds) - `/api/tables`' per-table fan-out
  and the views-as-tables conflation were unhandled foundations the write stage would trip over.
- Split MongoDB editing out of the SQL grid model into F125 (document editor) - flat cell edits
  cannot express nested documents and would corrupt serialized BSON types.
- Added F126 (query cancellation), F127 (column autocomplete), F128 (EXPLAIN viewer) - table-
  stakes IDE capabilities the first pass omitted.
- Hardened existing entries: F093 (MySQL role grants), F107 (bypass the Postgres identifier
  coercion on writes), F109/F110/F114 (kind-gated DDL), F117 (upload caps), F118 (single-pass
  streaming), F121 (token assertions).

## Progress log

- 2026-07-10: Plan created after full-codebase analysis; F090-F121 queued as `not_started`.
- 2026-07-10 (later): Second-pass adversarial review revised the plan: added F122-F128, rewrote
  Phase B's MongoDB model, reordered Phase A to lead with security hardening. No implementation
  started.
- 2026-07-10 (later still): F122 implemented (PR #94) - session-token auth on every `/api/*`
  route, CSP/nosniff/X-Frame-Options on every response. Token transport (open decision #3) resolved
  as Authorization header for `fetchJson` plus a `?token=` query param for the CSV export's plain
  `<a href>` download. First Phase A slice done; F090 is next.
- 2026-07-10 (later still): F090 implemented (PR #95) -
  `docs/product-specs/permissions-and-capabilities.md` fixes `ConnectionCapabilities`/
  `TablePermissions`'s exact shape, the per-engine introspection matrix, and the advisory/
  authoritative principle. Resolved open decision #4: `ConnectionCapabilities` rides
  `GET /api/overview`, not a new endpoint. Spec-only slice; F091 implements the types next.
