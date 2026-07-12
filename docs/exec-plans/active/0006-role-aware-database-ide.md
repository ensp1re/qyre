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
- 2026-07-10 (later still): F091 implemented (PR #96) - `ConnectionCapabilities`/`TablePermissions`
  land in `@qyre/core`; `DatabaseAdapter.getCapabilities()` lands in the contract, stubbed
  read-only on all four adapters via a shared `stubReadOnlyCapabilities` helper until F092-F095
  introspect real values; `GET /api/overview` returns the full shape; `apps/web` gets a shared
  `useCapabilities` hook in `features/connection` for later write-UI gating. No visible UI change.
  F123 (batched introspection) is next.
- 2026-07-10 (later still): F123 implemented (PR #98) - `DatabaseAdapter.getAllTables()` lands;
  `GET /api/tables` calls it directly instead of `getOverview()` + `Promise.all(getTable)`.
  Postgres/MySQL batch columns/PK/FK/indexes/row-counts into a few set-based queries (MySQL uses a
  `UNION ALL` exact count rather than the originally-suggested `TABLE_ROWS` estimate, to keep exact
  parity with `getTable()` and avoid staleness-driven conformance flakiness - a deliberate
  deviation from this entry's literal text). SQLite/MongoDB have no cross-table catalog query, so
  they move the fan-out into a bounded sequential loop inside the adapter instead. F124 (table/view
  `kind`) is next.
- 2026-07-10 (later still): F124 implemented (PR #99) - `TableMetadata.kind` lands. Found and fixed
  two real visibility gaps beyond the plan's "views appear as tables" framing: Postgres
  materialized views were entirely invisible (not merely mistagged) since
  `information_schema.tables` has no matview concept - now sourced from `pg_class` directly; SQLite
  views were entirely excluded from every listing (`type = 'table'` only) - now included. Sidebar
  badge deliberately deferred (Schema tab's `TableDetail` already had the data with zero plumbing;
  the sidebar's `SchemaMetadata.tables` is bare strings and would need a much larger type change
  across all 4 adapters plus every test asserting on that shape). F092-F095 (per-engine permission
  introspection, parallelizable) are next.
- 2026-07-10 (later still): F092 implemented (PR #100) - Postgres `getCapabilities()`/per-table
  `TablePermissions` land via `pg_is_in_recovery()`/`default_transaction_read_only`/role
  attributes/`has_table_privilege`, batched per schema. Introspection failure degrades to read-only,
  logged. `qyre_readonly` SELECT-only fixture added. An unplanned refactor (F129, driver
  modularization - each adapter's monolithic `index.ts` split into focused modules) landed outside
  this plan's queue (PR #101/#102) between F092 and F093.
- 2026-07-10 (later still): F093 implemented (PR #103) - MySQL `getCapabilities()`/per-table
  `TablePermissions` land, but via a different mechanism than this entry's literal text specified:
  live testing against MySQL 8.4.10 found `information_schema.ROLE_SCHEMA_GRANTS` doesn't exist and
  `ROLE_TABLE_GRANTS` misses schema-wide (`db.*`) role grants entirely, so introspection instead
  parses the session's own `SHOW GRANTS` output, which MySQL resolves into the merged effective
  grant set (direct, schema-wide, and role-derived) with no version gate needed. `qyre_readonly`
  (SELECT-only) and `qyre_role_writer` (write access only via an active default role - the case the
  original approach would have missed) fixtures added. F094 (SQLite) and F095 (MongoDB) remain,
  parallelizable with each other; F096 is next after both land.
- 2026-07-10 (later still): F094 implemented (PR #104) - SQLite `getCapabilities()`/per-table
  `TablePermissions` land, gated on file/directory OS-writability, `PRAGMA query_only`, and the
  connection's own open mode. Deviates from this entry's literal text the same way F093 did:
  `adapter.ts`'s `connect()` previously force-opened every SQLite connection read-only as Qyre's own
  policy, independent of real file permissions - under that policy the whole feature would have been
  a no-op (permanently read-only regardless of what getCapabilities() computed). `connect()` now
  opens normally (falling back to an explicit read-only open only if that throws outright), making
  the open-mode signal real; `runReadOnlyQuery`'s authoritative backstop moved from the connection's
  open mode to toggling `PRAGMA query_only` around each query, matching how Postgres/MySQL already
  enforce read-only at query time rather than connection-open time. `readOnlyReason` for a
  non-writable SQLite session is now `"connection"`, replacing the F091 stub's `"grants"` (SQLite has
  no grants concept). F095 (MongoDB) is the last of the three parallelizable permission-introspection
  slices; F096 is next after it lands.
- 2026-07-11: F095 implemented (PR #105) - MongoDB `getCapabilities()`/per-collection
  `TablePermissions` land via `db.runCommand({connectionStatus:1, showPrivileges:true})`, mapping
  find/insert/update/remove and createCollection/dropCollection/createIndex/dropIndex actions per
  resource (exact, db-wildcard, cross-db-wildcard, `anyResource`) - all shapes live-verified against
  a real `mongod` by creating read/readWrite/dbAdmin/custom-anyResource users and capturing their
  exact output as fixture data. An unauthenticated connection is full access, matching mongod's real
  default. Narrower in one respect than this entry's literal text, confirmed with the user before
  implementing: MongoDB only enforces role restrictions once authorization is enabled globally on
  the server, and the shared docker-compose/CI container has none at all (every existing Mongo test
  connects anonymously) - enabling auth to test a live restricted fixture would have required
  migrating every existing Mongo test/fixture to credentials, a disproportionate blast radius versus
  F092-F094's purely additive restricted fixtures. Restricted-access scenarios are instead covered by
  unit tests against the live-verified `connectionStatus` shapes. `supportsDatabaseManagement`/
  `supportsTransactions` stay always-false for MongoDB (no paired create/drop-database privilege; real
  transactions need replica-set topology a standalone `mongod` can't provide regardless of grants) -
  out of scope for a privilege-only slice. All four per-engine introspection slices (F092-F095) are
  now done; F096 (`--read-only` CLI flag + central server guard) is next.
- 2026-07-11 (later): F096 implemented (PR #106) - the CLI's `--read-only` flag forces the whole
  session read-only; `ServerContext.readOnly` persists across `POST /api/connect`'s adapter swap
  since that route never touches it; `GET /api/overview`'s capabilities are overridden after the
  adapter's own introspection resolves (`applyReadOnlyOverride`) to every `supports*` `false` /
  `readOnlyReason: "qyre-flag"` - a hard, Qyre-level ceiling proven to win even over a fake adapter
  reporting full writability. `packages/server/src/plugins/read-only-guard.ts` is the single
  central choke point every future mutating route must register under via a Fastify route-config
  flag (`config: { mutating: true }`, checked in a shared `preHandler`) - a no-op today, tested by
  registering throwaway routes against the built app since no real mutating route exists yet. Minor
  deviation from this entry's literal text: the spec's "without even running the introspection
  queries" optimization isn't pursued (would need every adapter's `getOverview()` reshaped for a
  local-only tool's marginal query-cost saving) - the override applies to the already-computed
  result instead, identical from every caller's perspective. Documented in `docs/SECURITY.md`. F097
  (permission-aware UI shell) is next - the last slice before any write feature (F099+) can start.
- 2026-07-11 (later still): F097 implemented (PR #107) - `StatusBar` gains a read-only/read-write
  access badge wired from the F091 `useCapabilities` hook, with a tooltip explaining the reason
  (qyre-flag/replica/connection/grants, mirroring the spec's example copy). New
  `features/connection/model/capability-gates.ts` exports `sessionAllows`/`tableAllows` - two
  generic gates, not one per capability flag, since no real write-surface caller exists yet to
  justify more. New `"readonly"` Playwright project connects to the same fully-writable Postgres
  fixture as `"postgres"` but with `--read-only` forced - a deliberate choice over this entry's
  literal "restricted fixture user" wording, since a genuinely restricted role would only re-prove
  F092's grants path, not F096's flag-override path (the actually-new risk surface this slice adds).
  A new regression-guard spec asserts the badge and zero write-affording buttons anywhere in the
  page - the standing check every write slice (F099+) must keep green. Visually verified in the
  Browser pane against the live Postgres preview server. F090-F097 (the full permission/capability
  foundation) are now complete; F098 (row-editing product spec) is next - the first write-feature
  slice and the plan's highest-risk open decision (SQL grid editing vs. MongoDB whole-document EJSON
  editing).
- 2026-07-11 (later still): F098 implemented (PR #108) - `docs/product-specs/row-editing.md` fixes
  `RowMutationApi` (`insertRow`/`updateRowByKey`/`deleteRowsByKey`, "stale row" `matched`/`deleted`
  semantics) and the three per-op routes' exact shapes under `/api/tables/:schema/:table/rows`; row
  identity/editability rules (full PK incl. composite keys, `kind`-gated, structured/binary/unknown
  columns excluded) fully derivable from existing types with no new field added; value validation
  reusing F082/F089's `FilterColumnKind` classification rather than a parallel one. Resolved open
  decision 5: a single `POST /api/mutations/commit`, not per-table - validates every staged op up
  front, one native transaction, all-or-nothing rollback reporting the failing op's index,
  registered for every engine but cleanly `400`s for MongoDB. Resolved open decision 1 (the plan's
  highest-risk decision): MongoDB's document editor uses relaxed Extended JSON via `bson`'s `EJSON`
  (deliberately not the read-only grid's own display format, which is ambiguous by design for
  readability, and not Compass's non-JSON shell-helper syntax) and whole-document
  `findOneAndReplace` with a load-time-snapshot conflict check on save (not a changed-fields diff,
  matching the "Compass model" the exec plan names) - both reasoned explicitly in the spec. Fixed
  the audit-event contract (EventLog line + structured pino `request.log` call per mutation) and
  per-action confirmation thresholds. Spec-only slice, no code changes; F099 (structured row
  insert, the first slice that actually implements a write path) is next.
- 2026-07-11 (later still): F099 implemented (PRs #109/#110) - adapters gain `mutations.insertRow`
  per the F098 spec. Postgres/MySQL/SQLite take a flat column->value map translated to a
  parameterized `INSERT`: MySQL re-fetches the inserted row via its auto-increment column when
  `information_schema.COLUMNS.EXTRA` reports one, SQLite via the implicit `rowid` every ordinary
  table has (both syntaxes for an all-default-values insert - MySQL's `INSERT INTO t () VALUES ()`,
  SQLite's `INSERT INTO t DEFAULT VALUES` - live-verified against real engines before use, not
  assumed). MongoDB deserializes the request body as relaxed Extended JSON to real BSON via `bson`'s
  `EJSON.deserialize` (not `.parse` - Fastify has already JSON-parsed the body into an object with
  `$oid`/`$date` wrapper sub-objects, so the "already-an-object" variant is the correct one) before
  `insertOne`. The server adds `POST /api/tables/:schema/:table/rows`, validating the body against
  the table's real introspected columns by reusing F082/F089's `FilterColumnKind` classification
  (not a parallel validator), rejecting non-table/collection targets (F124) and missing insert
  permission (fails closed on undefined permissions - the advisory-introspection principle), gated
  by the F096 central read-only guard, and logging a structured audit event. Amended the F098 spec
  mid-implementation: `RowMutationApi`'s three methods are each independently optional
  (`insertRow?`/`updateRowByKey?`/`deleteRowsByKey?`), not all required together, since the original
  wording would have forced implementing all three in one slice and contradicted the plan's own
  F099/F100/F101 split. Also fixed a latent bug found while writing SQLite's rejection test: its
  `mutations.insertRow` used `Promise.resolve(insertRow(...))`, which let a synchronous throw (e.g.
  writing a readonly-opened file) escape as an uncaught exception instead of a promise rejection,
  unlike the other three adapters' already-`async` `insertRow` - fixed by making the wrapper itself
  `async`. Conformance cases cover successful insert plus an unknown-column rejection across all
  four engines; each adapter's own integration test covers its engine-specific rejection (Postgres/
  MySQL: a SELECT-only fixture role/user; SQLite: a chmod-read-only file copy; MongoDB: a native
  view-namespace write refusal - Postgres/MySQL's simple auto-updatable views would otherwise accept
  the insert at the adapter layer, so their view rejection is enforced by the server's kind check
  instead, unit-tested separately). F100 (structured row update) is next.
- 2026-07-11 (later still): F100 implemented (PR #112) - adapters gain `mutations.updateRowByKey`.
  Postgres/MySQL/SQLite translate a full primary-key match plus a `changes` map into a parameterized
  `UPDATE`, reporting `matched` (0 or 1) from the driver's own row-count. Live-verified that MySQL's
  `affectedRows` and SQLite's `changes()` both already report "rows matched", not "rows whose value
  actually changed" (mysql2's pool defaults to `CLIENT_FOUND_ROWS`, unlike the raw `mysql` CLI
  client) - a same-value update correctly reports `matched: 1`, not a false stale/conflict. MongoDB
  replaces the whole document (`findOneAndReplace` keyed on `_id`, the "Compass model", not a
  changed-fields `$set`) after EJSON-deserializing the request body - a field absent from the
  replacement is genuinely removed, not merely left untouched. Server adds `PATCH
/api/tables/:schema/:table/rows`: `resolveKey` validates the full primary key is supplied
  (rejecting tables with no primary key at all), `resolveUpdateChanges` rejects primary-key columns
  in the changes map and empty change sets - both reusing the same `FilterColumnKind` coercion
  `insertRow`'s validation already established. A `matched: 0` result is reported as `409`, never a
  silent `200` - the row may have been changed or removed since it was loaded. F101 (structured row
  delete) is next.
- 2026-07-11 (later still): F101 implemented (PR #113) - adapters gain `mutations.deleteRowsByKey`.
  Each engine deletes by an explicit list of primary-key matches, never a filter-evaluated bulk
  delete. Postgres/MySQL/SQLite run one parameterized `DELETE` per key and sum the affected-row
  counts into `deleted`; MongoDB runs a single `deleteMany({ _id: { $in: [...] } })`. Server adds
  `DELETE /api/tables/:schema/:table/rows`: `resolveKeys` validates every key via the same
  `resolveKey` full-primary-key-match logic F100 established, rejecting an empty keys array
  outright. A `deleted` count lower than the requested key count is reported as `409`, never a
  silent `200`. F102 (batch commit) is next.
- 2026-07-11 (later still): F102 implemented (PR #114) - adapters gain `mutations.commitBatch`
  (Postgres/MySQL/SQLite only; MongoDB deliberately excluded - its document editor saves
  per-document, per decision 5). Runs an ordered array of staged insert/update/delete ops in one
  native transaction on a single checked-out connection, all-or-nothing - a stale update
  (`matched: 0`) or delete (`deleted < keys.length`) rolls back and reports that op's index, same
  treatment a native constraint-violation error gets. Postgres/MySQL use
  `pool.connect()`/`getConnection()` plus `BEGIN`/`COMMIT`/`ROLLBACK`; SQLite reuses
  better-sqlite3's synchronous `db.transaction()` wrapper, which already rolls back and re-throws on
  any exception. Server adds `POST /api/mutations/commit`: validates every op against its own
  table's real columns/permissions/kind up front (`resolveBatchOp`, reusing the exact per-op
  `resolve*` helpers F099-F101 already established) before the transaction starts, registered for
  every engine but responds `400` for MongoDB explaining documents save individually there. F103
  (SQL editable grid) is next - the last row-editing slice before F104/F105's insert/delete UI.
- 2026-07-12: F103 implemented (PR #115) - the Rows table becomes an editable grid on SQL engines.
  Double-click or Enter starts inline cell editing with a type-aware widget (text/number/boolean/
  date/time/datetime) reusing F082/F089's filter value controls (`EditableCell`,
  `packages/ui/src/data-grid/editable-cell.tsx`); edits stage into a client-side pending-changes
  buffer keyed by primary key (`usePendingChanges`,
  `apps/web/src/features/table/model/pending-changes.ts`) so they survive pagination/sort/filter
  changes, without touching the server - commit wiring to F102's batch endpoint is F105. Dirty cells
  get amber styling and a revert control; a "Read-only" badge surfaces why editing is unavailable
  when it is. Editability (`computeTableEditability`,
  `apps/web/src/features/table/model/editability.ts`) is derived entirely from existing
  capabilities/permissions/kind data - no new backend field - and gates closed for MongoDB, views/
  materialized views, tables without a primary key, and read-only sessions/tables. Moved
  `capability-gates.ts` out of the `connection` feature into `shared/lib/capabilities/`, since it's
  now consumed by the `table` feature too and the web-structure check forbids feature-to-feature
  imports. F104 (permission-gated Add-row/Duplicate-row UI) is next.
- 2026-07-12 (later): F104 implemented (PR #117) - extends the pending-changes buffer with staged
  new-row drafts. "Add row" opens a blank draft with a type-aware input per insertable column
  (primary key included this time, unlike update's `editableColumns` - a new row's key must be
  supplied unless the engine auto-generates it); "Duplicate row" pre-fills a draft from the
  selected row's insertable columns, primary-key columns excluded, since a duplicate proposing an
  exact copy of another row's key would just collide on insert. Both are hidden entirely (not
  disabled) when the session/table can't insert - `computeTableEditability` gained
  `canInsert`/`insertReason`/`insertableColumns`, gated on `TablePermissions.insert` independently
  of update permission (a session can have one without the other). A column the user never touches
  in a draft is simply omitted from the staged `values` map, letting the engine apply its own
  default/auto-generated value on commit rather than the UI guessing one. New `NewRowCell`
  component (`packages/ui/src/data-grid/new-row-cell.tsx`) reuses `EditableCell`'s `widgetFor` so a
  column's insert editor matches its update editor exactly - always in an editing state, unlike
  `EditableCell`, since a fresh draft has no prior value to revert toward. F105 (the pending-changes
  workflow's remaining piece - staged deletion from selection plus the commit bar) is next.
- 2026-07-12 (later still): F105 implemented (PR #118) - completes the SQL pending-changes
  workflow. Selected rows can be staged for deletion via an explicit "Delete N selected" confirming
  click, distinct from mere selection, matching the spec's requirement that delete always needs its
  own confirmation beyond the buffer/commit review; staging a delete clears any staged cell edit for
  that row. A new `CommitBar` (packages/ui) shows staged insert/update/delete counts with an
  expandable generated-statement preview (display-only, never the real query sent to the driver).
  Commit runs through F102's batch endpoint (`POST /api/mutations/commit`); a mid-batch rollback
  (`409`) surfaces the failing operation's index, highlighted in the preview, and preserves the
  whole buffer so work is never lost. `computeTableEditability` gains `canDelete`, gated on
  `TablePermissions.delete` independently of update/insert. New commit-preview model
  (`apps/web/src/features/table/model/commit-preview.ts`) builds the ordered `MutationOp[]` request
  body and a human-readable SQL preview per op from the buffer's staged state. F125 (MongoDB
  whole-document editor) is next - the last row-editing UI slice before Phase C.
- 2026-07-12 (later still): F125 implemented (PR pending) - MongoDB's whole-document Extended JSON
  editor. Relaxed Extended JSON (`bson`'s `EJSON.stringify`/`deserialize` with `relaxed: true`) is
  the wire format - `ObjectId` as `{"$oid":...}`, `Date` as `{"$date":...}` - deliberately not the
  read-only grid's own lossy display format. Save performs a whole-document replace via
  `findOneAndReplace` (the Compass model), not a changed-fields `$set` - a field absent from the
  replacement is genuinely removed. Lost-update protection: the editor captures the full document at
  load time; on save the server re-fetches the current document and compares it to the captured
  original, rejecting as `matched: 0` (the same `409` treatment a stale key gets) if they differ -
  `RowMutationApi.updateRowByKey` gained an optional `expectedOriginal` parameter and
  `updateRowRequestSchema` gained `originalDocument` to carry it. New MongoDB-only
  `GET /api/tables/:schema/:table/document/:id` route serves fresh, unambiguous EJSON text - the
  editor never reuses the grid's own already-fetched, lossy row data. Insert-document and
  delete-document reuse the existing F099/F101 per-op routes directly, not F102's batch-commit
  endpoint (which excludes MongoDB) - the first `apps/web` feature to call the per-op routes
  directly from the frontend. Delete-document requires typed confirmation (the exact `_id` hex
  string) before the Delete button enables, stronger than the SQL grid's plain click-to-stage
  confirmation, since a whole-document delete is irreversible with no buffer/undo. Found and fixed a
  real production bug during implementation: `bson`'s package `exports` field ships two separate
  compiled files (`bson.node.mjs` for ESM importers, `bson.cjs` for CJS requirers), each defining
  its own independent `ObjectId`/`Date` classes - `mongodb` (CJS) and `@qyre/mongodb` (ESM)
  therefore resolve different `bson` module instances, so a value the driver returns is never
  `instanceof` the class `EJSON.deserialize` constructs even for byte-identical data, which would
  have made every document save falsely report a stale-document conflict. Fixed by comparing
  `EJSON.stringify(...)` string output on both sides instead of object instances - `EJSON`'s own
  `_bsontype`-tag-based duck-typing correctly recognizes foreign-module BSON instances, unlike
  `instanceof`. `pnpm check:quiet` and `pnpm verify:pr` both green (full local gate incl.
  Docker-backed `@full` E2E, first run). All row-editing UI slices (F103-F105, F125) are now done;
  Phase C's remaining `not_started` entries in `docs/FEATURES.json` (starting with F106, the SQL
  statement classifier) are next.
